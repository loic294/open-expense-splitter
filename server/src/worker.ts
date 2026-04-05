/**
 * Cloudflare Workers entry point for the Better Expense Splitter API.
 *
 * This file is a self-contained Hono application that targets the Cloudflare
 * Workers runtime. It uses:
 *   - Cloudflare D1 (SQLite-compatible) for persistence
 *   - jose (Web Crypto) for Auth0 JWT verification
 *
 * The existing server/src/index.ts (Node.js + better-sqlite3) is left
 * completely untouched and continues to work for local Docker development.
 *
 * Deploy:
 *   npx wrangler d1 create batch-spending-splitter
 *   npx wrangler d1 migrations apply batch-spending-splitter --remote
 *   npx wrangler deploy
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Minimal local D1 type declarations – avoids pulling in @cloudflare/workers-types
// and conflicting with the existing Node.js tsconfig.
// ---------------------------------------------------------------------------

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    meta: Record<string, unknown>;
  }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ results: T[]; meta: Record<string, unknown> }>>;
}

// ---------------------------------------------------------------------------
// App types
// ---------------------------------------------------------------------------

type Bindings = {
  DB: D1Database;
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_AUDIENCE?: string;
  APP_BASE_URL?: string;
  PUBLIC_FRONTEND_URL?: string;
};

type AuthCtx = { userId: string; email: string; sub: string };
type Variables = { auth: AuthCtx | null };
type HonoCtx = { Bindings: Bindings; Variables: Variables };

type TemporaryMemberPayload = {
  id?: string;
  name: string;
  email: string | null;
};

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auth – jose (Web Crypto, works in Workers runtime)
// ---------------------------------------------------------------------------

// JWKS fetcher instances are cached per Auth0 domain across invocations
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(domain: string) {
  if (!jwksCache.has(domain)) {
    jwksCache.set(
      domain,
      createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`)),
    );
  }
  return jwksCache.get(domain)!;
}

async function verifyToken(
  token: string,
  env: Bindings,
): Promise<AuthCtx | null> {
  const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE } = env;
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    console.warn("[auth] Auth0 not configured, skipping verification");
    return null;
  }
  try {
    const JWKS = getJWKS(AUTH0_DOMAIN);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_AUDIENCE || AUTH0_CLIENT_ID,
    });
    return {
      sub: payload.sub ?? "",
      email:
        ((payload as Record<string, unknown>).email as string | undefined) ??
        "",
      userId: payload.sub ?? "",
    };
  } catch (err) {
    console.error("[auth] Token verification failed:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireAuth(c: { get: (key: string) => any }): AuthCtx {
  const auth = c.get("auth") as AuthCtx | null;
  if (!auth) throw new Error("Unauthorized");
  return auth;
}

// ---------------------------------------------------------------------------
// Pure utilities (no DB dependency)
// ---------------------------------------------------------------------------

function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && err.message === "Unauthorized";
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
    ? memberIds.filter((v): v is string => typeof v === "string")
    : [];
  return Array.from(new Set([ownerId, ...ids]));
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function isValidEmail(v: string): boolean {
  return /^\S+@\S+\.\S+$/.test(v);
}

function buildInviteUrl(path: string, env: Bindings): string {
  // Try PUBLIC_FRONTEND_URL first (production), then APP_BASE_URL (legacy), then localhost (dev)
  const base = (
    env.PUBLIC_FRONTEND_URL ||
    env.APP_BASE_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeTemporaryMembers(raw: unknown): TemporaryMemberPayload[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
    )
    .map((v) => ({
      id: typeof v.id === "string" && v.id.trim() ? v.id.trim() : undefined,
      name: typeof v.name === "string" ? v.name.trim().slice(0, 80) : "",
      email: normalizeEmail(v.email) || null,
    }))
    .filter((v) => v.name.length > 0)
    .filter((v) => {
      const key = v.id || `${v.name}|${v.email || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseSplitData(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeSplitData(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function replaceMemberInSplitData(
  raw: string | null,
  fromId: string,
  toId: string,
): string | null {
  const parsed = parseSplitData(raw) as {
    includedMemberIds?: unknown;
    values?: unknown;
  } | null;
  if (!parsed || typeof parsed !== "object") return raw;

  const included = Array.isArray(parsed.includedMemberIds)
    ? (parsed.includedMemberIds as string[])
        .filter((v): v is string => typeof v === "string")
        .map((v) => (v === fromId ? toId : v))
    : [];
  const dedupedIncluded = Array.from(new Set(included));
  const values =
    parsed.values && typeof parsed.values === "object"
      ? { ...(parsed.values as Record<string, number>) }
      : {};

  if (Object.prototype.hasOwnProperty.call(values, fromId)) {
    values[toId] = Number(values[toId] || 0) + Number(values[fromId] || 0);
    delete values[fromId];
  }
  return serializeSplitData({ includedMemberIds: dedupedIncluded, values });
}

// CSV import helpers
function sanitizeTextValue(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeAmountValue(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value)
      ? Math.round(Math.abs(value) * 100) / 100
      : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.")
    return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed)
    ? Math.round(Math.abs(parsed) * 100) / 100
    : null;
}

function sanitizeDateValue(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const raw = value.trim();
  if (!raw) return new Date().toISOString();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const fb = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    if (!Number.isNaN(fb.getTime())) return fb.toISOString();
  }
  return new Date().toISOString();
}

function resolvePaidById(
  value: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  members: Array<{ id: string; email: string; name: string | null }>,
  fallbackUserId: string,
): string {
  if (typeof value !== "string" || !value.trim())
    return members[0]?.id || fallbackUserId;
  const norm = value.trim().toLowerCase();
  const matched = members.find(
    (m) =>
      m.id.toLowerCase() === norm ||
      m.email.toLowerCase() === norm ||
      (m.name && m.name.toLowerCase() === norm),
  );
  return matched?.id || members[0]?.id || fallbackUserId;
}

function sanitizeImportRow(
  row: CsvImportRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  if (amount === null) return null;
  return {
    amount,
    name: sanitizeTextValue(row.name, 120) || "Imported transaction",
    details: sanitizeTextValue(row.description, 300),
    transactionDate: sanitizeDateValue(row.transactionDate),
    category: sanitizeTextValue(row.category, 80) || null,
    paidById: resolvePaidById(row.paidById, members, fallbackUserId),
  };
}

// ---------------------------------------------------------------------------
// Async DB helpers (all accept D1Database, mirror the sync helpers in index.ts)
// ---------------------------------------------------------------------------

async function getBatchTemporaryMembers(
  db: D1Database,
  batchId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
async function getBatchMembers(
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

async function getBatchMemberIds(
  db: D1Database,
  batchId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await getBatchMembers(db, batchId)).map((m: any) => m.id as string);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getKnownContacts(
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

async function filterKnownContactMemberIds(
  db: D1Database,
  ownerId: string,
  requestedIds: string[],
): Promise<string[]> {
  const contacts = await getKnownContacts(db, ownerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const known = new Set(contacts.map((c: any) => c.id as string));
  return requestedIds.filter((id) => id === ownerId || known.has(id));
}

async function canAccessBatch(
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

async function addContactPair(
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
      .bind(`contact_${crypto.randomUUID()}`, userA, userB, source),
    db
      .prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      )
      .bind(`contact_${crypto.randomUUID()}`, userB, userA, source),
  ]);
}

async function syncBatchMembers(
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
        .bind(`member_${crypto.randomUUID()}`, batchId, id),
    ),
    ...temporaryMembers.map((m) =>
      db
        .prepare(
          `INSERT INTO batch_temporary_members
            (id, batch_id, name, email, created_by_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          m.id || `temp_${crypto.randomUUID()}`,
          batchId,
          m.name,
          m.email,
          actorUserId,
        ),
    ),
  ];
  await db.batch(stmts);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSpendingsForBatch(
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

async function getGroupPendingInvites(
  db: D1Database,
  batchId: string,
  env: Bindings,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    inviteUrl: buildInviteUrl(`/invites/group/${invite.token}`, env),
  }));
}

async function createOrReuseGroupInvites(
  db: D1Database,
  batchId: string,
  inviterUserId: string,
  inviteEmails: string[],
  env: Bindings,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const token = crypto.randomUUID().replace(/-/g, "");
      const id = `group_invite_${crypto.randomUUID()}`;
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
        inviteUrl: buildInviteUrl(`/invites/group/${invite.token}`, env),
      });
    }
  }
  return result;
}

async function replaceTemporaryMemberWithUser(
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
      .bind(`member_${crypto.randomUUID()}`, batchId, userId),
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

async function fetchHistoricalRateFromProvider(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): Promise<number> {
  const url = `https://api.frankfurter.app/${encodeURIComponent(date)}?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(targetCurrency)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FX provider error ${response.status}`);
  const payload = (await response.json()) as {
    rates?: Record<string, number>;
  };
  const rate = payload.rates?.[targetCurrency];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
    throw new Error("FX provider returned invalid rate");
  return rate;
}

async function getOrFetchRate(
  db: D1Database,
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): Promise<number> {
  if (baseCurrency === targetCurrency) return 1;
  const cached = await db
    .prepare(
      `SELECT rate FROM exchange_rates
       WHERE rate_date = ? AND base_currency = ? AND target_currency = ?
       LIMIT 1`,
    )
    .bind(date, baseCurrency, targetCurrency)
    .first<{ rate: number }>();
  if (cached?.rate && Number.isFinite(cached.rate) && cached.rate > 0)
    return cached.rate;

  const rate = await fetchHistoricalRateFromProvider(
    date,
    baseCurrency,
    targetCurrency,
  );
  await db
    .prepare(
      `INSERT INTO exchange_rates (id, rate_date, base_currency, target_currency, rate)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(rate_date, base_currency, target_currency)
       DO UPDATE SET rate = excluded.rate, fetched_at = CURRENT_TIMESTAMP`,
    )
    .bind(`fx_${crypto.randomUUID()}`, date, baseCurrency, targetCurrency, rate)
    .run();
  return rate;
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono<HonoCtx>();

// CORS – allow the configured Pages URL and localhost in development
app.use("*", async (c, next) => {
  const origins = ["http://localhost:5173"];
  if (c.env.APP_BASE_URL) origins.push(c.env.APP_BASE_URL);
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
  })(c, next);
});

// Request logging
app.use("*", async (c, next) => {
  const start = Date.now();
  const reqId = c.req.header("x-request-id") || crypto.randomUUID();
  c.header("X-Request-ID", reqId);
  console.debug(`[api:${reqId}] -> ${c.req.method} ${c.req.path}`);
  await next();
  console.debug(
    `[api:${reqId}] <- ${c.req.method} ${c.req.path} ${c.res.status} (${Date.now() - start}ms)`,
  );
});

// Auth
app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    c.set("auth", null);
    return next();
  }
  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const auth = await verifyToken(token, c.env);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);
  c.set("auth", auth);
  return next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (c) =>
  c.json({
    name: "Better Expense Splitter API",
    version: "1.0.0",
    runtime: "cloudflare-workers",
    endpoints: {
      health: "/api/health",
      spendings: "/api/spendings",
      groups: "/api/groups",
    },
  }),
);

app.get("/api/health", (c) =>
  c.json({ status: "ok", message: "Worker is running" }),
);

app.get("/api/users", async (c) => {
  try {
    requireAuth(c);
    const { results } = await c.env.DB.prepare(
      "SELECT id, auth0_id, email, name, picture, created_at FROM users ORDER BY COALESCE(name, email) ASC",
    ).all();
    return c.json({ users: results, total: results.length });
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

app.get("/api/contacts", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const contacts = await getKnownContacts(c.env.DB, userId);
    const { results } = await c.env.DB.prepare(
      `SELECT id, email, token, status, created_at, accepted_at
       FROM platform_invites WHERE inviter_user_id = ? ORDER BY created_at DESC`,
    )
      .bind(userId)
      .all();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentInvites = results.map((invite: any) => ({
      ...invite,
      invitePath: `/invites/platform/${invite.token}`,
      inviteUrl: buildInviteUrl(`/invites/platform/${invite.token}`, c.env),
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

app.post("/api/contacts/invites", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = await c.req.json<{ email?: string }>();
    const email = normalizeEmail(body.email);
    if (email && !isValidEmail(email))
      return c.json({ error: "Invalid email address" }, 400);
    const token = crypto.randomUUID().replace(/-/g, "");
    const inviteId = `platform_invite_${crypto.randomUUID()}`;
    await c.env.DB.prepare(
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
        inviteUrl: buildInviteUrl(`/invites/platform/${token}`, c.env),
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

app.get("/api/platform-invites/:token", async (c) => {
  try {
    requireAuth(c);
    const token = c.req.param("token");
    const invite = await c.env.DB.prepare(
      `SELECT pi.id, pi.email, pi.status, pi.created_at,
              inviter.id AS inviter_id, inviter.email AS inviter_email, inviter.name AS inviter_name
       FROM platform_invites pi
       JOIN users inviter ON inviter.id = pi.inviter_user_id
       WHERE pi.token = ? LIMIT 1`,
    )
      .bind(token)
      .first<Record<string, unknown>>();
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    return c.json({
      ...invite,
      invitePath: `/invites/platform/${token}`,
      inviteUrl: buildInviteUrl(`/invites/platform/${token}`, c.env),
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

app.post("/api/platform-invites/:token/accept", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const token = c.req.param("token");
    const invite = await c.env.DB.prepare(
      "SELECT id, inviter_user_id, email, status FROM platform_invites WHERE token = ? LIMIT 1",
    )
      .bind(token)
      .first<{
        id: string;
        inviter_user_id: string;
        email: string | null;
        status: string;
      }>();
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.status !== "pending")
      return c.json({ error: "Invite is no longer pending" }, 409);
    if (invite.inviter_user_id === userId)
      return c.json({ error: "You cannot accept your own invite" }, 400);

    const currentUser = await c.env.DB.prepare(
      "SELECT id, email FROM users WHERE id = ? LIMIT 1",
    )
      .bind(userId)
      .first<{ id: string; email: string }>();
    if (!currentUser) return c.json({ error: "Current user not found" }, 404);
    if (invite.email && normalizeEmail(currentUser.email) !== invite.email)
      return c.json({ error: "This invite was issued for another email" }, 403);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE platform_invites
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(userId, invite.id),
      c.env.DB.prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      ).bind(
        `contact_${crypto.randomUUID()}`,
        invite.inviter_user_id,
        userId,
        "platform_invite",
      ),
      c.env.DB.prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      ).bind(
        `contact_${crypto.randomUUID()}`,
        userId,
        invite.inviter_user_id,
        "platform_invite",
      ),
    ]);
    return c.json({
      message: "Invite accepted",
      inviterUserId: invite.inviter_user_id,
      acceptedByUserId: userId,
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

app.get("/api/me", async (c) => {
  try {
    const auth = requireAuth(c);
    const user = await c.env.DB.prepare(
      "SELECT id, auth0_id, email, name, picture, created_at FROM users WHERE auth0_id = ?",
    )
      .bind(auth.sub)
      .first();
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json(user);
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

app.post("/api/auth/login", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    await c.env.DB.prepare(
      `INSERT INTO users (id, auth0_id, email, name, picture)
       VALUES (?, ?, ?, ?, '')
       ON CONFLICT(auth0_id) DO UPDATE SET
         email = COALESCE(users.email, excluded.email),
         name  = COALESCE(users.name,  excluded.name),
         picture = COALESCE(users.picture, excluded.picture),
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(userId, auth.sub, auth.email, auth.email)
      .run();
    return c.json({ message: "User created/updated", userId });
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

app.patch("/api/me", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = await c.req.json<{
      name?: string;
      email?: string;
      picture?: string;
    }>();
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const picture = (body.picture || "").trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return c.json({ error: "Invalid email address" }, 400);

    const result = await c.env.DB.prepare(
      `UPDATE users
       SET name = ?, email = ?, picture = ?, updated_at = CURRENT_TIMESTAMP
       WHERE auth0_id = ?`,
    )
      .bind(name || null, email, picture || null, auth.sub)
      .run();
    if (!result.meta.changes) return c.json({ error: "User not found" }, 404);

    const updated = await c.env.DB.prepare(
      "SELECT id, auth0_id, email, name, picture, created_at, updated_at FROM users WHERE auth0_id = ?",
    )
      .bind(auth.sub)
      .first();
    return c.json(updated);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    )
      return c.json({ error: "Email already in use" }, 409);
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

app.get("/api/spendings", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.query("batchId");
    if (!batchId) return c.json({ error: "batchId is required" }, 400);
    if (!(await canAccessBatch(c.env.DB, userId, batchId)))
      return c.json({ error: "Forbidden" }, 403);

    const spendings = await getSpendingsForBatch(c.env.DB, batchId);
    const { results } = await c.env.DB.prepare(
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

app.get("/api/spendings/import-mapping", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const row = await c.env.DB.prepare(
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

app.put("/api/spendings/import-mapping", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = await c.req.json<{ mapping?: unknown }>();
    const mapping =
      body.mapping && typeof body.mapping === "object"
        ? (body.mapping as CsvMapping)
        : {};
    await c.env.DB.prepare(
      `INSERT INTO user_csv_mappings (id, user_id, mapping_json)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET mapping_json = excluded.mapping_json, updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(`csv_map_${crypto.randomUUID()}`, userId, JSON.stringify(mapping))
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

app.post("/api/spendings/import", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const body = await c.req.json<{
      batchId?: string;
      rows?: CsvImportRow[];
      currency?: string;
    }>();
    if (!body.batchId) return c.json({ error: "batchId is required" }, 400);
    if (!(await canAccessBatch(c.env.DB, userId, body.batchId)))
      return c.json({ error: "Forbidden" }, 403);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return c.json({ error: "rows are required" }, 400);

    const importCurrency = normalizeCurrency(body.currency);
    const members = await getBatchMembers(c.env.DB, body.batchId);
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
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO spendings
            (id, user_id, batch_id, name, details, description, amount,
             category, currency, date, paid_by_id, split_type, split_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
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
        ),
      );
    }
    if (stmts.length > 0) await c.env.DB.batch(stmts);

    const allSpendings = await getSpendingsForBatch(c.env.DB, body.batchId);
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

app.post("/api/spendings", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = await c.req.json<{
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
    }>();
    const userId = getUserIdFromSub(auth.sub);
    if (!body.batchId) return c.json({ error: "batchId is required" }, 400);
    if (!(await canAccessBatch(c.env.DB, userId, body.batchId)))
      return c.json({ error: "Forbidden" }, 403);

    const batchMemberIds = await getBatchMemberIds(c.env.DB, body.batchId);
    const paidById =
      body.paidById && batchMemberIds.includes(body.paidById)
        ? body.paidById
        : batchMemberIds[0] || userId;
    const transactionName = (body.name || "").trim() || "New transaction";
    const details = (body.description || "").trim();
    const transactionDate = body.transactionDate || new Date().toISOString();
    const currency = normalizeCurrency(body.currency);
    const id = `spending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await c.env.DB.prepare(
      `INSERT INTO spendings
        (id, user_id, batch_id, name, details, description, amount,
         category, currency, date, paid_by_id, split_type, split_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        currency,
        transactionDate,
        paidById,
        body.splitType || "equal",
        serializeSplitData(body.splitData),
      )
      .run();

    const allSpendings = await getSpendingsForBatch(c.env.DB, body.batchId);
    const created = allSpendings.find((s) => s.id === id);
    return c.json({ id, message: "Spending recorded", spending: created }, 201);
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

app.patch("/api/spendings/:id", async (c) => {
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
      currency?: string;
      paidById?: string;
      splitType?: string;
      splitData?: unknown;
    }>();

    const existing = await c.env.DB.prepare(
      "SELECT id, batch_id FROM spendings WHERE id = ?",
    )
      .bind(spendingId)
      .first<{ id: string; batch_id: string | null }>();
    if (!existing) return c.json({ error: "Transaction not found" }, 404);

    const batchId = body.batchId || existing.batch_id;
    if (!batchId) return c.json({ error: "batchId is required" }, 400);
    if (!(await canAccessBatch(c.env.DB, userId, batchId)))
      return c.json({ error: "Forbidden" }, 403);

    const batchMemberIds = await getBatchMemberIds(c.env.DB, batchId);
    const paidById =
      body.paidById && batchMemberIds.includes(body.paidById)
        ? body.paidById
        : batchMemberIds[0] || userId;
    const transactionName = (body.name || "").trim() || "New transaction";
    const details = (body.description || "").trim();
    const currency = normalizeCurrency(body.currency);

    await c.env.DB.prepare(
      `UPDATE spendings
       SET batch_id = ?, name = ?, details = ?, description = ?, amount = ?,
           category = ?, currency = ?, date = ?, paid_by_id = ?,
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
        currency,
        body.transactionDate || new Date().toISOString(),
        paidById,
        body.splitType || "equal",
        serializeSplitData(body.splitData),
        spendingId,
      )
      .run();

    const allSpendings = await getSpendingsForBatch(c.env.DB, batchId);
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

app.delete("/api/spendings/:id", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const spendingId = c.req.param("id");

    const existing = await c.env.DB.prepare(
      "SELECT id, batch_id FROM spendings WHERE id = ?",
    )
      .bind(spendingId)
      .first<{ id: string; batch_id: string | null }>();
    if (!existing) return c.json({ error: "Transaction not found" }, 404);

    const batchId = existing.batch_id;
    if (!batchId) return c.json({ error: "batchId is required" }, 400);
    if (!(await canAccessBatch(c.env.DB, userId, batchId)))
      return c.json({ error: "Forbidden" }, 403);

    await c.env.DB.prepare("DELETE FROM spendings WHERE id = ?")
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

app.get("/api/groups/:id/currency-preference", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    if (!(await canAccessBatch(c.env.DB, userId, batchId)))
      return c.json({ error: "Forbidden" }, 403);
    const row = await c.env.DB.prepare(
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

app.put("/api/groups/:id/currency-preference", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const body = await c.req.json<{ currency?: string }>();
    if (!(await canAccessBatch(c.env.DB, userId, batchId)))
      return c.json({ error: "Forbidden" }, 403);
    const currency = normalizeCurrency(body.currency);
    await c.env.DB.prepare(
      `INSERT INTO batch_user_currency_preferences (id, batch_id, user_id, currency)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(batch_id, user_id)
       DO UPDATE SET currency = excluded.currency, updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(`pref_${crypto.randomUUID()}`, batchId, userId, currency)
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

app.post("/api/exchange-rates/resolve", async (c) => {
  try {
    requireAuth(c);
    const body = await c.req.json<{
      baseCurrency?: string;
      targetCurrency?: string;
      dates?: string[];
    }>();
    const baseCurrency = normalizeCurrency(body.baseCurrency);
    const targetCurrency = normalizeCurrency(body.targetCurrency);
    const dates = Array.from(
      new Set(
        (Array.isArray(body.dates) ? body.dates : [])
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.slice(0, 10)),
      ),
    ).slice(0, 366);

    const ratesByDate: Record<string, number> = {};
    for (const date of dates) {
      ratesByDate[date] = await getOrFetchRate(
        c.env.DB,
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

app.get("/api/groups", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const { results } = await c.env.DB.prepare(
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
        members: await getBatchMembers(c.env.DB, batch.id as string),
        canEdit: batch.owner_id === userId,
      })),
    );
    return c.json({ batches: hydratedBatches, total: hydratedBatches.length });
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

app.post("/api/groups", async (c) => {
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
    const id = crypto.randomUUID();

    const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
    const memberIds = await filterKnownContactMemberIds(
      c.env.DB,
      userId,
      requestedMemberIds,
    );
    const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
    const inviteEmails = Array.isArray(body.inviteEmails)
      ? body.inviteEmails.filter((v): v is string => typeof v === "string")
      : [];

    await c.env.DB.prepare(
      "INSERT INTO batches (id, owner_id, name, emoji, description) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(id, userId, name, emoji, body.description || null)
      .run();
    await syncBatchMembers(c.env.DB, id, memberIds, temporaryMembers, userId);

    const generatedInvites = await createOrReuseGroupInvites(
      c.env.DB,
      id,
      userId,
      inviteEmails,
      c.env,
    );
    const members = await getBatchMembers(c.env.DB, id);
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

app.patch("/api/groups/:id", async (c) => {
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

    const existing = await c.env.DB.prepare(
      "SELECT id, owner_id FROM batches WHERE id = ?",
    )
      .bind(batchId)
      .first<{ id: string; owner_id: string }>();
    if (!existing) return c.json({ error: "Group not found" }, 404);
    if (existing.owner_id !== userId)
      return c.json({ error: "Only the group owner can update it" }, 403);

    const requestedMemberIds = normalizeMemberIds(userId, body.memberIds);
    const memberIds = await filterKnownContactMemberIds(
      c.env.DB,
      userId,
      requestedMemberIds,
    );
    const temporaryMembers = normalizeTemporaryMembers(body.temporaryMembers);
    const inviteEmails = Array.isArray(body.inviteEmails)
      ? body.inviteEmails.filter((v): v is string => typeof v === "string")
      : [];

    await c.env.DB.prepare(
      `UPDATE batches
       SET name = ?, emoji = ?, description = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(name, emoji, body.description || null, batchId)
      .run();
    await syncBatchMembers(
      c.env.DB,
      batchId,
      memberIds,
      temporaryMembers,
      userId,
    );
    const generatedInvites = await createOrReuseGroupInvites(
      c.env.DB,
      batchId,
      userId,
      inviteEmails,
      c.env,
    );

    const updated = await c.env.DB.prepare(
      "SELECT id, name, emoji, description, owner_id, created_at, updated_at FROM batches WHERE id = ?",
    )
      .bind(batchId)
      .first();
    const members = await getBatchMembers(c.env.DB, batchId);
    const pendingInvites = await getGroupPendingInvites(
      c.env.DB,
      batchId,
      c.env,
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

app.get("/api/groups/:id/member-invites", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const batch = await c.env.DB.prepare(
      "SELECT owner_id FROM batches WHERE id = ? LIMIT 1",
    )
      .bind(batchId)
      .first<{ owner_id: string }>();
    if (!batch) return c.json({ error: "Group not found" }, 404);
    if (batch.owner_id !== userId)
      return c.json({ error: "Only the group owner can view invites" }, 403);
    return c.json({
      invites: await getGroupPendingInvites(c.env.DB, batchId, c.env),
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

app.get("/api/group-invites/:token", async (c) => {
  try {
    requireAuth(c);
    const token = c.req.param("token");
    const invite = await c.env.DB.prepare(
      `SELECT gmi.id, gmi.email, gmi.status, gmi.created_at,
              b.id AS group_id, b.name AS group_name, b.emoji AS group_emoji,
              inviter.id AS inviter_id,
              inviter.email AS inviter_email,
              inviter.name AS inviter_name
       FROM group_member_invites gmi
       JOIN batches b ON b.id = gmi.batch_id
       JOIN users inviter ON inviter.id = gmi.inviter_user_id
       WHERE gmi.token = ? LIMIT 1`,
    )
      .bind(token)
      .first<Record<string, unknown>>();
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    return c.json({
      ...invite,
      invitePath: `/invites/group/${token}`,
      inviteUrl: buildInviteUrl(`/invites/group/${token}`, c.env),
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

app.post("/api/group-invites/:token/accept", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const token = c.req.param("token");

    const invite = await c.env.DB.prepare(
      `SELECT gmi.id, gmi.batch_id, gmi.inviter_user_id,
              gmi.email, gmi.status, b.id AS group_id, b.owner_id
       FROM group_member_invites gmi
       JOIN batches b ON b.id = gmi.batch_id
       WHERE gmi.token = ? LIMIT 1`,
    )
      .bind(token)
      .first<{
        id: string;
        batch_id: string;
        inviter_user_id: string;
        email: string;
        status: string;
        group_id: string;
        owner_id: string;
      }>();
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.status !== "pending")
      return c.json({ error: "Invite is no longer pending" }, 409);

    const currentUser = await c.env.DB.prepare(
      "SELECT id, email FROM users WHERE id = ? LIMIT 1",
    )
      .bind(userId)
      .first<{ id: string; email: string }>();
    if (!currentUser) return c.json({ error: "Current user not found" }, 404);
    if (normalizeEmail(currentUser.email) !== normalizeEmail(invite.email))
      return c.json({ error: "This invite was issued for another email" }, 403);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO batch_members (id, batch_id, user_id)
         VALUES (?, ?, ?) ON CONFLICT(batch_id, user_id) DO NOTHING`,
      ).bind(`member_${crypto.randomUUID()}`, invite.batch_id, userId),
      c.env.DB.prepare(
        `UPDATE group_member_invites
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(userId, invite.id),
      c.env.DB.prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      ).bind(
        `contact_${crypto.randomUUID()}`,
        invite.inviter_user_id,
        userId,
        "group_invite",
      ),
      c.env.DB.prepare(
        `INSERT INTO user_contacts (id, user_id, contact_user_id, source)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, contact_user_id) DO NOTHING`,
      ).bind(
        `contact_${crypto.randomUUID()}`,
        userId,
        invite.inviter_user_id,
        "group_invite",
      ),
    ]);

    const matchingTemp = await c.env.DB.prepare(
      `SELECT id FROM batch_temporary_members
       WHERE batch_id = ? AND LOWER(email) = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(invite.batch_id, normalizeEmail(invite.email))
      .first<{ id: string }>();
    if (matchingTemp) {
      await replaceTemporaryMemberWithUser(
        c.env.DB,
        invite.batch_id,
        matchingTemp.id,
        userId,
      );
    }
    return c.json({ message: "Invite accepted", groupId: invite.group_id });
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

app.post("/api/groups/:id/temporary-members/:memberId/replace", async (c) => {
  try {
    const auth = requireAuth(c);
    const userId = getUserIdFromSub(auth.sub);
    const batchId = c.req.param("id");
    const temporaryMemberId = c.req.param("memberId");
    const body = await c.req.json<{ userId?: string }>();
    const replacementUserId =
      typeof body.userId === "string" ? body.userId : "";
    if (!replacementUserId) return c.json({ error: "userId is required" }, 400);

    const batch = await c.env.DB.prepare(
      "SELECT owner_id FROM batches WHERE id = ? LIMIT 1",
    )
      .bind(batchId)
      .first<{ owner_id: string }>();
    if (!batch) return c.json({ error: "Group not found" }, 404);
    if (batch.owner_id !== userId)
      return c.json(
        { error: "Only the group owner can replace a temporary member" },
        403,
      );

    const allowed = await filterKnownContactMemberIds(c.env.DB, userId, [
      replacementUserId,
    ]);
    if (!allowed.includes(replacementUserId))
      return c.json(
        { error: "Replacement user must be one of your known contacts" },
        400,
      );

    const replaced = await replaceTemporaryMemberWithUser(
      c.env.DB,
      batchId,
      temporaryMemberId,
      replacementUserId,
    );
    if (!replaced) return c.json({ error: "Temporary member not found" }, 404);
    return c.json({
      message: "Temporary member replaced",
      members: await getBatchMembers(c.env.DB, batchId),
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

app.get("/api/groups/:id/column-visibility", async (c) => {
  try {
    const auth = requireAuth(c);
    const groupId = c.req.param("id");
    const userId = getUserIdFromSub(auth.sub);
    const isMember = await c.env.DB.prepare(
      "SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?",
    )
      .bind(groupId, userId)
      .first();
    const isOwner = await c.env.DB.prepare(
      "SELECT 1 FROM batches WHERE id = ? AND owner_id = ?",
    )
      .bind(groupId, userId)
      .first();
    if (!isMember && !isOwner) return c.json({ error: "Unauthorized" }, 401);
    const row = await c.env.DB.prepare(
      "SELECT visible_columns FROM group_column_visibility WHERE group_id = ? AND user_id = ?",
    )
      .bind(groupId, userId)
      .first<{ visible_columns: string }>();
    const visibleColumns = row
      ? row.visible_columns.split(",")
      : "name,amount,currency,paid_by,date,category,split,description".split(
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

app.put("/api/groups/:id/column-visibility", async (c) => {
  try {
    const auth = requireAuth(c);
    const groupId = c.req.param("id");
    const userId = getUserIdFromSub(auth.sub);
    const body = await c.req.json<{ visibleColumns?: string[] }>();
    const isMember = await c.env.DB.prepare(
      "SELECT 1 FROM batch_members WHERE batch_id = ? AND user_id = ?",
    )
      .bind(groupId, userId)
      .first();
    const isOwner = await c.env.DB.prepare(
      "SELECT 1 FROM batches WHERE id = ? AND owner_id = ?",
    )
      .bind(groupId, userId)
      .first();
    if (!isMember && !isOwner) return c.json({ error: "Unauthorized" }, 401);
    const visibleColumns = Array.isArray(body.visibleColumns)
      ? body.visibleColumns.join(",")
      : "name,amount,currency,paid_by,date,category,split,description";
    await c.env.DB.prepare(
      `INSERT INTO group_column_visibility (id, group_id, user_id, visible_columns)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id, user_id)
       DO UPDATE SET visible_columns = excluded.visible_columns, updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(crypto.randomUUID(), groupId, userId, visibleColumns)
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

app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
