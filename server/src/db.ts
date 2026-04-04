import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir =
  process.env.NODE_ENV === "production"
    ? "/app/data"
    : path.join(__dirname, "..", "data");

// Ensure data directory exists
import fs from "fs";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Initialize schema
export function initializeDB() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      auth0_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Spending records - users can only view their own
  db.exec(`
    CREATE TABLE IF NOT EXISTS spendings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      description TEXT NOT NULL,
      name TEXT,
      details TEXT,
      amount DECIMAL(10, 2) NOT NULL,
      category TEXT,
      batch_id TEXT,
      paid_by_id TEXT,
      split_type TEXT DEFAULT 'equal',
      split_data TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN name TEXT");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN details TEXT");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN batch_id TEXT");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN paid_by_id TEXT");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN split_type TEXT DEFAULT 'equal'");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN split_data TEXT");
  } catch {
    // Column already exists on subsequent runs.
  }

  try {
    db.exec("ALTER TABLE spendings ADD COLUMN currency TEXT DEFAULT 'USD'");
  } catch {
    // Column already exists on subsequent runs.
  }

  // Batches - groups of spending for splitting
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '💸',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  try {
    db.exec("ALTER TABLE batches ADD COLUMN emoji TEXT DEFAULT '💸'");
  } catch {
    // Column already exists on subsequent runs.
  }

  // Batch members - who participates in each batch
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_members (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, user_id),
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Batch items - individual spending records in a batch
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      spending_id TEXT,
      paid_by_id TEXT NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (spending_id) REFERENCES spendings(id) ON DELETE SET NULL,
      FOREIGN KEY (paid_by_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Per-user display currency preference scoped to a batch/group
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_user_currency_preferences (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, user_id),
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Cached historical FX rates so we do not call external APIs repeatedly
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      rate_date TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      target_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rate_date, base_currency, target_currency)
    )
  `);
}

export default db;
