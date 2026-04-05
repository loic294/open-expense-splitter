import type { D1Database } from "../../platform/sql-adapter";
import { createId } from "../utils/id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getKnownContacts(
  db: D1Database,
  userId: string,
): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.picture, uc.created_at
       FROM user_contacts uc
       JOIN users u ON u.id = uc.contact_user_id
       WHERE uc.user_id = ?
       ORDER BY COALESCE(u.name, u.email) ASC`,
    )
    .bind(userId)
    .all();
  return results;
}

export async function filterKnownContactMemberIds(
  db: D1Database,
  ownerId: string,
  requestedIds: string[],
): Promise<string[]> {
  const contacts = await getKnownContacts(db, ownerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const known = new Set(contacts.map((c: any) => c.id as string));
  return requestedIds.filter((id) => id === ownerId || known.has(id));
}

export async function addContactPair(
  db: D1Database,
  userA: string,
  userB: string,
  source = "invite",
): Promise<void> {
  if (!userA || !userB || userA === userB) return;
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      )
      .bind(`contact_${createId()}`, userA, userB, source),
    db
      .prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      )
      .bind(`contact_${createId()}`, userB, userA, source),
  ]);
}
