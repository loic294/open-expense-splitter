import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import { normalizeEmail, buildInviteUrl } from "../utils/normalize";
import { createId } from "../utils/id";

export function createPlatformInvitesRouter({
  db,
  frontendBaseUrl,
}: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/platform-invites/:token", async (c) => {
    try {
      requireAuth(c);
      const token = c.req.param("token");
      const invite = await db
        .prepare(
          `SELECT pi.id, pi.email, pi.status, pi.created_at,
              inviter.id AS inviter_id, inviter.email AS inviter_email, inviter.name AS inviter_name
       FROM platform_invites pi
       JOIN users inviter ON inviter.id = pi.inviter_user_id
       WHERE pi.token = ? LIMIT 1`,
        )
        .bind(token)
        .first<Record<string, unknown>>();
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      return c.json({
        ...invite,
        invitePath: `/invites/platform/${token}`,
        inviteUrl: buildInviteUrl(
          `/invites/platform/${token}`,
          frontendBaseUrl,
        ),
      });
    } catch (err) {
      console.error("[GET /api/platform-invites/:token] Error:", {
        token,
        error: err,
      });
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

  router.post("/api/platform-invites/:token/accept", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const token = c.req.param("token");
      const invite = await db
        .prepare(
          "SELECT id, inviter_user_id, email, status FROM platform_invites WHERE token = ? LIMIT 1",
        )
        .bind(token)
        .first<{
          id: string;
          inviter_user_id: string;
          email: string | null;
          status: string;
        }>();
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      if (invite.status !== "pending")
        return c.json({ error: "Invite is no longer pending" }, 409);
      if (invite.inviter_user_id === userId)
        return c.json({ error: "You cannot accept your own invite" }, 400);

      const currentUser = await db
        .prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
        .bind(userId)
        .first<{ id: string; email: string }>();
      if (!currentUser) return c.json({ error: "Current user not found" }, 404);
      if (invite.email && normalizeEmail(currentUser.email) !== invite.email)
        return c.json(
          { error: "This invite was issued for another email" },
          403,
        );

      await db.batch([
        db
          .prepare(
            `UPDATE platform_invites
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
            "platform_invite",
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
            "platform_invite",
          ),
      ]);
      return c.json({
        message: "Invite accepted",
        inviterUserId: invite.inviter_user_id,
        acceptedByUserId: userId,
      });
    } catch (err) {
      console.error("[POST /api/platform-invites/:token/accept] Error:", {
        token,
        error: err,
      });
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
