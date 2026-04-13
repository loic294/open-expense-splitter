import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import {
  requireAuth,
  isUnauthorizedError,
  getUserIdFromSub,
} from "../utils/auth";

export function createAuthRouter({ db }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.get("/api/users", async (c) => {
    try {
      requireAuth(c);
      const { results } = await db
        .prepare(
          "SELECT id, auth0_id, email, name, picture, created_at FROM users ORDER BY COALESCE(name, email) ASC",
        )
        .all();
      return c.json({ users: results, total: results.length });
    } catch (err) {
      console.error("[GET /api/users] Error:", err);
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

  router.get("/api/me", async (c) => {
    try {
      const auth = requireAuth(c);
      const user = await db
        .prepare(
          "SELECT id, auth0_id, email, name, picture, created_at FROM users WHERE auth0_id = ?",
        )
        .bind(auth.sub)
        .first();
      if (!user) return c.json({ error: "User not found" }, 404);
      return c.json(user);
    } catch (err) {
      console.error("[GET /api/me] Error:", err);
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

  router.post("/api/auth/login", async (c) => {
    try {
      const auth = requireAuth(c);
      const userId = getUserIdFromSub(auth.sub);
      await db
        .prepare(
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
      console.error("[POST /api/auth/login] Error:", err);
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

  router.patch("/api/me", async (c) => {
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

      const result = await db
        .prepare(
          `UPDATE users
       SET name = ?, email = ?, picture = ?, updated_at = CURRENT_TIMESTAMP
       WHERE auth0_id = ?`,
        )
        .bind(name || null, email, picture || null, auth.sub)
        .run();
      if (!result.meta.changes) return c.json({ error: "User not found" }, 404);

      const updated = await db
        .prepare(
          "SELECT id, auth0_id, email, name, picture, created_at, updated_at FROM users WHERE auth0_id = ?",
        )
        .bind(auth.sub)
        .first();
      return c.json(updated);
    } catch (err) {
      console.error("[PATCH /api/me] Error:", err);
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

  return router;
}
