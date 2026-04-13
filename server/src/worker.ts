import { createApiApp } from "./app/createApiApp";
import { createD1Database, type D1Database } from "./platform/sql-adapter";
import { createWorkerTokenVerifier } from "./platform/worker-auth";

type WorkerBindings = {
  DB: D1Database;
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  APP_BASE_URL?: string;
  PUBLIC_FRONTEND_URL?: string;
};

function getFrontendBaseUrl(env: WorkerBindings) {
  const url =
    env.APP_BASE_URL || env.PUBLIC_FRONTEND_URL || "http://localhost:5173";

  // Ensure we use the canonical APP_BASE_URL for invite links.
  // If only PUBLIC_FRONTEND_URL is set (e.g., *.pages.dev), warn about missing APP_BASE_URL.
  if (!env.APP_BASE_URL && env.PUBLIC_FRONTEND_URL) {
    console.warn(
      "[Warning] APP_BASE_URL not set. Invite links will use PUBLIC_FRONTEND_URL. " +
        "Set APP_BASE_URL to your canonical domain for correct invite links.",
    );
  }

  return url;
}

function getAllowedCorsOrigins(env: WorkerBindings): string[] {
  const origins = new Set<string>(["http://localhost:5173"]);

  const configuredOrigins = [env.PUBLIC_FRONTEND_URL, env.APP_BASE_URL];
  for (const origin of configuredOrigins) {
    if (origin) {
      origins.add(origin.replace(/\/$/, ""));
    }
  }

  return Array.from(origins);
}

function createWorkerApp(env: WorkerBindings) {
  return createApiApp({
    db: createD1Database(env.DB),
    verifyToken: createWorkerTokenVerifier({
      domain: env.AUTH0_DOMAIN,
      clientId: env.AUTH0_CLIENT_ID,
    }),
    getAllowedCorsOrigins: () => getAllowedCorsOrigins(env),
    getFrontendBaseUrl: () => getFrontendBaseUrl(env),
    appName: "Open Expense Splitter API",
    healthMessage: "Worker is running",
    runtime: "cloudflare-workers",
  });
}

export default {
  fetch(request: Request, env: WorkerBindings) {
    const app = createWorkerApp(env);
    return app.fetch(request);
  },
};
