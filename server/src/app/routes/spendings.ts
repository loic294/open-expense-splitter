import { Hono } from "hono";
import type { HonoCtx, RouteDeps, CsvMapping, CsvImportRow } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import { normalizeCurrency } from "../utils/currency";
import { serializeSplitData } from "../utils/splitData";
import { sanitizeImportRow, parseSplitFromCsv } from "../utils/csvSanitize";
import { createId } from "../utils/id";
import { canAccessBatch } from "../db/batches";
import { getBatchMembers, getBatchMemberIds } from "../db/members";
import { getSpendingsForBatch } from "../db/spendings";
import type { D1PreparedStatement } from "../../platform/sql-adapter";

export function createSpendingsRouter({ db }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/spendings", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.query("batchId");
      if (!batchId) return c.json({ error: "batchId is required" }, 400);
      if (!(await canAccessBatch(db, userId, batchId)))
        return c.json({ error: "Forbidden" }, 403);

      const spendings = await getSpendingsForBatch(db, batchId);
      const { results } = await db
        .prepare(
          `SELECT DISTINCT category FROM spendings
       WHERE batch_id = ? AND category IS NOT NULL AND TRIM(category) != ''
       ORDER BY category ASC`,
        )
        .bind(batchId)
        .all<{ category: string }>();
      return c.json({
        spendings,
        categories: results.map((r) => r.category),
        total: spendings.length,
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

  router.get("/api/spendings/import-mapping", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const row = await db
        .prepare(
          "SELECT mapping_json FROM user_csv_mappings WHERE user_id = ? LIMIT 1",
        )
        .bind(userId)
        .first<{ mapping_json: string }>();
      let mapping: CsvMapping = {};
      if (row?.mapping_json) {
        try {
          const p = JSON.parse(row.mapping_json);
          if (p && typeof p === "object") mapping = p;
        } catch {
          /* ignore parse errors */
        }
      }
      return c.json({ mapping });
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

  router.put("/api/spendings/import-mapping", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const body = await c.req.json<{ mapping?: unknown }>();
      const mapping =
        body.mapping && typeof body.mapping === "object"
          ? (body.mapping as CsvMapping)
          : {};
      await db
        .prepare(
          `INSERT INTO user_csv_mappings (id, user_id, mapping_json)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET mapping_json = excluded.mapping_json, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(`csv_map_${createId()}`, userId, JSON.stringify(mapping))
        .run();
      return c.json({ mapping });
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

  router.post("/api/spendings/import", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const body = await c.req.json<{
        batchId?: string;
        rows?: CsvImportRow[];
        currency?: string;
        paidByIdMapping?: Record<string, string>;
      }>();
      if (!body.batchId) return c.json({ error: "batchId is required" }, 400);
      if (!(await canAccessBatch(db, userId, body.batchId)))
        return c.json({ error: "Forbidden" }, 403);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return c.json({ error: "rows are required" }, 400);

      const importCurrency = normalizeCurrency(body.currency);
      const members = await getBatchMembers(db, body.batchId);
      const paidByIdMapping = body.paidByIdMapping || {};
      const insertedIds: string[] = [];
      let skipped = 0;
      const stmts: D1PreparedStatement[] = [];

      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sanitized = sanitizeImportRow(row, members as any, userId);
        if (!sanitized) {
          skipped++;
          continue;
        }
        const id = `spending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        insertedIds.push(id);
        const rowCurrency = sanitized.currency
          ? normalizeCurrency(sanitized.currency)
          : importCurrency;
        const split = parseSplitFromCsv(
          sanitized.splitValues,
          sanitized.splitPeople,
          members as any,
          paidByIdMapping,
        );
        stmts.push(
          db
            .prepare(
              `INSERT INTO spendings
            (id, user_id, batch_id, name, details, description, amount,
             category, tags, currency, date, paid_by_id, split_type, split_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              id,
              userId,
              body.batchId,
              sanitized.name,
              sanitized.details || null,
              sanitized.name,
              sanitized.amount,
              sanitized.category,
              sanitized.tags,
              rowCurrency,
              sanitized.transactionDate,
              sanitized.paidById,
              split.type,
              serializeSplitData(split.data),
            ),
        );
      }
      if (stmts.length > 0) await db.batch(stmts);

      const allSpendings = await getSpendingsForBatch(db, body.batchId);
      const imported = allSpendings.filter((s) => insertedIds.includes(s.id));
      return c.json({
        imported,
        importedCount: imported.length,
        skippedCount: skipped,
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

  router.post("/api/spendings", async (c) => {
    try {
      const auth = requireAuth(c);
      const body = await c.req.json<{
        batchId?: string;
        amount?: number;
        name?: string;
        description?: string;
        transactionDate?: string;
        category?: string;
        tags?: string;
        currency?: string;
        paidById?: string;
        splitType?: string;
        splitData?: unknown;
      }>();
      const userId = getUserIdFromSub(auth.sub);
      if (!body.batchId) return c.json({ error: "batchId is required" }, 400);
      if (!(await canAccessBatch(db, userId, body.batchId)))
        return c.json({ error: "Forbidden" }, 403);

      const batchMemberIds = await getBatchMemberIds(db, body.batchId);
      const paidById =
        body.paidById && batchMemberIds.includes(body.paidById)
          ? body.paidById
          : batchMemberIds[0] || userId;
      const transactionName = (body.name || "").trim() || "New transaction";
      const details = (body.description || "").trim();
      const transactionDate = body.transactionDate || new Date().toISOString();
      const currency = normalizeCurrency(body.currency);
      const id = `spending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      await db
        .prepare(
          `INSERT INTO spendings
        (id, user_id, batch_id, name, details, description, amount,
         category, tags, currency, date, paid_by_id, split_type, split_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          userId,
          body.batchId,
          transactionName,
          details || null,
          transactionName,
          body.amount ?? 0,
          body.category?.trim() || null,
          body.tags?.trim() || null,
          currency,
          transactionDate,
          paidById,
          body.splitType || "equal",
          serializeSplitData(body.splitData),
        )
        .run();

      const allSpendings = await getSpendingsForBatch(db, body.batchId);
      const created = allSpendings.find((s) => s.id === id);
      return c.json(
        { id, message: "Spending recorded", spending: created },
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

  router.patch("/api/spendings/:id", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const spendingId = c.req.param("id");
      const body = await c.req.json<{
        batchId?: string;
        amount?: number;
        name?: string;
        description?: string;
        transactionDate?: string;
        category?: string;
        tags?: string;
        currency?: string;
        paidById?: string;
        splitType?: string;
        splitData?: unknown;
      }>();

      const existing = await db
        .prepare("SELECT id, batch_id FROM spendings WHERE id = ?")
        .bind(spendingId)
        .first<{ id: string; batch_id: string | null }>();
      if (!existing) return c.json({ error: "Transaction not found" }, 404);

      const batchId = body.batchId || existing.batch_id;
      if (!batchId) return c.json({ error: "batchId is required" }, 400);
      if (!(await canAccessBatch(db, userId, batchId)))
        return c.json({ error: "Forbidden" }, 403);

      const batchMemberIds = await getBatchMemberIds(db, batchId);
      const paidById =
        body.paidById && batchMemberIds.includes(body.paidById)
          ? body.paidById
          : batchMemberIds[0] || userId;
      const transactionName = (body.name || "").trim() || "New transaction";
      const details = (body.description || "").trim();
      const currency = normalizeCurrency(body.currency);

      await db
        .prepare(
          `UPDATE spendings
       SET batch_id = ?, name = ?, details = ?, description = ?, amount = ?,
           category = ?, tags = ?, currency = ?, date = ?, paid_by_id = ?,
           split_type = ?, split_data = ?
       WHERE id = ?`,
        )
        .bind(
          batchId,
          transactionName,
          details || null,
          transactionName,
          body.amount ?? 0,
          body.category?.trim() || null,
          body.tags?.trim() || null,
          currency,
          body.transactionDate || new Date().toISOString(),
          paidById,
          body.splitType || "equal",
          serializeSplitData(body.splitData),
          spendingId,
        )
        .run();

      const allSpendings = await getSpendingsForBatch(db, batchId);
      return c.json(allSpendings.find((s) => s.id === spendingId) ?? null);
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

  router.delete("/api/spendings/:id", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const spendingId = c.req.param("id");

      const existing = await db
        .prepare("SELECT id, batch_id FROM spendings WHERE id = ?")
        .bind(spendingId)
        .first<{ id: string; batch_id: string | null }>();
      if (!existing) return c.json({ error: "Transaction not found" }, 404);

      const batchId = existing.batch_id;
      if (!batchId) return c.json({ error: "batchId is required" }, 400);
      if (!(await canAccessBatch(db, userId, batchId)))
        return c.json({ error: "Forbidden" }, 403);

      await db
        .prepare("DELETE FROM spendings WHERE id = ?")
        .bind(spendingId)
        .run();
      return c.json({ id: spendingId, message: "Transaction deleted" });
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
