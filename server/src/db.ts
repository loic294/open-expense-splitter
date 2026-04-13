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
      tags TEXT,
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
    db.exec("ALTER TABLE spendings ADD COLUMN tags TEXT");
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

  // Temporary members can be used before a real account exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_temporary_members (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      created_by_user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // A user's known contacts. Rows are stored in both directions.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contact_user_id TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, contact_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Invite links to connect users on the platform.
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_invites (
      id TEXT PRIMARY KEY,
      inviter_user_id TEXT NOT NULL,
      email TEXT,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      accepted_by_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Group invitation links for emails that are not yet known contacts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_member_invites (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      accepted_by_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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

  // Stores the user's preferred CSV-to-database field mapping for imports.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_csv_mappings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      mapping_json TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Stores per-user visible columns for each group
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_column_visibility (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      visible_columns TEXT NOT NULL DEFAULT 'name,amount,currency,paid_by,date,category,tags,split,description',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Stores emoji assignments for categories and tags per batch
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_tag_emojis (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, type, name),
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    )
  `);
}

export default db;
