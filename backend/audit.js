// NLC-SecureMaint Tamper-Evident Audit Logging Module
// Implements a cryptographic hash chain (SHA-256) where each row references the previous row's hash
// and persists a separate anchor file (backend/anchor.json) to detect truncation attacks and tail rewrites

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const anchorFilePath = path.join(__dirname, "anchor.json");

/**
 * Saves the latest audit row ID and SHA-256 hash to the separate anchor file (backend/anchor.json).
 * This separate anchor file ensures that if an attacker truncates (deletes tail rows)
 * or rewrites the end of the SQLite table, the verification engine detects the discrepancy immediately.
 */
const saveAnchor = (rowId, hash, timestamp) => {
  try {
    const anchorData = {
      row_id: rowId,
      hash: hash,
      timestamp: timestamp || new Date().toISOString()
    };
    fs.writeFileSync(anchorFilePath, JSON.stringify(anchorData, null, 2), "utf8");
  } catch (err) {
    console.error("[Audit] Error writing anchor.json:", err);
  }
};

/**
 * Reads and returns the current anchor state from backend/anchor.json.
 */
const getAnchor = () => {
  try {
    if (fs.existsSync(anchorFilePath)) {
      const content = fs.readFileSync(anchorFilePath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("[Audit] Error reading anchor.json:", err);
  }
  return null;
};

// Ensure anchor.json is synchronized with latest database row if it does not already exist
if (!fs.existsSync(anchorFilePath)) {
  try {
    const latest = db.prepare("SELECT id, hash, timestamp FROM audit_log ORDER BY id DESC LIMIT 1").get();
    if (latest) {
      saveAnchor(latest.id, latest.hash, latest.timestamp);
    }
  } catch (err) {
    // Database might be during initial table setup; ignore if table not yet populated
  }
}

/**
 * Computes SHA-256 hash for an audit log entry:
 * SHA256(prev_hash + timestamp + userId + action + entity + JSON details)
 */
const computeHash = (prevHash, timestamp, userId, action, entity, details) => {
  const prevHashStr = prevHash || "GENESIS";
  const timestampStr = timestamp || "";
  const userIdStr = userId !== null && userId !== undefined ? String(userId) : "";
  const actionStr = action || "";
  const entityStr = entity || "";
  const detailsStr = typeof details === "string" ? details : JSON.stringify(details);

  const payload = `${prevHashStr}${timestampStr}${userIdStr}${actionStr}${entityStr}${detailsStr}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
};

/**
 * logAudit(userId, action, entity, details)
 * Inserts a new audit record linked to the previous record's hash,
 * and updates the separate anchor file (backend/anchor.json).
 */
const logAudit = (userId, action, entity, details = {}) => {
  try {
    // 1. Get the hash of the latest audit row. If table is empty, use 'GENESIS'.
    const lastRow = db.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get();
    const prevHash = lastRow ? lastRow.hash : "GENESIS";

    // 2. Prepare entry fields
    const timestamp = new Date().toISOString();
    const detailsStr = typeof details === "string" ? details : JSON.stringify(details);

    // 3. Compute current row's SHA-256 hash
    const hash = computeHash(prevHash, timestamp, userId, action, entity, detailsStr);

    // 4. Insert into database using parameterized query
    const insertResult = db.prepare(`
      INSERT INTO audit_log (timestamp, user_id, action, entity, details, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      timestamp,
      userId !== undefined && userId !== null ? Number(userId) : null,
      action,
      entity,
      detailsStr,
      prevHash,
      hash
    );

    const rowId = insertResult.lastInsertRowid;

    // 5. Update separate anchor file with latest row id and hash
    saveAnchor(rowId, hash, timestamp);

    return { rowId, prevHash, hash, timestamp };
  } catch (error) {
    console.error("[Audit] Error recording audit log:", error);
    return null;
  }
};

/**
 * verifyAuditChain()
 * Traverses all rows in audit_log sequentially from id ASC.
 * Verifies:
 * 1. Internal SHA-256 hash continuity (prev_hash links and row payload hashes)
 * 2. Separate anchor file validation against backend/anchor.json (detects truncation / tail rewrites)
 */
const verifyAuditChain = () => {
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
  const anchor = getAnchor();

  if (rows.length === 0) {
    if (anchor && anchor.row_id > 0) {
      return {
        valid: false,
        reason: "TRUNCATION_DETECTED",
        message: `Audit log truncation detected! The database audit log has 0 rows, but separate anchor file references row ID #${anchor.row_id} (${anchor.row_id} row(s) deleted).`,
        anchor
      };
    }
    return {
      valid: true,
      count: 0,
      anchor: null,
      message: "Audit log is empty. No tampering possible."
    };
  }

  // 1. Verify internal sequential continuity and hash chain
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check row ID continuity from the first stored row to the last
    if (i > 0 && row.id !== rows[i - 1].id + 1) {
      return {
        valid: false,
        totalChecked: i + 1,
        position: i + 1,
        expectedId: rows[i - 1].id + 1,
        foundId: row.id,
        brokenRowId: row.id,
        previousRowId: rows[i - 1].id,
        reason: "ID_GAP_DETECTED",
        message: `Audit log ID sequence gap detected at position ${i + 1}! Expected continuous row ID #${rows[i - 1].id + 1}, but found #${row.id} (${row.id - rows[i - 1].id - 1} missing row(s) or sequence jump).`,
        anchor,
        row
      };
    }

    const expectedPrevHash = i === 0 ? "GENESIS" : rows[i - 1].hash;

    // Check prev_hash pointer consistency
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalChecked: i + 1,
        brokenRowId: row.id,
        reason: "BROKEN_LINK",
        message: `Broken chain link at row ID ${row.id}. Expected prev_hash '${expectedPrevHash}', but found '${row.prev_hash}'.`,
        anchor,
        row
      };
    }

    // Recompute hash from row data and compare with stored hash
    const recomputedHash = computeHash(
      row.prev_hash,
      row.timestamp,
      row.user_id,
      row.action,
      row.entity,
      row.details
    );

    if (row.hash !== recomputedHash) {
      return {
        valid: false,
        totalChecked: i + 1,
        brokenRowId: row.id,
        reason: "HASH_MISMATCH",
        message: `Tampering detected at row ID ${row.id}! Row data does not match stored hash. Expected '${recomputedHash}', found '${row.hash}'.`,
        anchor,
        row
      };
    }
  }

  // 2. Verify against separate anchor file (backend/anchor.json)
  const lastRow = rows[rows.length - 1];

  if (anchor) {
    // Check for truncation (deleted rows from the tail)
    if (lastRow.id < anchor.row_id) {
      const deletedRows = anchor.row_id - lastRow.id;
      return {
        valid: false,
        reason: "TRUNCATION_DETECTED",
        lastRowId: lastRow.id,
        anchorRowId: anchor.row_id,
        deletedRows,
        message: `Audit log truncation detected! The database log ends at row ID #${lastRow.id}, but the separate anchor file references row ID #${anchor.row_id} (${deletedRows} row(s) deleted from tail).`,
        anchor
      };
    }

    // Check for rewritten tail row hash
    if (lastRow.id === anchor.row_id && lastRow.hash !== anchor.hash) {
      return {
        valid: false,
        reason: "TAIL_REWRITE_DETECTED",
        lastRowId: lastRow.id,
        lastRowHash: lastRow.hash,
        anchorRowId: anchor.row_id,
        anchorHash: anchor.hash,
        message: `Audit log tail rewrite detected! Last row ID #${lastRow.id} hash does not match separate anchor file hash.`,
        anchor
      };
    }
  }

  return {
    valid: true,
    count: rows.length,
    lastRowId: lastRow.id,
    lastHash: lastRow.hash,
    anchor: anchor || {
      row_id: lastRow.id,
      hash: lastRow.hash,
      timestamp: lastRow.timestamp
    },
    message: `Audit log chain and separate anchor file integrity verified. All ${rows.length} entries are valid and match separate anchor file (Row #${anchor ? anchor.row_id : lastRow.id}).`
  };
};

module.exports = {
  logAudit,
  verifyAuditChain,
  computeHash,
  getAnchor,
  saveAnchor
};

