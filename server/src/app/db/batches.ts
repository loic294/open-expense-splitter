import type { D1Database } from "../../platform/sql-adapter";

export async function canAccessBatch(
  db: D1Database,
  userId: string,
  batchId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT b.id FROM batches b
       LEFT JOIN batch_members bm ON b.id = bm.batch_id
       WHERE b.id = ? AND (b.owner_id = ? OR bm.user_id = ?)
       LIMIT 1`,
    )
    .bind(batchId, userId, userId)
    .first();
  return !!row;
}
