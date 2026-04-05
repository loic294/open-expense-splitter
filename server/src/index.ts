import { serve } from "@hono/node-server";
import db, { initializeDB } from "./db";
import { verifyNodeToken } from "./auth";
import { createApiApp } from "./app/createApiApp";
import { createSqliteD1Database } from "./platform/sql-adapter";

initializeDB();

function getFrontendBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  );
}

function getAllowedCorsOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:5173",
    "http://localhost:3000",
  ]);

  const configuredOrigins = [
    process.env.PUBLIC_FRONTEND_URL,
    process.env.APP_BASE_URL,
    process.env.FRONTEND_URL,
  ];

  for (const origin of configuredOrigins) {
    if (origin) {
      origins.add(origin.replace(/\/$/, ""));
    }
  }

  return Array.from(origins);
}

const app = createApiApp({
  db: createSqliteD1Database(db),
  verifyToken: verifyNodeToken,
  getAllowedCorsOrigins,
  getFrontendBaseUrl,
  appName: "Open Expense Splitter API",
  healthMessage: "Backend is running",
  runtime: "node",
});

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
