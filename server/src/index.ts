import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Enable CORS for frontend
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok", message: "Backend is running" });
});

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "Batch Spending Splitter API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Start server
const port = process.env.PORT || 3000;
console.log(`Server running on port ${port}`);

export default app;
