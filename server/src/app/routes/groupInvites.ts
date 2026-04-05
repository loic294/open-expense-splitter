import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import { normalizeEmail, buildInviteUrl } from "../utils/normalize";
import { createId } from "../utils/id";
import { replaceTemporaryMemberWithUser } from "../db/members";

export function createGroupInvitesRouter({ db, frontendBaseUrl }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/group-invites/:token", async (c) => {
    try {
      requireAuth(c);
      const token = c.req.param("token");
      const invite = await db
        .prepare(
          `SELECT gmi.id, gmi.email, gmi.status, gmi.created_at,
              b.id AS group_id, b.name AS group_name, b.emoji AS group_emoji,
              inviter.id AS inviter_id,
              inviter.email AS inviter_email,
              inviter.name AS inviter_name
       FROM group_member_invites gmi
       JOIN batches b ON b.id = gmi.batch_id
       JOIN users inviter ON inviter.id = gmi.inviter_user_id
       WHERE gmi.token = ? LIMIT 1`,
        )
        .bind(token)
        .first<Record<string, unknown>>();
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      return c.json({
        ...invite,
        invitePath: `/invites/group/${token}`,
        inviteUrl: buildInviteUrl(`/invites/group/${token}`, frontendBaseUrl),
      });
    } catch (err) {
      return c.json(
        {
          error: isUnauthorizedError(err)
            ? "Unauthorized"
            : "Internal Server Error",
        },
        isUnauthorizedError(err) ? 401 : 500,
      );
    }
  });

  router.post("/api/group-invites/:token/accept", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const token = c.req.param("token");

      const invite = await db
        .prepare(
          `SELECT gmi.id, gmi.batch_id, gmi.inviter_user_id,
              gmi.email, gmi.status, b.id AS group_id, b.owner_id
       FROM group_member_invites gmi
       JOIN batches b ON b.id = gmi.batch_id
       WHERE gmi.token = ? LIMIT 1`,
        )
        .bind(token)
        .first<{
          id: string;
          batch_id: string;
          inviter_user_id: string;
          email: string;
          status: string;
          group_id: string;
          owner_id: string;
        }>();
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      if (invite.status !== "pending")
        return c.json({ error: "Invite is no longer pending" }, 409);

      const currentUser = await db
        .prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
        .bind(userId)
        .first<{ id: string; email: string }>();
      if (!currentUser) return c.json({ error: "Current user not found" }, 404);
      if (normalizeEmail(currentUser.email) !== normalizeEmail(invite.email))
        return c.json(
          { error: "This invite was issued for another email" },
          403,
        );

      await db.batch([
        db
          .prepare(
            `INSERT INTO batch_members (id, batch_id, user_id)
         VALUES (?, ?, ?) ON CONFLICT(batch_id, user_id) DO NOTHING`,
          )
          .bind(`member_${createId()}`, invite.batch_id, userId),
        db
          .prepare(
            `UPDATE group_member_invites
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
          )
          .bind(userId, invite.id),
        db
          .prepare(
            `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
          )
          .bind(
            `contact_${createId()}`,
            invite.inviter_user_id,
            userId,
            "group_invite",
          ),
        db
          .prepare(
            `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
          )
          .bind(
            `contact_${createId()}`,
            userId,
            invite.inviter_user_id,
            "group_invite",
          ),
      ]);

      const matchingTemp = await db
        .prepare(
          `SELECT id FROM batch_temporary_members
       WHERE batch_id = ? AND LOWER(email) = ?
       ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(invite.batch_id, normalizeEmail(invite.email))
        .first<{ id: string }>();
      if (matchingTemp) {
        await replaceTemporaryMemberWithUser(
          db,
          invite.batch_id,
          matchingTemp.id,
          userId,
        );
      }
      return c.json({ message: "Invite accepted", groupId: invite.group_id });
    } catch (err) {
      return c.json(
        {
          error: isUnauthorizedError(err)
            ? "Unauthorized"
            : "Internal Server Error",
        },
        isUnauthorizedError(err) ? 401 : 500,
      );
    }
  });

  return router;
}
