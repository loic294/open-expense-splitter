import { Hono } from "hono";
import type { HonoCtx, RouteDeps, TemporaryMemberPayload } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";
import { normalizeCurrency, SUPPORTED_CURRENCIES } from "../utils/currency";
import {
  normalizeMemberIds,
  normalizeTemporaryMembers,
} from "../utils/normalize";
import { createId } from "../utils/id";
import { canAccessBatch } from "../db/batches";
import {
  getBatchMembers,
  getBatchMemberIds,
  syncBatchMembers,
  replaceTemporaryMemberWithUser,
} from "../db/members";
import { filterKnownContactMemberIds } from "../db/contacts";
import {
  getGroupPendingInvites,
  createOrReuseGroupInvites,
} from "../db/invites";

export function createGroupsRouter({ db, frontendBaseUrl }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/groups", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const { results } = await db
        .prepare(
          `SELECT DISTINCT b.id, b.name, b.emoji, b.description,
              b.owner_id, b.created_at, b.updated_at
       FROM batches b
       LEFT JOIN batch_members bm ON b.id = bm.batch_id
       WHERE b.owner_id = ? OR bm.user_id = ?
       ORDER BY b.created_at DESC`,
        )
        .bind(userId, userId)
        .all<Record<string, unknown>>();

      const hydratedBatches = await Promise.all(
        results.map(async (batch) => ({
          ...batch,
          members: await getBatchMembers(db, batch.id as string),
          canEdit: batch.owner_id === userId,
        })),
      );
      return c.json({
        batches: hydratedBatches,
        total: hydratedBatches.length,
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

  router.post("/api/groups", async (c) => {
    try {
      const auth = requireAuth(c);
      const body = await c.req.json<{
        name?: string;
        emoji?: string;
        description?: string;
        memberIds?: string[];
        inviteEmails?: string[];
        temporaryMembers?: TemporaryMemberPayload[];
      }>();
      const userId = getUserIdFromSub(auth.sub);
      const name = (body.name || "").trim();
      if (!name) return c.json({ error: "Group name is required" }, 400);
      const emoji = (body.emoji || "💸").trim() || "💸";
      const id = createId();

      const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
      const memberIds = await filterKnownContactMemberIds(
        db,
        userId,
        requestedMemberIds,
      );
      const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
      const inviteEmails = Array.isArray(body.inviteEmails)
        ? body.inviteEmails.filter((v): v is string => typeof v === "string")
        : [];

      await db
        .prepare(
          "INSERT INTO batches (id, owner_id, name, emoji, description) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, userId, name, emoji, body.description || null)
        .run();
      await syncBatchMembers(db, id, memberIds, temporaryMembers, userId);

      const generatedInvites = await createOrReuseGroupInvites(
        db,
        id,
        userId,
        inviteEmails,
        frontendBaseUrl,
      );
      const members = await getBatchMembers(db, id);
      return c.json(
        {
          id,
          message: "Group created",
          batch: {
            id,
            owner_id: userId,
            name,
            emoji,
            description: body.description || null,
            members,
            canEdit: true,
          },
          pendingInvites: generatedInvites,
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

  router.patch("/api/groups/:id", async (c) => {
    try {
      const auth = requireAuth(c);
      const body = await c.req.json<{
        name?: string;
        emoji?: string;
        description?: string;
        memberIds?: string[];
        inviteEmails?: string[];
        temporaryMembers?: TemporaryMemberPayload[];
      }>();
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("id");
      const name = (body.name || "").trim();
      if (!name) return c.json({ error: "Group name is required" }, 400);
      const emoji = (body.emoji || "💸").trim() || "💸";

      const existing = await db
        .prepare("SELECT id, owner_id FROM batches WHERE id = ?")
        .bind(batchId)
        .first<{ id: string; owner_id: string }>();
      if (!existing) return c.json({ error: "Group not found" }, 404);
      if (existing.owner_id !== userId)
        return c.json({ error: "Only the group owner can update it" }, 403);

      const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
      const memberIds = await filterKnownContactMemberIds(
        db,
        userId,
        requestedMemberIds,
      );
      const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
      const inviteEmails = Array.isArray(body.inviteEmails)
        ? body.inviteEmails.filter((v): v is string => typeof v === "string")
        : [];

      await db
        .prepare(
          `UPDATE batches
       SET name = ?, emoji = ?, description = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
        )
        .bind(name, emoji, body.description || null, batchId)
        .run();
      await syncBatchMembers(db, batchId, memberIds, temporaryMembers, userId);
      const generatedInvites = await createOrReuseGroupInvites(
        db,
        batchId,
        userId,
        inviteEmails,
        frontendBaseUrl,
      );

      const updated = await db
        .prepare(
          "SELECT id, name, emoji, description, owner_id, created_at, updated_at FROM batches WHERE id = ?",
        )
        .bind(batchId)
        .first();
      const members = await getBatchMembers(db, batchId);
      const pendingInvites = await getGroupPendingInvites(
        db,
        batchId,
        frontendBaseUrl,
      );
      return c.json({
        ...updated,
        members,
        canEdit: true,
        pendingInvites,
        generatedInvites,
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

  router.get("/api/groups/:id/member-invites", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("id");
      const batch = await db
        .prepare("SELECT owner_id FROM batches WHERE id = ? LIMIT 1")
        .bind(batchId)
        .first<{ owner_id: string }>();
      if (!batch) return c.json({ error: "Group not found" }, 404);
      if (batch.owner_id !== userId)
        return c.json({ error: "Only the group owner can view invites" }, 403);
      return c.json({
        invites: await getGroupPendingInvites(db, batchId, frontendBaseUrl),
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

  router.post(
    "/api/groups/:id/temporary-members/:memberId/replace",
    async (c) => {
      try {
        const auth = requireAuth(c);
        const userId = getUserIdFromSub(auth.sub);
        const batchId = c.req.param("id");
        const temporaryMemberId = c.req.param("memberId");
        const body = await c.req.json<{ userId?: string }>();
        const replacementUserId =
          typeof body.userId === "string" ? body.userId : "";
        if (!replacementUserId)
          return c.json({ error: "userId is required" }, 400);

        const batch = await db
          .prepare("SELECT owner_id FROM batches WHERE id = ? LIMIT 1")
          .bind(batchId)
          .first<{ owner_id: string }>();
        if (!batch) return c.json({ error: "Group not found" }, 404);
        if (batch.owner_id !== userId)
          return c.json(
            { error: "Only the group owner can replace a temporary member" },
            403,
          );

        const allowed = await filterKnownContactMemberIds(db, userId, [
          replacementUserId,
        ]);
        if (!allowed.includes(replacementUserId))
          return c.json(
            { error: "Replacement user must be one of your known contacts" },
            400,
          );

        const replaced = await replaceTemporaryMemberWithUser(
          db,
          batchId,
          temporaryMemberId,
          replacementUserId,
        );
        if (!replaced)
          return c.json({ error: "Temporary member not found" }, 404);
        return c.json({
          message: "Temporary member replaced",
          members: await getBatchMembers(db, batchId),
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
    },
  );

  router.get("/api/groups/:id/currency-preference", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("id");
      if (!(await canAccessBatch(db, userId, batchId)))
        return c.json({ error: "Forbidden" }, 403);
      const row = await db
        .prepare(
          `SELECT currency FROM batch_user_currency_preferences
       WHERE batch_id = ? AND user_id = ? LIMIT 1`,
        )
        .bind(batchId, userId)
        .first<{ currency: string }>();
      return c.json({
        batchId,
        currency: normalizeCurrency(row?.currency),
        supportedCurrencies: SUPPORTED_CURRENCIES,
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

  router.put("/api/groups/:id/currency-preference", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      const batchId = c.req.param("id");
      const body = await c.req.json<{ currency?: string }>();
      if (!(await canAccessBatch(db, userId, batchId)))
        return c.json({ error: "Forbidden" }, 403);
      const currency = normalizeCurrency(body.currency);
      await db
        .prepare(
          `INSERT INTO batch_user_currency_preferences (id, batch_id, user_id, currency)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(batch_id, user_id)
       DO UPDATE SET currency = excluded.currency, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(`pref_${createId()}`, batchId, userId, currency)
        .run();
      return c.json({
        batchId,
        currency,
        supportedCurrencies: SUPPORTED_CURRENCIES,
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

  router.get("/api/groups/:id/column-visibility", async (c) => {
    try {
      const auth = requireAuth(c);
      const groupId = c.req.param("id");
      const userId = getUserIdFromSub(auth.sub);
      const isMember = await db
        .prepare(
          "SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?",
        )
        .bind(groupId, userId)
        .first();
      const isOwner = await db
        .prepare("SELECT 1 FROM batches WHERE id = ? AND owner_id = ?")
        .bind(groupId, userId)
        .first();
      if (!isMember && !isOwner) return c.json({ error: "Unauthorized" }, 401);
      const row = await db
        .prepare(
          "SELECT visible_columns FROM group_column_visibility WHERE group_id = ? AND user_id = ?",
        )
        .bind(groupId, userId)
        .first<{ visible_columns: string }>();
      const visibleColumns = row
        ? row.visible_columns.split(",")
        : "name,amount,currency,paid_by,date,category,tags,split,description".split(
            ",",
          );
      return c.json({ visibleColumns });
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

  router.put("/api/groups/:id/column-visibility", async (c) => {
    try {
      const auth = requireAuth(c);
      const groupId = c.req.param("id");
      const userId = getUserIdFromSub(auth.sub);
      const body = await c.req.json<{ visibleColumns?: string[] }>();
      const isMember = await db
        .prepare(
          "SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?",
        )
        .bind(groupId, userId)
        .first();
      const isOwner = await db
        .prepare("SELECT 1 FROM batches WHERE id = ? AND owner_id = ?")
        .bind(groupId, userId)
        .first();
      if (!isMember && !isOwner) return c.json({ error: "Unauthorized" }, 401);
      const visibleColumns = Array.isArray(body.visibleColumns)
        ? body.visibleColumns.join(",")
        : "name,amount,currency,paid_by,date,category,tags,split,description";
      await db
        .prepare(
          `INSERT INTO group_column_visibility (id, group_id, user_id, visible_columns)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id, user_id)
       DO UPDATE SET visible_columns = excluded.visible_columns, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(createId(), groupId, userId, visibleColumns)
        .run();
      return c.json({ visibleColumns: visibleColumns.split(",") });
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
