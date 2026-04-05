import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import {
  normalizeEmail,
  isValidEmail,
  buildInviteUrl,
} from "../utils/normalize";
import { createId } from "../utils/id";
import { getKnownContacts } from "../db/contacts";

export function createContactsRouter({ db, frontendBaseUrl }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/contacts", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const contacts = await getKnownContacts(db, userId);
      const { results } = await db
        .prepare(
          `SELECT id, email, token, status, created_at, accepted_at
       FROM platform_invites WHERE inviter_user_id = ? ORDER BY created_at DESC`,
        )
        .bind(userId)
        .all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sentInvites = results.map((invite: any) => ({
        ...invite,
        invitePath: `/invites/platform/${invite.token}`,
        inviteUrl: buildInviteUrl(
          `/invites/platform/${invite.token}`,
          frontendBaseUrl,
        ),
      }));
      return c.json({ contacts, sentInvites });
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

  router.post("/api/contacts/invites", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const body = await c.req.json<{ email?: string }>();
      const email = normalizeEmail(body.email);
      if (email && !isValidEmail(email))
        return c.json({ error: "Invalid email address" }, 400);
      const token = createId().replace(/-/g, "");
      const inviteId = `platform_invite_${createId()}`;
      await db
        .prepare(
          `INSERT INTO platform_invites (id, inviter_user_id, email, token, status)
       VALUES (?, ?, ?, ?, 'pending')`,
        )
        .bind(inviteId, userId, email || null, token)
        .run();
      return c.json(
        {
          id: inviteId,
          email: email || null,
          token,
          status: "pending",
          invitePath: `/invites/platform/${token}`,
          inviteUrl: buildInviteUrl(
            `/invites/platform/${token}`,
            frontendBaseUrl,
          ),
        },
        201,
      );
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
