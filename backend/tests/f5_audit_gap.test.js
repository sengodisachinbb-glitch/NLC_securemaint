// F5 Verification Test Suite: Audit Log Row ID Continuity & ID_GAP_DETECTED
// Tests verifyAuditChain() and GET /api/audit/verify when rows are missing in the middle or sequence jumps.

const path = require("path");
const fs = require("fs");
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const db = require("../db");
const { verifyAuditChain, saveAnchor } = require("../audit");
const jwt = require("jsonwebtoken");

const BASE_URL = process.env.API_URL || "http://localhost:5000";

describe("F5: Audit Row ID Continuity & Gap Detection", () => {
  let adminToken = null;

  before(() => {
    const adminUser = db.prepare("SELECT id, name, email, role, section FROM users WHERE role = 'Admin'").get();
    assert.ok(adminUser, "Admin user must exist in database");
    adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: "24h" });

    // Sync anchor with current DB state
    const lastRow = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1").get();
    if (lastRow) {
      saveAnchor(lastRow.id, lastRow.hash, lastRow.timestamp);
    }
  });

  test("1. Pristine audit log passes verification with valid: true", () => {
    const result = verifyAuditChain();
    assert.equal(result.valid, true, "Pristine audit log should be valid");
    assert.ok(result.count > 0, "Audit log should have entries");
    assert.equal(result.reason, undefined, "Pristine audit log should have no failure reason");
  });

  test("2. Deleting an intermediate audit row reports ID_GAP_DETECTED with position and expected/found IDs", () => {
    const rows = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
    assert.ok(rows.length >= 3, "Database must have at least 3 audit rows to test intermediate gap");

    // Target index 1 (the 2nd row)
    const targetIndex = 1;
    const targetRow = rows[targetIndex];
    const prevRow = rows[targetIndex - 1];
    const nextRow = rows[targetIndex + 1];

    try {
      // Delete the intermediate row directly in SQLite
      db.prepare("DELETE FROM audit_log WHERE id = ?").run(targetRow.id);

      // Verify directly via verifyAuditChain()
      const result = verifyAuditChain();
      assert.equal(result.valid, false, "Verification must fail when an intermediate row is deleted");
      assert.equal(result.reason, "ID_GAP_DETECTED", `Reason must be ID_GAP_DETECTED (got ${result.reason})`);
      assert.equal(result.position, targetIndex + 1, `Reported position must be ${targetIndex + 1} (got ${result.position})`);
      assert.equal(result.expectedId, prevRow.id + 1, `Expected ID must be #${prevRow.id + 1} (got ${result.expectedId})`);
      assert.equal(result.foundId, nextRow.id, `Found ID must be #${nextRow.id} (got ${result.foundId})`);
      assert.equal(result.brokenRowId, nextRow.id, `brokenRowId must point to the row where gap was detected`);
      assert.match(result.message, /gap detected at position/i, "Message must mention gap detected at position");
    } finally {
      // Restore the deleted row
      db.prepare(`
        INSERT INTO audit_log (id, timestamp, user_id, action, entity, details, prev_hash, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetRow.id,
        targetRow.timestamp,
        targetRow.user_id,
        targetRow.action,
        targetRow.entity,
        targetRow.details,
        targetRow.prev_hash,
        targetRow.hash
      );
    }

    // After restoration, verify must succeed cleanly
    const restoredResult = verifyAuditChain();
    assert.equal(restoredResult.valid, true, "Verification must succeed after restoring deleted row");
  });

  test("3. Sequence jump at tail reports ID_GAP_DETECTED via GET /api/audit/verify endpoint", async () => {
    const rows = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
    const lastRow = rows[rows.length - 1];
    const prevRow = rows[rows.length - 2];
    const originalId = lastRow.id;
    const jumpedId = originalId + 50;

    try {
      // Temporarily update the last row's ID so it jumps forward
      db.prepare("UPDATE audit_log SET id = ? WHERE id = ?").run(jumpedId, originalId);
      // Synchronize anchor with the jumped ID to ensure TRUNCATION_DETECTED is not triggered first
      saveAnchor(jumpedId, lastRow.hash, lastRow.timestamp);

      const res = await fetch(`${BASE_URL}/api/audit/verify`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200, "Verification endpoint returns HTTP 200 with verification result");
      const data = await res.json();

      assert.equal(data.valid, false, "Verification endpoint must report valid: false on sequence jump");
      assert.equal(data.reason, "ID_GAP_DETECTED", `Reason must be ID_GAP_DETECTED (got ${data.reason})`);
      assert.equal(data.position, rows.length, `Position must be ${rows.length}`);
      assert.equal(data.expectedId, prevRow.id + 1, `Expected ID must be ${prevRow.id + 1}`);
      assert.equal(data.foundId, jumpedId, `Found ID must be #${jumpedId}`);
      assert.equal(data.brokenRowId, jumpedId, `brokenRowId must be #${jumpedId}`);
    } finally {
      // Restore the original ID and anchor
      db.prepare("UPDATE audit_log SET id = ? WHERE id = ?").run(originalId, jumpedId);
      saveAnchor(originalId, lastRow.hash, lastRow.timestamp);
    }

    // Verify clean again
    const finalCleanRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const finalCleanData = await finalCleanRes.json();
    assert.equal(finalCleanData.valid, true, "Verification endpoint must report valid: true after restoring ID");
  });
});
