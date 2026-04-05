import type { D1Database } from "../../platform/sql-adapter";
import { createId } from "../utils/id";
import {
  normalizeEmail,
  isValidEmail,
  buildInviteUrl,
} from "../utils/normalize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGroupPendingInvites(
  db: D1Database,
  batchId: string,
  frontendBaseUrl: string,
): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT id, email, token, status, created_at, accepted_at
       FROM group_member_invites
       WHERE batch_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
    )
    .bind(batchId)
    .all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.map((invite: any) => ({
    ...invite,
    invitePath: `/invites/group/${invite.token}`,
    inviteUrl: buildInviteUrl(
      `/invites/group/${invite.token}`,
      frontendBaseUrl,
    ),
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrReuseGroupInvites(
  db: D1Database,
  batchId: string,
  inviterUserId: string,
  inviteEmails: string[],
  frontendBaseUrl: string,
): Promise<any[]> {
  const emails = Array.from(new Set(inviteEmails.map(normalizeEmail))).filter(
    isValidEmail,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = [];
  for (const email of emails) {
    let invite = await db
      .prepare(
        `SELECT id, email, token, status, created_at, accepted_at
         FROM group_member_invites
         WHERE batch_id = ? AND email = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(batchId, email)
      .first<Record<string, unknown>>();

    if (!invite) {
      const token = createId().replace(/-/g, "");
      const id = `group_invite_${createId()}`;
      await db
        .prepare(
          `INSERT INTO group_member_invites
            (id, batch_id, inviter_user_id, email, token, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
        )
        .bind(id, batchId, inviterUserId, email, token)
        .run();
      invite = await db
        .prepare(
          `SELECT id, email, token, status, created_at, accepted_at
           FROM group_member_invites WHERE id = ? LIMIT 1`,
        )
        .bind(id)
        .first<Record<string, unknown>>();
    }

    if (invite) {
      result.push({
        ...invite,
        invitePath: `/invites/group/${invite.token}`,
        inviteUrl: buildInviteUrl(
          `/invites/group/${invite.token}`,
          frontendBaseUrl,
        ),
      });
    }
  }
  return result;
}
