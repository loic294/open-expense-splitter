import type { D1Database } from "../../platform/sql-adapter";
import { parseSplitData } from "../utils/splitData";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSpendingsForBatch(
  db: D1Database,
  batchId: string,
): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, batch_id,
              COALESCE(name, description) AS name,
              details, description, amount, category, currency,
              date AS transaction_date, paid_by_id, split_type, split_data, created_at
       FROM spendings
       WHERE batch_id = ?
       ORDER BY date DESC, created_at DESC
       LIMIT 200`,
    )
    .bind(batchId)
    .all();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.map((s: any) => ({
    ...s,
    split_data: parseSplitData(s.split_data as string | null),
  }));
}
