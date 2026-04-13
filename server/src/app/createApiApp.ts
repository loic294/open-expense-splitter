import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiAppOptions, HonoCtx } from "./types";
import { createId } from "./utils/id";
import { createAuthRouter } from "./routes/auth";
import { createContactsRouter } from "./routes/contacts";
import { createPlatformInvitesRouter } from "./routes/platformInvites";
import { createSpendingsRouter } from "./routes/spendings";
import { createGroupsRouter } from "./routes/groups";
import { createGroupInvitesRouter } from "./routes/groupInvites";
import { createExchangeRatesRouter } from "./routes/exchangeRates";
import { createCategoryTagEmojisRouter } from "./routes/categoryTagEmojis";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApiApp(options: ApiAppOptions) {
  const {
    db,
    verifyToken,
    getAllowedCorsOrigins,
    getFrontendBaseUrl,
    appName,
    healthMessage,
    runtime,
  } = options;
  const frontendBaseUrl = getFrontendBaseUrl().replace(/\/$/, "");
  const deps = { db, frontendBaseUrl };
  const app = new Hono<HonoCtx>();

  app.use(
    "*",
    cors({
      origin: getAllowedCorsOrigins(),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      credentials: true,
    }),
  );

  app.use("*", async (c, next) => {
    const start = Date.now();
    const reqId = c.req.header("x-request-id") || createId();
    c.header("X-Request-ID", reqId);
    console.debug(`[api:${reqId}] -> ${c.req.method} ${c.req.path}`);
    await next();
    console.debug(
      `[api:${reqId}] <- ${c.req.method} ${c.req.path} ${c.res.status} (${Date.now() - start}ms)`,
    );
  });

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
    const auth = await verifyToken(token);
    if (!auth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("auth", auth);
    return next();
  });

  app.get("/", (c) =>
    c.json({
      name: appName,
      version: "1.0.0",
      runtime,
      endpoints: {
        health: "/api/health",
        spendings: "/api/spendings",
        groups: "/api/groups",
      },
    }),
  );

  app.get("/api/health", (c) =>
    c.json({ status: "ok", message: healthMessage }),
  );

  app.route("/", createAuthRouter(deps));
  app.route("/", createContactsRouter(deps));
  app.route("/", createPlatformInvitesRouter(deps));
  app.route("/", createSpendingsRouter(deps));
  app.route("/", createGroupsRouter(deps));
  app.route("/", createGroupInvitesRouter(deps));
  app.route("/", createExchangeRatesRouter(deps));
  app.route("/", createCategoryTagEmojisRouter(deps));

  app.notFound((c) => c.json({ error: "Not Found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
