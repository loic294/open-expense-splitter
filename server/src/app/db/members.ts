import type {
  D1Database,
  D1PreparedStatement,
} from "../../platform/sql-adapter";
import type { TemporaryMemberPayload } from "../types";
import { createId } from "../utils/id";
import { replaceMemberInSplitData } from "../utils/splitData";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBatchTemporaryMembers(
  db: D1Database,
  batchId: string,
): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT tm.id, tm.email, tm.name, NULL AS picture, tm.created_at,
              1 AS is_temporary, tm.email AS temporary_email
       FROM batch_temporary_members tm
       WHERE tm.batch_id = ?
       ORDER BY COALESCE(tm.name, tm.email) ASC`,
    )
    .bind(batchId)
    .all();
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBatchMembers(
  db: D1Database,
  batchId: string,
): Promise<any[]> {
  const { results: realMembers } = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.picture, bm.created_at,
              0 AS is_temporary, NULL AS temporary_email
       FROM batch_members bm
       JOIN users u ON u.id = bm.user_id
       WHERE bm.batch_id = ?`,
    )
    .bind(batchId)
    .all();
  const tempMembers = await getBatchTemporaryMembers(db, batchId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...realMembers, ...tempMembers].sort((a: any, b: any) => {
    const la = (a.name || a.email || "").toLowerCase();
    const lb = (b.name || b.email || "").toLowerCase();
    return la.localeCompare(lb);
  });
}

export async function getBatchMemberIds(
  db: D1Database,
  batchId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await getBatchMembers(db, batchId)).map((m: any) => m.id as string);
}

export async function syncBatchMembers(
  db: D1Database,
  batchId: string,
  memberIds: string[],
  temporaryMembers: TemporaryMemberPayload[],
  actorUserId: string,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM batch_members WHERE batch_id = ?").bind(batchId),
    db
      .prepare("DELETE FROM batch_temporary_members WHERE batch_id = ?")
      .bind(batchId),
    ...memberIds.map((id) =>
      db
        .prepare(
          "INSERT INTO batch_members (id, batch_id, user_id) VALUES (?, ?, ?)",
        )
        .bind(`member_${createId()}`, batchId, id),
    ),
    ...temporaryMembers.map((m) =>
      db
        .prepare(
          `INSERT INTO batch_temporary_members
            (id, batch_id, name, email, created_by_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          m.id || `temp_${createId()}`,
          batchId,
          m.name,
          m.email,
          actorUserId,
        ),
    ),
  ];
  await db.batch(stmts);
}

export async function replaceTemporaryMemberWithUser(
  db: D1Database,
  batchId: string,
  temporaryMemberId: string,
  userId: string,
): Promise<boolean> {
  const exists = await db
    .prepare(
      "SELECT id FROM batch_temporary_members WHERE id = ? AND batch_id = ? LIMIT 1",
    )
    .bind(temporaryMemberId, batchId)
    .first();
  if (!exists) return false;

  const { results: spendings } = await db
    .prepare(
      "SELECT id, split_data FROM spendings WHERE batch_id = ? AND split_data IS NOT NULL",
    )
    .bind(batchId)
    .all<{ id: string; split_data: string | null }>();

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO batch_members (id, batch_id, user_id)
         VALUES (?, ?, ?)
         ON CONFLICT(batch_id, user_id) DO NOTHING`,
      )
      .bind(`member_${createId()}`, batchId, userId),
    db
      .prepare(
        "UPDATE spendings SET paid_by_id = ? WHERE batch_id = ? AND paid_by_id = ?",
      )
      .bind(userId, batchId, temporaryMemberId),
    db
      .prepare("DELETE FROM batch_temporary_members WHERE id = ?")
      .bind(temporaryMemberId),
  ];

  for (const s of spendings) {
    const next = replaceMemberInSplitData(
      s.split_data,
      temporaryMemberId,
      userId,
    );
    if (next !== s.split_data) {
      stmts.push(
        db
          .prepare("UPDATE spendings SET split_data = ? WHERE id = ?")
          .bind(next, s.id),
      );
    }
  }

  await db.batch(stmts);
  return true;
}
