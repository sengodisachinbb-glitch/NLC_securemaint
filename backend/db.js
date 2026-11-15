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
      pm_schedule_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE RESTRICT,
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (pm_schedule_id) REFERENCES pm_schedules(id) ON DELETE SET NULL
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    );
  `);

  // 5. Preventive Maintenance Schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pm_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      task TEXT NOT NULL,
      trigger_type TEXT DEFAULT 'days' CHECK (trigger_type IN ('days', 'hours')),
      interval_days INTEGER,
      interval_hours INTEGER,
      last_done TEXT,
      last_done_hours REAL DEFAULT 0,
      next_due TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

/**
 * Safe database migration: ensures pm_schedules has trigger_type, interval_hours,
 * last_done_hours, created_at, with nullable interval_days/next_due, and ensures
 * work_orders has pm_schedule_id.
 */
const migrateSchema = () => {
  // 1. Check pm_schedules columns
  const pmCols = db.prepare("PRAGMA table_info(pm_schedules)").all();
  const intervalDaysCol = pmCols.find((c) => c.name === "interval_days");
  const nextDueCol = pmCols.find((c) => c.name === "next_due");
  const hasTriggerType = pmCols.some((c) => c.name === "trigger_type");

  if (intervalDaysCol?.notnull === 1 || nextDueCol?.notnull === 1 || !hasTriggerType) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE IF NOT EXISTS pm_schedules_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id INTEGER NOT NULL,
        task TEXT NOT NULL,
        trigger_type TEXT DEFAULT 'days' CHECK (trigger_type IN ('days', 'hours')),
        interval_days INTEGER,
        interval_hours INTEGER,
        last_done TEXT,
        last_done_hours REAL DEFAULT 0,
        next_due TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
      );
      INSERT INTO pm_schedules_migrated (id, equipment_id, task, trigger_type, interval_days, interval_hours, last_done, last_done_hours, next_due)
      SELECT id, equipment_id, task, 'days', interval_days, NULL, last_done, 0, next_due FROM pm_schedules;
      DROP TABLE pm_schedules;
      ALTER TABLE pm_schedules_migrated RENAME TO pm_schedules;
    `);
    db.pragma("foreign_keys = ON");
  }

  // 2. Check work_orders columns
  const woCols = db.prepare("PRAGMA table_info(work_orders)").all().map((c) => c.name);
  if (!woCols.includes("pm_schedule_id")) {
    db.prepare("ALTER TABLE work_orders ADD COLUMN pm_schedule_id INTEGER REFERENCES pm_schedules(id) ON DELETE SET NULL").run();
  }

  // 3. Check audit_log foreign key constraint (must be ON DELETE RESTRICT to protect tamper-evident log)
  try {
    const fks = db.prepare("PRAGMA foreign_key_list(audit_log)").all();
    const userFk = fks.find((fk) => fk.from === "user_id" && fk.table === "users");
    if (userFk && userFk.on_delete === "SET NULL") {
      const { verifyAuditChain } = require("./audit");
      const countBefore = db.prepare("SELECT COUNT(*) as c FROM audit_log").get().c;
      const verifyBefore = verifyAuditChain();

      db.pragma("foreign_keys = OFF");
      const migrationTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS audit_log_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            details TEXT,
            prev_hash TEXT,
            hash TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
          );
          INSERT INTO audit_log_new (id, timestamp, user_id, action, entity, details, prev_hash, hash)
          SELECT id, timestamp, user_id, action, entity, details, prev_hash, hash FROM audit_log;
          DROP TABLE audit_log;
          ALTER TABLE audit_log_new RENAME TO audit_log;
        `);
      });
      migrationTx();
      db.pragma("foreign_keys = ON");

      const countAfter = db.prepare("SELECT COUNT(*) as c FROM audit_log").get().c;
      const verifyAfter = verifyAuditChain();

      if (countBefore !== countAfter || verifyBefore.valid !== verifyAfter.valid) {
        throw new Error(
          `Audit log migration verification failed! Count before: ${countBefore}, after: ${countAfter}. Verify before: ${verifyBefore.valid}, after: ${verifyAfter.valid}`
        );
      }
    }
  } catch (err) {
    db.pragma("foreign_keys = ON");
    console.error("[DB] Migration error for audit_log:", err);
    throw err;
  }
};

module.exports = db;

// Run schema initialization and migration
initSchema();
migrateSchema();

