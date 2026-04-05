import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import db, { initializeDB } from "./db";
import { authMiddleware, requireAuth } from "./auth";

// Initialize database
initializeDB();

const app = new Hono();

const DEFAULT_CURRENCY = "USD";
const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "BRL",
  "MXN",
] as const;

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === "Unauthorized";
}

function getUserIdFromSub(sub: string): string {
  return `user_${sub.replace(/:/g, "_")}`;
}

function normalizeCurrency(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number],
  )
    ? value
    : DEFAULT_CURRENCY;
}

function normalizeMemberIds(ownerId: string, memberIds: unknown): string[] {
  const ids = Array.isArray(memberIds)
    ? memberIds.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([ownerId, ...ids]));
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

function getFrontendBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  );
}

function buildInviteUrl(path: string) {
  const base = getFrontendBaseUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

type TemporaryMemberPayload = {
  id?: string;
  name: string;
  email: string | null;
};

function normalizeTemporaryMembers(raw: unknown): TemporaryMemberPayload[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .filter(
      (value): value is Record<string, unknown> =>
        typeof value === "object" && value !== null,
    )
    .map((value) => {
      const id =
        typeof value.id === "string" && value.id.trim()
          ? value.id.trim()
          : undefined;
      const name =
        typeof value.name === "string" ? value.name.trim().slice(0, 80) : "";
      const email = normalizeEmail(value.email);
      return {
        id,
        name,
        email: email || null,
      };
    })
    .filter((value) => value.name.length > 0);

  const seen = new Set<string>();
  return normalized.filter((value) => {
    const key = value.id || `${value.name}|${value.email || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function addContactPair(userA: string, userB: string, source = "invite") {
  if (!userA || !userB || userA === userB) {
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO user_contacts (id, user_id, contact_user_id, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, contact_user_id) DO NOTHING
  `);

  const transaction = db.transaction(() => {
    stmt.run(`contact_${randomUUID()}`, userA, userB, source);
    stmt.run(`contact_${randomUUID()}`, userB, userA, source);
  });

  transaction();
}

function getKnownContacts(userId: string) {
  return db
    .prepare(
      `
      SELECT u.id, u.email, u.name, u.picture, uc.created_at
      FROM user_contacts uc
      JOIN users u ON u.id = uc.contact_user_id
      WHERE uc.user_id = ?
      ORDER BY COALESCE(u.name, u.email) ASC
    `,
    )
    .all(userId) as any[];
}

function getBatchTemporaryMembers(batchId: string) {
  return db
    .prepare(
      `
      SELECT tm.id,
             tm.email,
             tm.name,
             NULL AS picture,
             tm.created_at,
             1 AS is_temporary,
             tm.email AS temporary_email
      FROM batch_temporary_members tm
      WHERE tm.batch_id = ?
      ORDER BY COALESCE(tm.name, tm.email) ASC
    `,
    )
    .all(batchId) as any[];
}

function filterKnownContactMemberIds(ownerId: string, requestedIds: string[]) {
  const knownContacts = new Set(
    getKnownContacts(ownerId).map((contact) => contact.id as string),
  );

  return requestedIds.filter(
    (memberId) => memberId === ownerId || knownContacts.has(memberId),
  );
}

function getBatchMembers(batchId: string) {
  const realMembers = db
    .prepare(
      `
      SELECT u.id,
             u.email,
             u.name,
             u.picture,
             bm.created_at,
             0 AS is_temporary,
             NULL AS temporary_email
      FROM batch_members bm
      JOIN users u ON u.id = bm.user_id
      WHERE bm.batch_id = ?
    `,
    )
    .all(batchId) as any[];

  const temporaryMembers = getBatchTemporaryMembers(batchId);

  return [...realMembers, ...temporaryMembers].sort((left, right) => {
    const leftLabel = (left.name || left.email || "").toLowerCase();
    const rightLabel = (right.name || right.email || "").toLowerCase();
    return leftLabel.localeCompare(rightLabel);
  });
}

function syncBatchMembers(
  batchId: string,
  memberIds: string[],
  temporaryMembers: TemporaryMemberPayload[],
  actorUserId: string,
) {
  const deleteStmt = db.prepare(`DELETE FROM batch_members WHERE batch_id = ?`);
  const deleteTemporaryStmt = db.prepare(
    `DELETE FROM batch_temporary_members WHERE batch_id = ?`,
  );
  const insertStmt = db.prepare(`
    INSERT INTO batch_members (id, batch_id, user_id)
    VALUES (?, ?, ?)
  `);
  const insertTemporaryStmt = db.prepare(`
    INSERT INTO batch_temporary_members (
      id,
      batch_id,
      name,
      email,
      created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(
    (ids: string[], temps: TemporaryMemberPayload[]) => {
      deleteStmt.run(batchId);
      deleteTemporaryStmt.run(batchId);

      ids.forEach((memberId) => {
        insertStmt.run(`member_${randomUUID()}`, batchId, memberId);
      });

      temps.forEach((member) => {
        insertTemporaryStmt.run(
          member.id || `temp_${randomUUID()}`,
          batchId,
          member.name,
          member.email,
          actorUserId,
        );
      });
    },
  );

  transaction(memberIds, temporaryMembers);
}

function canAccessBatch(userId: string, batchId: string): boolean {
  const batch = db
    .prepare(
      `
      SELECT b.id
      FROM batches b
      LEFT JOIN batch_members bm ON b.id = bm.batch_id
      WHERE b.id = ? AND (b.owner_id = ? OR bm.user_id = ?)
      LIMIT 1
    `,
    )
    .get(batchId, userId, userId);

  return !!batch;
}

function getBatchMemberIds(batchId: string): string[] {
  return getBatchMembers(batchId).map((member) => member.id);
}

function replaceMemberInSplitData(
  raw: string | null,
  fromId: string,
  toId: string,
) {
  const parsed = parseSplitData(raw) as {
    includedMemberIds?: unknown;
    values?: unknown;
  } | null;

  if (!parsed || typeof parsed !== "object") {
    return raw;
  }

  const included = Array.isArray(parsed.includedMemberIds)
    ? parsed.includedMemberIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => (value === fromId ? toId : value))
    : [];
  const dedupedIncluded = Array.from(new Set(included));

  const values =
    parsed.values && typeof parsed.values === "object"
      ? { ...(parsed.values as Record<string, number>) }
      : {};

  if (Object.prototype.hasOwnProperty.call(values, fromId)) {
    const previous = Number(values[fromId] || 0);
    const existing = Number(values[toId] || 0);
    values[toId] = previous + existing;
    delete values[fromId];
  }

  return serializeSplitData({
    includedMemberIds: dedupedIncluded,
    values,
  });
}

function replaceTemporaryMemberWithUser(
  batchId: string,
  temporaryMemberId: string,
  userId: string,
) {
  const exists = db
    .prepare(
      `SELECT id FROM batch_temporary_members WHERE id = ? AND batch_id = ? LIMIT 1`,
    )
    .get(temporaryMemberId, batchId) as { id: string } | undefined;

  if (!exists) {
    return false;
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO batch_members (id, batch_id, user_id)
      VALUES (?, ?, ?)
      ON CONFLICT(batch_id, user_id) DO NOTHING
    `,
    ).run(`member_${randomUUID()}`, batchId, userId);

    db.prepare(
      `
      UPDATE spendings
      SET paid_by_id = ?
      WHERE batch_id = ? AND paid_by_id = ?
    `,
    ).run(userId, batchId, temporaryMemberId);

    const spendingsWithSplitData = db
      .prepare(
        `
      SELECT id, split_data
      FROM spendings
      WHERE batch_id = ? AND split_data IS NOT NULL
    `,
      )
      .all(batchId) as Array<{ id: string; split_data: string | null }>;

    const updateSplitStmt = db.prepare(
      `UPDATE spendings SET split_data = ? WHERE id = ?`,
    );

    spendingsWithSplitData.forEach((spending) => {
      const nextSplitData = replaceMemberInSplitData(
        spending.split_data,
        temporaryMemberId,
        userId,
      );

      if (nextSplitData !== spending.split_data) {
        updateSplitStmt.run(nextSplitData, spending.id);
      }
    });

    db.prepare(`DELETE FROM batch_temporary_members WHERE id = ?`).run(
      temporaryMemberId,
    );
  });

  transaction();
  return true;
}

function parseSplitData(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeSplitData(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function fetchHistoricalRateFromProvider(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
) {
  const url = `https://api.frankfurter.app/${encodeURIComponent(date)}?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(targetCurrency)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`FX provider error ${response.status}`);
  }

  const payload = (await response.json()) as {
    rates?: Record<string, number>;
  };
  const rate = payload.rates?.[targetCurrency];

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("FX provider returned invalid rate");
  }

  return rate;
}

async function getOrFetchRate(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): Promise<number> {
  if (baseCurrency === targetCurrency) {
    return 1;
  }

  const cached = db
    .prepare(
      `
      SELECT rate
      FROM exchange_rates
      WHERE rate_date = ? AND base_currency = ? AND target_currency = ?
      LIMIT 1
    `,
    )
    .get(date, baseCurrency, targetCurrency) as { rate: number } | undefined;

  if (cached?.rate && Number.isFinite(cached.rate) && cached.rate > 0) {
    return cached.rate;
  }

  const rate = await fetchHistoricalRateFromProvider(
    date,
    baseCurrency,
    targetCurrency,
  );

  db.prepare(
    `
    INSERT INTO exchange_rates (id, rate_date, base_currency, target_currency, rate)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(rate_date, base_currency, target_currency) DO UPDATE SET
      rate = excluded.rate,
      fetched_at = CURRENT_TIMESTAMP
  `,
  ).run(`fx_${randomUUID()}`, date, baseCurrency, targetCurrency, rate);

  return rate;
}

function getRequestId(c: {
  req: { header: (name: string) => string | undefined };
  res: { headers: Headers };
}) {
  return (
    c.res.headers.get("X-Request-ID") ||
    c.req.header("x-request-id") ||
    "unknown-request"
  );
}

function summarizeSpendingPayload(body: {
  batchId?: string;
  amount?: number;
  name?: string;
  description?: string;
  transactionDate?: string;
  category?: string;
  currency?: string;
  paidById?: string;
  splitType?: string;
  splitData?: unknown;
}) {
  const splitData =
    body.splitData && typeof body.splitData === "object"
      ? (body.splitData as {
          includedMemberIds?: unknown;
          values?: unknown;
        })
      : null;

  return {
    batchId: body.batchId,
    amount: body.amount,
    name: body.name,
    description: body.description,
    transactionDate: body.transactionDate,
    category: body.category,
    currency: body.currency,
    paidById: body.paidById,
    splitType: body.splitType,
    splitMembers: Array.isArray(splitData?.includedMemberIds)
      ? splitData.includedMemberIds
      : [],
    splitValueCount:
      splitData?.values && typeof splitData.values === "object"
        ? Object.keys(splitData.values as Record<string, unknown>).length
        : 0,
  };
}

function summarizeSpendingRecord(spending: any) {
  if (!spending) {
    return null;
  }

  return {
    id: spending.id,
    batchId: spending.batch_id,
    amount: spending.amount,
    name: spending.name,
    details: spending.details,
    transactionDate: spending.transaction_date,
    category: spending.category,
    currency: spending.currency,
    paidById: spending.paid_by_id,
    splitType: spending.split_type,
    splitMembers: Array.isArray(spending.split_data?.includedMemberIds)
      ? spending.split_data.includedMemberIds
      : [],
  };
}

type CsvImportField =
  | "amount"
  | "name"
  | "description"
  | "transactionDate"
  | "category"
  | "paidById";

type CsvMapping = Partial<Record<CsvImportField, string>>;

type CsvImportRow = Partial<
  Record<CsvImportField, string | number | null | undefined>
>;

function sanitizeTextValue(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return trimmed.slice(0, maxLength);
}

function sanitizeAmountValue(value: unknown): number | null {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return Math.round(Math.abs(value) * 100) / 100;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(Math.abs(parsed) * 100) / 100;
}

function sanitizeDateValue(value: unknown): string {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const raw = value.trim();
  if (!raw) {
    return new Date().toISOString();
  }

  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const fallback = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function resolvePaidById(
  value: unknown,
  members: Array<{ id: string; email: string; name: string | null }>,
  fallbackUserId: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    return members[0]?.id || fallbackUserId;
  }

  const normalized = normalizeIdentifier(value);
  const matched = members.find((member) => {
    const name = member.name ? normalizeIdentifier(member.name) : "";
    return (
      normalizeIdentifier(member.id) === normalized ||
      normalizeIdentifier(member.email) === normalized ||
      (name && name === normalized)
    );
  });

  return matched?.id || members[0]?.id || fallbackUserId;
}

function sanitizeImportRow(
  row: CsvImportRow,
  members: Array<{ id: string; email: string; name: string | null }>,
  fallbackUserId: string,
): {
  amount: number;
  name: string;
  details: string;
  transactionDate: string;
  category: string | null;
  paidById: string;
} | null {
  const amount = sanitizeAmountValue(row.amount);
  if (amount === null) {
    return null;
  }

  const name = sanitizeTextValue(row.name, 120) || "Imported transaction";
  const details = sanitizeTextValue(row.description, 300);
  const transactionDate = sanitizeDateValue(row.transactionDate);
  const category = sanitizeTextValue(row.category, 80) || null;
  const paidById = resolvePaidById(row.paidById, members, fallbackUserId);

  return {
    amount,
    name,
    details,
    transactionDate,
    category,
    paidById,
  };
}

function getSpendingsForBatch(batchId: string) {
  const spendings = db
    .prepare(
      `
      SELECT id,
             user_id,
             batch_id,
             COALESCE(name, description) AS name,
             details,
             description,
             amount,
             category,
             currency,
             date AS transaction_date,
             paid_by_id,
             split_type,
             split_data,
             created_at
      FROM spendings
      WHERE batch_id = ?
      ORDER BY date DESC, created_at DESC
      LIMIT 200
    `,
    )
    .all(batchId) as any[];

  return spendings.map((spending) => ({
    ...spending,
    split_data: parseSplitData(spending.split_data),
  }));
}

// Request/response logs help quickly pinpoint auth and route failures.
app.use("*", async (c, next) => {
  const start = Date.now();
  const requestId = c.req.header("x-request-id") || randomUUID();
  c.header("X-Request-ID", requestId);
  console.debug("[api:%s] -> %s %s", requestId, c.req.method, c.req.path);
  await next();
  console.debug(
    "[api:%s] <- %s %s %d (%dms)",
    requestId,
    c.req.method,
    c.req.path,
    c.res.status,
    Date.now() - start,
  );
});

// Enable CORS for frontend
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
  }),
);

// Apply auth middleware
app.use("*", authMiddleware);

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "Better Expense Splitter API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      spendings: "/api/spendings",
      groups: "/api/groups",
    },
  });
});

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok", message: "Backend is running" });
});

app.get("/api/users", (c) => {
  try {
    requireAuth(c);

    const users = db
      .prepare(
        `
      SELECT id, auth0_id, email, name, picture, created_at
      FROM users
      ORDER BY COALESCE(name, email) ASC
    `,
      )
      .all() as any[];

    return c.json({ users, total: users.length });
  } catch (error) {
    console.error("[api:/api/users] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/contacts", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);

    const contacts = getKnownContacts(userId);
    const sentInvites = db
      .prepare(
        `
      SELECT id, email, token, status, created_at, accepted_at
      FROM platform_invites
      WHERE inviter_user_id = ?
      ORDER BY created_at DESC
    `,
      )
      .all(userId)
      .map((invite: any) => ({
        ...invite,
        invitePath: `/invites/platform/${invite.token}`,
        inviteUrl: buildInviteUrl(`/invites/platform/${invite.token}`),
      }));

    return c.json({ contacts, sentInvites });
  } catch (error) {
    console.error("[api:/api/contacts GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/contacts/invites", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = (await c.req.json()) as { email?: string };
    const email = normalizeEmail(body.email);

    if (email && !isValidEmail(email)) {
      return c.json({ error: "Invalid email address" }, 400);
    }

    const token = randomUUID().replace(/-/g, "");
    const inviteId = `platform_invite_${randomUUID()}`;

    db.prepare(
      `
      INSERT INTO platform_invites (id, inviter_user_id, email, token, status)
      VALUES (?, ?, ?, ?, 'pending')
    `,
    ).run(inviteId, userId, email || null, token);

    return c.json(
      {
        id: inviteId,
        email: email || null,
        token,
        status: "pending",
        invitePath: `/invites/platform/${token}`,
        inviteUrl: buildInviteUrl(`/invites/platform/${token}`),
      },
      201,
    );
  } catch (error) {
    console.error("[api:/api/contacts/invites POST] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/platform-invites/:token", (c) => {
  try {
    requireAuth(c);
    const token = c.req.param("token");

    const invite = db
      .prepare(
        `
      SELECT pi.id,
             pi.email,
             pi.status,
             pi.created_at,
             inviter.id AS inviter_id,
             inviter.email AS inviter_email,
             inviter.name AS inviter_name
      FROM platform_invites pi
      JOIN users inviter ON inviter.id = pi.inviter_user_id
      WHERE pi.token = ?
      LIMIT 1
    `,
      )
      .get(token) as any;

    if (!invite) {
      return c.json({ error: "Invite not found" }, 404);
    }

    return c.json({
      ...invite,
      invitePath: `/invites/platform/${token}`,
      inviteUrl: buildInviteUrl(`/invites/platform/${token}`),
    });
  } catch (error) {
    console.error("[api:/api/platform-invites/:token GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/platform-invites/:token/accept", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const token = c.req.param("token");

    const invite = db
      .prepare(
        `
      SELECT id, inviter_user_id, email, status
      FROM platform_invites
      WHERE token = ?
      LIMIT 1
    `,
      )
      .get(token) as
      | {
          id: string;
          inviter_user_id: string;
          email: string | null;
          status: string;
        }
      | undefined;

    if (!invite) {
      return c.json({ error: "Invite not found" }, 404);
    }

    if (invite.status !== "pending") {
      return c.json({ error: "Invite is no longer pending" }, 409);
    }

    if (invite.inviter_user_id === userId) {
      return c.json({ error: "You cannot accept your own invite" }, 400);
    }

    const currentUser = db
      .prepare(`SELECT id, email FROM users WHERE id = ? LIMIT 1`)
      .get(userId) as { id: string; email: string } | undefined;

    if (!currentUser) {
      return c.json({ error: "Current user not found" }, 404);
    }

    if (invite.email && normalizeEmail(currentUser.email) !== invite.email) {
      return c.json({ error: "This invite was issued for another email" }, 403);
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `
      UPDATE platform_invites
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      ).run(userId, invite.id);
      addContactPair(invite.inviter_user_id, userId, "platform_invite");
    });

    transaction();

    return c.json({
      message: "Invite accepted",
      inviterUserId: invite.inviter_user_id,
      acceptedByUserId: userId,
    });
  } catch (error) {
    console.error(
      "[api:/api/platform-invites/:token/accept POST] failed:",
      error,
    );
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Get current user profile
app.get("/api/me", (c) => {
  try {
    const auth = requireAuth(c);

    const user = db
      .prepare(
        `
      SELECT id, auth0_id, email, name, picture, created_at 
      FROM users 
      WHERE auth0_id = ?
    `,
      )
      .get(auth.sub) as any;

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error("[api:/api/me] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Create/update user on login
app.post("/api/auth/login", (c) => {
  try {
    const auth = requireAuth(c);

    // Upsert user
    const stmt = db.prepare(`
      INSERT INTO users (id, auth0_id, email, name, picture)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(auth0_id) DO UPDATE SET
        email = COALESCE(users.email, excluded.email),
        name = COALESCE(users.name, excluded.name),
        picture = COALESCE(users.picture, excluded.picture),
        updated_at = CURRENT_TIMESTAMP
    `);

    const userId = `user_${auth.sub.replace(/:/g, "_")}`;
    stmt.run(userId, auth.sub, auth.email, auth.email, "");

    return c.json({
      message: "User created/updated",
      userId,
    });
  } catch (error) {
    console.error("[api:/api/auth/login] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Update current user profile
app.patch("/api/me", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = (await c.req.json()) as {
      name?: string;
      email?: string;
      picture?: string;
    };

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const picture = (body.picture || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return c.json({ error: "Invalid email address" }, 400);
    }

    const stmt = db.prepare(`
      UPDATE users
      SET name = ?, email = ?, picture = ?, updated_at = CURRENT_TIMESTAMP
      WHERE auth0_id = ?
    `);

    const result = stmt.run(name || null, email, picture || null, auth.sub);

    if (result.changes === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    const updated = db
      .prepare(
        `
      SELECT id, auth0_id, email, name, picture, created_at, updated_at
      FROM users
      WHERE auth0_id = ?
    `,
      )
      .get(auth.sub) as any;

    return c.json(updated);
  } catch (error) {
    console.error("[api:/api/me PATCH] failed:", error);

    if ((error as { code?: string })?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return c.json({ error: "Email already in use" }, 409);
    }

    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Get group's spendings
app.get("/api/spendings", (c) => {
  try {
    const requestId = getRequestId(c);
    const auth = requireAuth(c);

    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.query("batchId");

    console.debug("[api:%s] spendings.get request", requestId, {
      userId,
      batchId,
    });

    if (!batchId) {
      console.warn("[api:%s] spendings.get missing batchId", requestId);
      return c.json({ error: "batchId is required" }, 400);
    }

    if (!canAccessBatch(userId, batchId)) {
      console.warn("[api:%s] spendings.get forbidden", requestId, {
        userId,
        batchId,
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    const spendings = getSpendingsForBatch(batchId);

    const categories = db
      .prepare(
        `
      SELECT DISTINCT category
      FROM spendings
      WHERE batch_id = ? AND category IS NOT NULL AND TRIM(category) != ''
      ORDER BY category ASC
    `,
      )
      .all(batchId)
      .map((row: any) => row.category) as string[];

    console.debug("[api:%s] spendings.get success", requestId, {
      batchId,
      total: spendings.length,
      categories: categories.length,
    });

    return c.json({ spendings, categories, total: spendings.length });
  } catch (error) {
    console.error("[api:/api/spendings GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/spendings/import-mapping", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);

    const row = db
      .prepare(
        `
      SELECT mapping_json
      FROM user_csv_mappings
      WHERE user_id = ?
      LIMIT 1
    `,
      )
      .get(userId) as { mapping_json: string } | undefined;

    let mapping: CsvMapping = {};
    if (row?.mapping_json) {
      try {
        const parsed = JSON.parse(row.mapping_json) as CsvMapping;
        if (parsed && typeof parsed === "object") {
          mapping = parsed;
        }
      } catch {
        mapping = {};
      }
    }

    return c.json({ mapping });
  } catch (error) {
    console.error("[api:/api/spendings/import-mapping GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.put("/api/spendings/import-mapping", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = (await c.req.json()) as { mapping?: unknown };
    const mapping =
      body.mapping && typeof body.mapping === "object"
        ? (body.mapping as CsvMapping)
        : {};

    db.prepare(
      `
      INSERT INTO user_csv_mappings (id, user_id, mapping_json)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        mapping_json = excluded.mapping_json,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(`csv_map_${randomUUID()}`, userId, JSON.stringify(mapping));

    return c.json({ mapping });
  } catch (error) {
    console.error("[api:/api/spendings/import-mapping PUT] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/spendings/import", async (c) => {
  try {
    const requestId = getRequestId(c);
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = (await c.req.json()) as {
      batchId?: string;
      rows?: CsvImportRow[];
      currency?: string;
    };

    if (!body.batchId) {
      return c.json({ error: "batchId is required" }, 400);
    }

    if (!canAccessBatch(userId, body.batchId)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return c.json({ error: "rows are required" }, 400);
    }
    const importCurrency = normalizeCurrency(body.currency);

    const members = getBatchMembers(body.batchId);
    const insertStmt = db.prepare(`
      INSERT INTO spendings (
        id,
        user_id,
        batch_id,
        name,
        details,
        description,
        amount,
        category,
        currency,
        date,
        paid_by_id,
        split_type,
        split_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds: string[] = [];
    let skipped = 0;

    const insertTransaction = db.transaction(() => {
      rows.forEach((row) => {
        const sanitized = sanitizeImportRow(row, members, userId);
        if (!sanitized) {
          skipped += 1;
          return;
        }

        const id = `spending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        insertStmt.run(
          id,
          userId,
          body.batchId,
          sanitized.name,
          sanitized.details || null,
          sanitized.name,
          sanitized.amount,
          sanitized.category,
          importCurrency,
          sanitized.transactionDate,
          sanitized.paidById,
          "equal",
          serializeSplitData(null),
        );

        insertedIds.push(id);
      });
    });

    insertTransaction();

    const imported = getSpendingsForBatch(body.batchId).filter((spending) =>
      insertedIds.includes(spending.id),
    );

    console.debug("[api:%s] spendings.import completed", requestId, {
      userId,
      batchId: body.batchId,
      rows: rows.length,
      imported: imported.length,
      skipped,
      importCurrency,
    });

    return c.json({
      imported,
      importedCount: imported.length,
      skippedCount: skipped,
    });
  } catch (error) {
    console.error("[api:/api/spendings/import POST] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Create spending record
app.post("/api/spendings", async (c) => {
  try {
    const requestId = getRequestId(c);
    const auth = requireAuth(c);
    const body = (await c.req.json()) as {
      batchId?: string;
      amount?: number;
      name?: string;
      description?: string;
      transactionDate?: string;
      category?: string;
      currency?: string;
      paidById?: string;
      splitType?: string;
      splitData?: unknown;
    };

    const userId = getUserIdFromSub(auth.sub);
    const id = `spending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.debug("[api:%s] spendings.create request", requestId, {
      userId,
      generatedId: id,
      body: summarizeSpendingPayload(body),
    });

    if (!body.batchId) {
      console.warn("[api:%s] spendings.create missing batchId", requestId);
      return c.json({ error: "batchId is required" }, 400);
    }

    if (!canAccessBatch(userId, body.batchId)) {
      console.warn("[api:%s] spendings.create forbidden", requestId, {
        userId,
        batchId: body.batchId,
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    const batchMemberIds = getBatchMemberIds(body.batchId);
    const paidById =
      body.paidById && batchMemberIds.includes(body.paidById)
        ? body.paidById
        : batchMemberIds[0] || userId;

    const transactionName = (body.name || "").trim() || "New transaction";
    const details = (body.description || "").trim();
    const transactionDate = body.transactionDate || new Date().toISOString();
    const currency = normalizeCurrency(body.currency);

    console.debug("[api:%s] spendings.create normalized", requestId, {
      userId,
      batchId: body.batchId,
      paidById,
      transactionName,
      details,
      transactionDate,
      currency,
      splitType: body.splitType || "equal",
    });

    const stmt = db.prepare(`
      INSERT INTO spendings (
        id,
        user_id,
        batch_id,
        name,
        details,
        description,
        amount,
        category,
        currency,
        date,
        paid_by_id,
        split_type,
        split_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      id,
      userId,
      body.batchId,
      transactionName,
      details || null,
      transactionName,
      body.amount ?? 0,
      body.category?.trim() || null,
      currency,
      transactionDate,
      paidById,
      body.splitType || "equal",
      serializeSplitData(body.splitData),
    );

    const created = getSpendingsForBatch(body.batchId).find(
      (spending) => spending.id === id,
    );

    console.debug("[api:%s] spendings.create stored", requestId, {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
      created: summarizeSpendingRecord(created),
    });

    return c.json({ id, message: "Spending recorded", spending: created }, 201);
  } catch (error) {
    console.error("[api:/api/spendings POST] failed:", error);
    if ((error as { code?: string })?.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return c.json(
        {
          error:
            "User profile missing. Re-authenticate to create your profile.",
        },
        409,
      );
    }

    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.patch("/api/spendings/:id", async (c) => {
  try {
    const requestId = getRequestId(c);
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const spendingId = c.req.param("id");
    const body = (await c.req.json()) as {
      batchId?: string;
      amount?: number;
      name?: string;
      description?: string;
      transactionDate?: string;
      category?: string;
      currency?: string;
      paidById?: string;
      splitType?: string;
      splitData?: unknown;
    };

    console.debug("[api:%s] spendings.patch request", requestId, {
      userId,
      spendingId,
      body: summarizeSpendingPayload(body),
    });

    const existing = db
      .prepare(
        `
      SELECT id, batch_id
      FROM spendings
      WHERE id = ?
    `,
      )
      .get(spendingId) as { id: string; batch_id: string | null } | undefined;

    console.debug("[api:%s] spendings.patch existing", requestId, {
      spendingId,
      existing,
    });

    if (!existing) {
      console.warn("[api:%s] spendings.patch not found", requestId, {
        spendingId,
      });
      return c.json({ error: "Transaction not found" }, 404);
    }

    const batchId = body.batchId || existing.batch_id;
    if (!batchId) {
      console.warn("[api:%s] spendings.patch missing batchId", requestId, {
        spendingId,
      });
      return c.json({ error: "batchId is required" }, 400);
    }

    if (!canAccessBatch(userId, batchId)) {
      console.warn("[api:%s] spendings.patch forbidden", requestId, {
        userId,
        spendingId,
        batchId,
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    const batchMemberIds = getBatchMemberIds(batchId);
    const paidById =
      body.paidById && batchMemberIds.includes(body.paidById)
        ? body.paidById
        : batchMemberIds[0] || userId;

    const transactionName = (body.name || "").trim() || "New transaction";
    const details = (body.description || "").trim();
    const currency = normalizeCurrency(body.currency);

    console.debug("[api:%s] spendings.patch normalized", requestId, {
      spendingId,
      batchId,
      paidById,
      transactionName,
      details,
      transactionDate: body.transactionDate || new Date().toISOString(),
      currency,
      splitType: body.splitType || "equal",
    });

    const stmt = db.prepare(`
      UPDATE spendings
      SET batch_id = ?,
          name = ?,
          details = ?,
          description = ?,
          amount = ?,
          category = ?,
          currency = ?,
          date = ?,
          paid_by_id = ?,
          split_type = ?,
          split_data = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      batchId,
      transactionName,
      details || null,
      transactionName,
      body.amount ?? 0,
      body.category?.trim() || null,
      currency,
      body.transactionDate || new Date().toISOString(),
      paidById,
      body.splitType || "equal",
      serializeSplitData(body.splitData),
      spendingId,
    );

    const updated = getSpendingsForBatch(batchId).find(
      (spending) => spending.id === spendingId,
    );

    console.debug("[api:%s] spendings.patch stored", requestId, {
      changes: result.changes,
      updated: summarizeSpendingRecord(updated),
    });

    return c.json(updated);
  } catch (error) {
    console.error("[api:/api/spendings PATCH] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.delete("/api/spendings/:id", async (c) => {
  try {
    const requestId = getRequestId(c);
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const spendingId = c.req.param("id");

    console.debug("[api:%s] spendings.delete request", requestId, {
      userId,
      spendingId,
    });

    const existing = db
      .prepare(
        `
      SELECT id, batch_id
      FROM spendings
      WHERE id = ?
    `,
      )
      .get(spendingId) as { id: string; batch_id: string | null } | undefined;

    if (!existing) {
      console.warn("[api:%s] spendings.delete not found", requestId, {
        spendingId,
      });
      return c.json({ error: "Transaction not found" }, 404);
    }

    const batchId = existing.batch_id;
    if (!batchId) {
      console.warn("[api:%s] spendings.delete missing batchId", requestId, {
        spendingId,
      });
      return c.json({ error: "batchId is required" }, 400);
    }

    if (!canAccessBatch(userId, batchId)) {
      console.warn("[api:%s] spendings.delete forbidden", requestId, {
        userId,
        spendingId,
        batchId,
      });
      return c.json({ error: "Forbidden" }, 403);
    }

    const stmt = db.prepare(`
      DELETE FROM spendings
      WHERE id = ?
    `);

    const result = stmt.run(spendingId);

    console.debug("[api:%s] spendings.delete completed", requestId, {
      changes: result.changes,
      spendingId,
    });

    return c.json({ id: spendingId, message: "Transaction deleted" }, 200);
  } catch (error) {
    console.error("[api:/api/spendings DELETE] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/groups/:id/currency-preference", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");

    if (!canAccessBatch(userId, batchId)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const row = db
      .prepare(
        `
      SELECT currency
      FROM batch_user_currency_preferences
      WHERE batch_id = ? AND user_id = ?
      LIMIT 1
    `,
      )
      .get(batchId, userId) as { currency: string } | undefined;

    const currency = normalizeCurrency(row?.currency);
    return c.json({
      batchId,
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    });
  } catch (error) {
    console.error(
      "[api:/api/groups/:id/currency-preference GET] failed:",
      error,
    );
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.put("/api/groups/:id/currency-preference", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const body = (await c.req.json()) as { currency?: string };

    if (!canAccessBatch(userId, batchId)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const currency = normalizeCurrency(body.currency);

    db.prepare(
      `
      INSERT INTO batch_user_currency_preferences (id, batch_id, user_id, currency)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(batch_id, user_id) DO UPDATE SET
        currency = excluded.currency,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(`pref_${randomUUID()}`, batchId, userId, currency);

    return c.json({
      batchId,
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    });
  } catch (error) {
    console.error(
      "[api:/api/groups/:id/currency-preference PUT] failed:",
      error,
    );
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/exchange-rates/resolve", async (c) => {
  try {
    requireAuth(c);
    const body = (await c.req.json()) as {
      baseCurrency?: string;
      targetCurrency?: string;
      dates?: string[];
    };

    const baseCurrency = normalizeCurrency(body.baseCurrency);
    const targetCurrency = normalizeCurrency(body.targetCurrency);
    const dates = Array.from(
      new Set(
        (Array.isArray(body.dates) ? body.dates : [])
          .filter((date): date is string => typeof date === "string")
          .map((date) => date.slice(0, 10)),
      ),
    ).slice(0, 366);

    const ratesByDate: Record<string, number> = {};
    for (const date of dates) {
      ratesByDate[date] = await getOrFetchRate(
        date,
        baseCurrency,
        targetCurrency,
      );
    }

    return c.json({
      baseCurrency,
      targetCurrency,
      ratesByDate,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    });
  } catch (error) {
    console.error("[api:/api/exchange-rates/resolve POST] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Get user's groups (only their own or where they're members)
app.get("/api/groups", (c) => {
  try {
    const auth = requireAuth(c);

    const userId = getUserIdFromSub(auth.sub);

    const batches = db
      .prepare(
        `
      SELECT DISTINCT b.id, b.name, b.emoji, b.description, b.owner_id, b.created_at, b.updated_at
      FROM batches b
      LEFT JOIN batch_members bm ON b.id = bm.batch_id
      WHERE b.owner_id = ? OR bm.user_id = ?
      ORDER BY b.created_at DESC
    `,
      )
      .all(userId, userId) as any[];

    const hydratedBatches = batches.map((batch) => ({
      ...batch,
      members: getBatchMembers(batch.id),
      canEdit: batch.owner_id === userId,
    }));

    return c.json({ batches: hydratedBatches, total: hydratedBatches.length });
  } catch (error) {
    console.error("[api:/api/groups GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

function createOrReuseGroupInvites(
  batchId: string,
  inviterUserId: string,
  inviteEmails: string[],
) {
  const normalizedEmails = Array.from(
    new Set(inviteEmails.map((email) => normalizeEmail(email))),
  ).filter((email) => isValidEmail(email));

  const createStmt = db.prepare(`
    INSERT INTO group_member_invites (id, batch_id, inviter_user_id, email, token, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  return normalizedEmails.map((email) => {
    const existing = db
      .prepare(
        `
      SELECT id, email, token, status, created_at, accepted_at
      FROM group_member_invites
      WHERE batch_id = ? AND email = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `,
      )
      .get(batchId, email) as any;

    const invite =
      existing ||
      (() => {
        const token = randomUUID().replace(/-/g, "");
        const id = `group_invite_${randomUUID()}`;
        createStmt.run(id, batchId, inviterUserId, email, token);
        return db
          .prepare(
            `
          SELECT id, email, token, status, created_at, accepted_at
          FROM group_member_invites
          WHERE id = ?
          LIMIT 1
        `,
          )
          .get(id) as any;
      })();

    return {
      ...invite,
      invitePath: `/invites/group/${invite.token}`,
      inviteUrl: buildInviteUrl(`/invites/group/${invite.token}`),
    };
  });
}

function getGroupPendingInvites(batchId: string) {
  return db
    .prepare(
      `
      SELECT id, email, token, status, created_at, accepted_at
      FROM group_member_invites
      WHERE batch_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `,
    )
    .all(batchId)
    .map((invite: any) => ({
      ...invite,
      invitePath: `/invites/group/${invite.token}`,
      inviteUrl: buildInviteUrl(`/invites/group/${invite.token}`),
    }));
}

// Create group
app.post("/api/groups", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = (await c.req.json()) as {
      name?: string;
      emoji?: string;
      description?: string;
      memberIds?: string[];
      inviteEmails?: string[];
      temporaryMembers?: TemporaryMemberPayload[];
    };

    const userId = getUserIdFromSub(auth.sub);
    const id = randomUUID();
    const name = (body.name || "").trim();
    const emoji = (body.emoji || "💸").trim() || "💸";
    const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
    const memberIds = filterKnownContactMemberIds(userId, requestedMemberIds);
    const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
    const inviteEmails = Array.isArray(body.inviteEmails)
      ? body.inviteEmails.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    if (!name) {
      return c.json({ error: "Group name is required" }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO batches (id, owner_id, name, emoji, description)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      stmt.run(id, userId, name, emoji, body.description || null);
      syncBatchMembers(id, memberIds, temporaryMembers, userId);
    });

    transaction();
    const generatedInvites = createOrReuseGroupInvites(
      id,
      userId,
      inviteEmails,
    );

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
          members: getBatchMembers(id),
          canEdit: true,
        },
        pendingInvites: generatedInvites,
      },
      201,
    );
  } catch (error) {
    console.error("[api:/api/groups POST] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.patch("/api/groups/:id", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = (await c.req.json()) as {
      name?: string;
      emoji?: string;
      description?: string;
      memberIds?: string[];
      inviteEmails?: string[];
      temporaryMembers?: TemporaryMemberPayload[];
    };
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const name = (body.name || "").trim();
    const emoji = (body.emoji || "💸").trim() || "💸";
    const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
    const memberIds = filterKnownContactMemberIds(userId, requestedMemberIds);
    const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
    const inviteEmails = Array.isArray(body.inviteEmails)
      ? body.inviteEmails.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    if (!name) {
      return c.json({ error: "Group name is required" }, 400);
    }

    const existing = db
      .prepare(`SELECT id, owner_id FROM batches WHERE id = ?`)
      .get(batchId) as { id: string; owner_id: string } | undefined;

    if (!existing) {
      return c.json({ error: "Group not found" }, 404);
    }

    if (existing.owner_id !== userId) {
      return c.json({ error: "Only the group owner can update it" }, 403);
    }

    const updateStmt = db.prepare(`
      UPDATE batches
      SET name = ?, emoji = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      updateStmt.run(name, emoji, body.description || null, batchId);
      syncBatchMembers(batchId, memberIds, temporaryMembers, userId);
    });

    transaction();
    const generatedInvites = createOrReuseGroupInvites(
      batchId,
      userId,
      inviteEmails,
    );

    const updated = db
      .prepare(
        `
      SELECT id, name, emoji, description, owner_id, created_at, updated_at
      FROM batches
      WHERE id = ?
    `,
      )
      .get(batchId) as any;

    return c.json({
      ...updated,
      members: getBatchMembers(batchId),
      canEdit: true,
      pendingInvites: getGroupPendingInvites(batchId),
      generatedInvites,
    });
  } catch (error) {
    console.error("[api:/api/groups PATCH] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/groups/:id/member-invites", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");

    const batch = db
      .prepare(`SELECT owner_id FROM batches WHERE id = ? LIMIT 1`)
      .get(batchId) as { owner_id: string } | undefined;

    if (!batch) {
      return c.json({ error: "Group not found" }, 404);
    }

    if (batch.owner_id !== userId) {
      return c.json({ error: "Only the group owner can view invites" }, 403);
    }

    return c.json({ invites: getGroupPendingInvites(batchId) });
  } catch (error) {
    console.error("[api:/api/groups/:id/member-invites GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.get("/api/group-invites/:token", (c) => {
  try {
    requireAuth(c);
    const token = c.req.param("token");

    const invite = db
      .prepare(
        `
      SELECT gmi.id,
             gmi.email,
             gmi.status,
             gmi.created_at,
             b.id AS group_id,
             b.name AS group_name,
             b.emoji AS group_emoji,
             inviter.id AS inviter_id,
             inviter.email AS inviter_email,
             inviter.name AS inviter_name
      FROM group_member_invites gmi
      JOIN batches b ON b.id = gmi.batch_id
      JOIN users inviter ON inviter.id = gmi.inviter_user_id
      WHERE gmi.token = ?
      LIMIT 1
    `,
      )
      .get(token) as any;

    if (!invite) {
      return c.json({ error: "Invite not found" }, 404);
    }

    return c.json({
      ...invite,
      invitePath: `/invites/group/${token}`,
      inviteUrl: buildInviteUrl(`/invites/group/${token}`),
    });
  } catch (error) {
    console.error("[api:/api/group-invites/:token GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/group-invites/:token/accept", (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const token = c.req.param("token");

    const invite = db
      .prepare(
        `
      SELECT gmi.id,
             gmi.batch_id,
             gmi.inviter_user_id,
             gmi.email,
             gmi.status,
             b.id AS group_id,
             b.owner_id
      FROM group_member_invites gmi
      JOIN batches b ON b.id = gmi.batch_id
      WHERE gmi.token = ?
      LIMIT 1
    `,
      )
      .get(token) as
      | {
          id: string;
          batch_id: string;
          inviter_user_id: string;
          email: string;
          status: string;
          group_id: string;
          owner_id: string;
        }
      | undefined;

    if (!invite) {
      return c.json({ error: "Invite not found" }, 404);
    }

    if (invite.status !== "pending") {
      return c.json({ error: "Invite is no longer pending" }, 409);
    }

    const currentUser = db
      .prepare(`SELECT id, email FROM users WHERE id = ? LIMIT 1`)
      .get(userId) as { id: string; email: string } | undefined;

    if (!currentUser) {
      return c.json({ error: "Current user not found" }, 404);
    }

    if (normalizeEmail(currentUser.email) !== normalizeEmail(invite.email)) {
      return c.json({ error: "This invite was issued for another email" }, 403);
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `
      INSERT INTO batch_members (id, batch_id, user_id)
      VALUES (?, ?, ?)
      ON CONFLICT(batch_id, user_id) DO NOTHING
    `,
      ).run(`member_${randomUUID()}`, invite.batch_id, userId);

      db.prepare(
        `
      UPDATE group_member_invites
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      ).run(userId, invite.id);

      addContactPair(invite.inviter_user_id, userId, "group_invite");
    });

    transaction();

    const matchingTemporaryMember = db
      .prepare(
        `
      SELECT id
      FROM batch_temporary_members
      WHERE batch_id = ? AND LOWER(email) = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
      )
      .get(invite.batch_id, normalizeEmail(invite.email)) as
      | { id: string }
      | undefined;

    if (matchingTemporaryMember) {
      replaceTemporaryMemberWithUser(
        invite.batch_id,
        matchingTemporaryMember.id,
        userId,
      );
    }

    return c.json({
      message: "Invite accepted",
      groupId: invite.group_id,
    });
  } catch (error) {
    console.error("[api:/api/group-invites/:token/accept POST] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

app.post("/api/groups/:id/temporary-members/:memberId/replace", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const temporaryMemberId = c.req.param("memberId");
    const body = (await c.req.json()) as { userId?: string };
    const replacementUserId =
      typeof body.userId === "string" ? body.userId : "";

    if (!replacementUserId) {
      return c.json({ error: "userId is required" }, 400);
    }

    const batch = db
      .prepare(`SELECT owner_id FROM batches WHERE id = ? LIMIT 1`)
      .get(batchId) as { owner_id: string } | undefined;

    if (!batch) {
      return c.json({ error: "Group not found" }, 404);
    }

    if (batch.owner_id !== userId) {
      return c.json(
        { error: "Only the group owner can replace a temporary member" },
        403,
      );
    }

    const allowedMembers = new Set(
      filterKnownContactMemberIds(userId, [replacementUserId]),
    );
    if (!allowedMembers.has(replacementUserId)) {
      return c.json(
        { error: "Replacement user must be one of your known contacts" },
        400,
      );
    }

    const replaced = replaceTemporaryMemberWithUser(
      batchId,
      temporaryMemberId,
      replacementUserId,
    );

    if (!replaced) {
      return c.json({ error: "Temporary member not found" }, 404);
    }

    return c.json({
      message: "Temporary member replaced",
      members: getBatchMembers(batchId),
    });
  } catch (error) {
    console.error(
      "[api:/api/groups/:id/temporary-members/:memberId/replace POST] failed:",
      error,
    );
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Get group column visibility
app.get("/api/groups/:id/column-visibility", (c) => {
  try {
    const auth = requireAuth(c);
    const groupId = c.req.param("id");
    const userId = getUserIdFromSub(auth.sub);

    // Verify user is owner or member
    const isMember = db
      .prepare("SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?")
      .get(groupId, userId);
    const isOwner = db
      .prepare("SELECT 1 FROM batches WHERE id = ? AND owner_id = ?")
      .get(groupId, userId);

    if (!isMember && !isOwner) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const row = db
      .prepare(
        "SELECT visible_columns FROM group_column_visibility WHERE group_id = ? AND user_id = ?",
      )
      .get(groupId, userId) as any;

    const visibleColumns = row
      ? row.visible_columns.split(",")
      : "name,amount,currency,paid_by,date,category,split,description".split(
          ",",
        );

    return c.json({ visibleColumns });
  } catch (error) {
    console.error("[api:/api/groups/:id/column-visibility GET] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// Set group column visibility
app.put("/api/groups/:id/column-visibility", async (c) => {
  try {
    const auth = requireAuth(c);
    const groupId = c.req.param("id");
    const userId = getUserIdFromSub(auth.sub);
    const body = (await c.req.json()) as { visibleColumns?: string[] };

    // Verify user is owner or member
    const isMember = db
      .prepare("SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?")
      .get(groupId, userId);
    const isOwner = db
      .prepare("SELECT 1 FROM batches WHERE id = ? AND owner_id = ?")
      .get(groupId, userId);

    if (!isMember && !isOwner) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const visibleColumns = Array.isArray(body.visibleColumns)
      ? body.visibleColumns.join(",")
      : "name,amount,currency,paid_by,date,category,split,description";

    const stmt = db.prepare(`
      INSERT INTO group_column_visibility (id, group_id, user_id, visible_columns)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET 
        visible_columns = excluded.visible_columns,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(randomUUID(), groupId, userId, visibleColumns);

    return c.json({ visibleColumns: visibleColumns.split(",") });
  } catch (error) {
    console.error("[api:/api/groups/:id/column-visibility PUT] failed:", error);
    return c.json(
      {
        error: isUnauthorizedError(error)
          ? "Unauthorized"
          : "Internal Server Error",
      },
      isUnauthorizedError(error) ? 401 : 500,
    );
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// Start server
const port = parseInt(process.env.PORT || "3000");

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
