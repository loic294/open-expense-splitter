import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import db, { initializeDB } from "./db";
import { authMiddleware, requireAuth } from "./auth";

// Initialize database
initializeDB();

const app = new Hono();

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === "Unauthorized";
}

// Request/response logs help quickly pinpoint auth and route failures.
app.use("*", async (c, next) => {
  const start = Date.now();
  const requestId = randomUUID();
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
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Apply auth middleware
app.use("*", authMiddleware);

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "Batch Spending Splitter API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      spendings: "/api/spendings",
      batches: "/api/batches",
    },
  });
});

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok", message: "Backend is running" });
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

// Get user's spendings (only their own)
app.get("/api/spendings", (c) => {
  try {
    const auth = requireAuth(c);

    const userId = `user_${auth.sub.replace(/:/g, "_")}`;

    const spendings = db
      .prepare(
        `
      SELECT id, description, amount, category, date, created_at
      FROM spendings
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 100
    `,
      )
      .all(userId) as any[];

    return c.json({ spendings, total: spendings.length });
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

// Create spending record
app.post("/api/spendings", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = (await c.req.json()) as any;

    const userId = `user_${auth.sub.replace(/:/g, "_")}`;
    const id = `spending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare(`
      INSERT INTO spendings (id, user_id, description, amount, category)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, userId, body.description, body.amount, body.category || null);

    return c.json({ id, message: "Spending recorded" }, 201);
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

// Get user's batches (only their own or where they're members)
app.get("/api/batches", (c) => {
  try {
    const auth = requireAuth(c);

    const userId = `user_${auth.sub.replace(/:/g, "_")}`;

    const batches = db
      .prepare(
        `
      SELECT DISTINCT b.id, b.name, b.description, b.owner_id, b.created_at
      FROM batches b
      LEFT JOIN batch_members bm ON b.id = bm.batch_id
      WHERE b.owner_id = ? OR bm.user_id = ?
      ORDER BY b.created_at DESC
    `,
      )
      .all(userId, userId) as any[];

    return c.json({ batches, total: batches.length });
  } catch (error) {
    console.error("[api:/api/batches GET] failed:", error);
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

// Create batch
app.post("/api/batches", async (c) => {
  try {
    const auth = requireAuth(c);
    const body = (await c.req.json()) as any;

    const userId = `user_${auth.sub.replace(/:/g, "_")}`;
    const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare(`
      INSERT INTO batches (id, owner_id, name, description)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, userId, body.name, body.description || null);

    return c.json({ id, message: "Batch created" }, 201);
  } catch (error) {
    console.error("[api:/api/batches POST] failed:", error);
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
