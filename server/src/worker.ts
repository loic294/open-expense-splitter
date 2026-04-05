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
  return env.PUBLIC_FRONTEND_URL || env.APP_BASE_URL || "http://localhost:5173";
}

function getAllowedCorsOrigins(env: WorkerBindings): string[] {
  const origins = new Set<string>(["http://localhost:5173"]);
  const publicUrl = env.PUBLIC_FRONTEND_URL || env.APP_BASE_URL;

  if (publicUrl) {
    origins.add(publicUrl.replace(/\/$/, ""));
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
