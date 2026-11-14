// NLC-SecureMaint Database Module
// Handles SQLite connection and schema creation using better-sqlite3

const path = require("path");
const Database = require("better-sqlite3");

// Connect to SQLite database file (created automatically if it doesn't exist)
const dbPath = path.join(__dirname, "nlc.db");
const db = new Database(dbPath);

// Enable foreign key enforcement and WAL mode for better concurrency and reliability
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Initialize database schema / tables
const initSchema = () => {
  // 1. Users table (stores user identity, role, and security/lockout fields)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      section TEXT,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Ensure totp_secret and totp_enabled columns exist on existing databases
  try {
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = userColumns.map((c) => c.name);
    if (!columnNames.includes("totp_secret")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT;");
    }
    if (!columnNames.includes("totp_enabled")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;");
    }
  } catch (err) {
    console.error("[DB] Migration error for totp columns:", err);
  }

  // 2. Equipment table (stores plant assets like excavators, conveyors, boilers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      section TEXT NOT NULL,
      running_hours REAL DEFAULT 0,
      service_life_hours REAL DEFAULT 0,
      last_service_date TEXT
    );
  `);

  // 3. Work Orders table (tracks corrective and preventive maintenance tasks)
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      equipment_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      technician_id INTEGER,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      sla_due_at TEXT,
      escalated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE RESTRICT,
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // 4. Audit Log table (stores tamper-evident security and lifecycle audit entries)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      details TEXT,
      prev_hash TEXT,
      hash TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // 5. Preventive Maintenance Schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pm_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      task TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      last_done TEXT,
      next_due TEXT NOT NULL,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    );
  `);

  // 6. Compliance and Audit Action Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      evidence_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
    );
  `);
};

// Run schema initialization
initSchema();

module.exports = db;

