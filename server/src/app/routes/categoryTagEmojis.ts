import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import { createId } from "../utils/id";
import { canAccessBatch } from "../db/batches";

export function createCategoryTagEmojisRouter({ db }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/batches/:batchId/emojis", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("batchId");

      if (!(await canAccessBatch(db, userId, batchId))) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { results } = await db
        .prepare(
          `SELECT type, name, emoji FROM category_tag_emojis
           WHERE batch_id = ?
           ORDER BY type, name`,
        )
        .bind(batchId)
        .all<{ type: string; name: string; emoji: string }>();

      const map: Record<string, Record<string, string>> = {
        category: {},
        tag: {},
      };

      results.forEach((row) => {
        map[row.type][row.name] = row.emoji;
      });

      return c.json(map);
    } catch (err) {
      console.error("[GET /api/batches/:batchId/emojis] Error:", err);
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

  router.post("/api/batches/:batchId/emojis", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("batchId");
      const body = await c.req.json<{
        type: "category" | "tag";
        name: string;
        emoji: string;
      }>();

      if (!(await canAccessBatch(db, userId, batchId))) {
        return c.json({ error: "Forbidden" }, 403);
      }

      if (!body.type || !["category", "tag"].includes(body.type)) {
        return c.json({ error: "Invalid type" }, 400);
      }

      if (!body.name || typeof body.name !== "string") {
        return c.json({ error: "Invalid name" }, 400);
      }

      if (!body.emoji || typeof body.emoji !== "string") {
        return c.json({ error: "Invalid emoji" }, 400);
      }

      const id = `emoji_${createId()}`;
      await db
        .prepare(
          `INSERT INTO category_tag_emojis (id, batch_id, type, name, emoji)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(batch_id, type, name) DO UPDATE SET emoji = ?, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(id, batchId, body.type, body.name, body.emoji, body.emoji)
        .run();

      return c.json({ success: true, emoji: body.emoji });
    } catch (err) {
      console.error("[POST /api/batches/:batchId/emojis] Error:", err);
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

  router.delete("/api/batches/:batchId/emojis/:type/:name", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("batchId");
      const type = c.req.param("type");
      const name = decodeURIComponent(c.req.param("name"));

      if (!(await canAccessBatch(db, userId, batchId))) {
        return c.json({ error: "Forbidden" }, 403);
      }

      await db
        .prepare(
          `DELETE FROM category_tag_emojis
           WHERE batch_id = ? AND type = ? AND name = ?`,
        )
        .bind(batchId, type, name)
        .run();

      return c.json({ success: true });
    } catch (err) {
      console.error(
        "[DELETE /api/batches/:batchId/emojis/:type/:name] Error:",
        err,
      );
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
