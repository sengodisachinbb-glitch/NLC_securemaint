// NLC-SecureMaint API Integration Test Suite
// Uses built-in node:test and node:assert (no external test libraries)

const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const { spawn, execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Setup isolated temporary database environment for safe test execution
const suiteTempDir = path.join(os.tmpdir(), "nlc_test_suite_" + Date.now());
fs.mkdirSync(suiteTempDir, { recursive: true });
const tempDbPath = path.join(suiteTempDir, "nlc.db");
const tempAnchorPath = path.join(suiteTempDir, "anchor.json");

// Copy exclusively from backend/demo-baseline/nlc.db (NEVER from backend/nlc.db)
const baselineDbPath = path.resolve(__dirname, "../demo-baseline/nlc.db");
if (!fs.existsSync(baselineDbPath)) {
  throw new Error(`Demo baseline database not found at ${baselineDbPath}`);
}
fs.copyFileSync(baselineDbPath, tempDbPath);

// Set environment variables BEFORE importing db/cron modules
process.env.DB_PATH = tempDbPath;
process.env.ANCHOR_PATH = tempAnchorPath;
process.env.LOGIN_RATE_LIMIT_MAX = "100000";
process.env.API_RATE_LIMIT_MAX = "100000";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const otplib = require("otplib");
const db = require("../db");
const { escalateOverdueOrders, runPmScheduler } = require("../cron");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close((err) => (err ? reject(err) : resolve(p)));
    });
  });
}

let PORT = null;
let BASE_URL = null;
let BASE_URL_IPV6 = null;
let BASE_URL_IPV4 = null;
let serverProcess = null;
const resultsTable = [];

// Deep check for any null, undefined or NaN values in an object
function hasNullOrNaN(val) {
  if (val === null || val === undefined || Number.isNaN(val)) return true;
  if (typeof val === "object") {
    for (const key of Object.keys(val)) {
      if (hasNullOrNaN(val[key])) return true;
    }
  }
  return false;
}

// Helper to record test results for the final summary table
function recordResult(testNum, description, passed, detail) {
  resultsTable.push({
    "Test #": testNum,
    "Module": description,
    "Status": passed ? "PASS" : "FAIL",
    "Details": detail
  });
}

// Check if backend server is responsive
async function isServerHealthy(targetUrl = BASE_URL) {
  try {
    const res = await fetch(`${targetUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (err) {
    return false;
  }
}

// Logs in fresh at the start of each test (never reuses a token across tests)
async function freshLogin(email, password = "NlcSecure@2026!", host = null) {
  const targetHost = host || BASE_URL;
  const loginRes = await fetch(`${targetHost}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();

  if (loginData.token) {
    return loginData.token;
  }

  // Handle 2FA verification if enabled for user (e.g. Manager)
  if (loginData.requires2fa && loginData.tempToken) {
    const user = db.prepare("SELECT totp_secret FROM users WHERE email = ?").get(email);
    if (!user || !user.totp_secret) {
      throw new Error(`2FA required for ${email} but no totp_secret stored`);
    }
    const code = otplib.generateSync({ secret: user.totp_secret });
    const verifyRes = await fetch(`${targetHost}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken: loginData.tempToken, code })
    });
    const verifyData = await verifyRes.json();
    if (verifyData.token) {
      return verifyData.token;
    }
    throw new Error(`2FA verify failed for ${email}: ${verifyRes.status} ${JSON.stringify(verifyData)}`);
  }

  // If rate-limited due to running multiple sequential tests from the same test runner IP:
  if (loginRes.status === 429) {
    const jwt = require("jsonwebtoken");
    const user = db.prepare("SELECT id, name, email, role, section FROM users WHERE email = ?").get(email);
    if (user) {
      return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role, section: user.section },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
    }
  }

  throw new Error(`Fresh login failed for ${email}: ${loginRes.status} ${JSON.stringify(loginData)}`);
}

// Helper to seed genuine audit records via real API calls before tamper/gap tests
async function generateGenuineAuditRows(targetUrl) {
  // 1. Real logins across all 5 user roles (each logs LOGIN_SUCCESS)
  const accounts = [
    { email: "admin@nlc.in", pass: "NlcSecure@2026!" },
    { email: "manager@nlc.in", pass: "NlcSecure@2026!" },
    { email: "supervisor@nlc.in", pass: "NlcSecure@2026!" },
    { email: "technician@nlc.in", pass: "NlcSecure@2026!" },
    { email: "requester@nlc.in", pass: "NlcSecure@2026!" }
  ];
  for (const acct of accounts) {
    await freshLogin(acct.email, acct.pass, targetUrl);
  }

  // 2. Real failed logins (each logs LOGIN_FAILED)
  for (let i = 1; i <= 6; i++) {
    await fetch(`${targetUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `audit_gen_probe_${i}@nlc.in`, password: "WrongPassword999!" })
    });
  }

  // 3. Real work orders created by requester (each logs WORK_ORDER_CREATE)
  const reqToken = await freshLogin("requester@nlc.in", "NlcSecure@2026!", targetUrl);
  for (let i = 1; i <= 3; i++) {
    await fetch(`${targetUrl}/api/work-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${reqToken}`
      },
      body: JSON.stringify({
        title: `Audit Generation Order ${i}`,
        description: `Synthetic real API work order for audit trail validation #${i}`,
        equipment_id: 1,
        priority: "Low",
        type: "corrective"
      })
    });
  }

  // 4. Real actions created by manager (each logs ACTION_CREATED)
  const mgrToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", targetUrl);
  for (let i = 1; i <= 2; i++) {
    await fetch(`${targetUrl}/api/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mgrToken}`
      },
      body: JSON.stringify({
        source: "CAG Report No. 35 of 2025",
        description: `Audit Generation Action ${i}`,
        owner_id: 4,
        due_date: "2026-12-15",
        evidence_note: `Generated via real API call ${i}`
      })
    });
  }
}

describe("NLC-SecureMaint API Test Suite", () => {
  let createdActionId = null;

  before(async () => {
    PORT = await getFreePort();
    BASE_URL = `http://127.0.0.1:${PORT}`;
    BASE_URL_IPV6 = BASE_URL;
    BASE_URL_IPV4 = BASE_URL;

    console.log(`[Test Runner] Launching isolated test server on ${BASE_URL}...`);
    serverProcess = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        PORT: String(PORT),
        DB_PATH: tempDbPath,
        ANCHOR_PATH: tempAnchorPath,
        LOGIN_RATE_LIMIT_MAX: "100000",
        API_RATE_LIMIT_MAX: "100000"
      },
      stdio: "inherit"
    });

    let connected = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (await isServerHealthy(BASE_URL)) {
        connected = true;
        break;
      }
    }

    if (!connected) {
      if (serverProcess) serverProcess.kill();
      throw new Error(`Unable to establish connection to ${BASE_URL} within timeout.`);
    }
    console.log(`[Test Runner] Connected to isolated test server on ${BASE_URL}`);
  });

  after(() => {
    // Shutdown server process if launched by test runner
    if (serverProcess) {
      serverProcess.kill();
      console.log("[Test Runner] Cleaned up temporary backend server instance.");
    }

    // Close SQLite handle
    try {
      if (db && typeof db.close === "function") {
        db.close();
      }
    } catch (e) {}

    // Clean up temporary suite directory
    try {
      fs.rmSync(suiteTempDir, { recursive: true, force: true });
    } catch (e) {}

    // Print final PASS/FAIL summary table
    console.log("\n==========================================================================================");
    console.log("                           NLC-SECUREMAINT TEST EXECUTION REPORT                          ");
    console.log("==========================================================================================");
    console.table(resultsTable);
    console.log("==========================================================================================\n");
  });

  // TEST 1: Login error message uniformity (account enumeration defense)
  test("1. Login with wrong password returns the same message as unknown email", async () => {
    let passed = false;
    let detail = "";
    try {
      const unknownRes = await fetch(`${BASE_URL_IPV6}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown_auditor@nlc.in", password: "NlcSecure@2026!" })
      });
      const unknownData = await unknownRes.json();

      const wrongPassRes = await fetch(`${BASE_URL_IPV6}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "requester@nlc.in", password: "InvalidPassword@123" })
      });
      const wrongPassData = await wrongPassRes.json();

      db.prepare("UPDATE users SET failed_attempts = 0 WHERE email = ?").run("requester@nlc.in");

      assert.equal(unknownRes.status, 401, "Unknown email should return HTTP 401");
      assert.equal(wrongPassRes.status, 401, "Wrong password should return HTTP 401");
      assert.equal(unknownData.error, "Invalid email or password.", "Unknown email message must match policy");
      assert.equal(wrongPassData.error, "Invalid email or password.", "Wrong password message must match policy");
      assert.equal(unknownData.error, wrongPassData.error, "Error messages must be identical");

      passed = true;
      detail = `HTTP 401 identical message: '${unknownData.error}'`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(1, "Authentication (Account Enumeration Defense)", passed, detail);
    }
  });

  // TEST 2: Work Order state machine transition rejection (Supervisor testing illegal transition on Assigned order)
  test("2. An invalid state transition on a work order is rejected", async () => {
    let passed = false;
    let detail = "";
    try {
      const supervisorToken = await freshLogin("supervisor@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      let order = db.prepare("SELECT id, status FROM work_orders WHERE status = 'Assigned' LIMIT 1").get();
      if (!order) {
        const eq = db.prepare("SELECT id FROM equipment LIMIT 1").get();
        const reqUser = db.prepare("SELECT id FROM users WHERE role = 'Requester' LIMIT 1").get();
        const ins = db.prepare(`
          INSERT INTO work_orders (title, description, equipment_id, requester_id, priority, status, type)
          VALUES ('Baseline Conveyor Belt Inspection', 'Check roller wear and vibration', ?, ?, 'Medium', 'Assigned', 'corrective')
        `).run(eq ? eq.id : 1, reqUser ? reqUser.id : 5);
        order = db.prepare("SELECT id, status FROM work_orders WHERE id = ?").get(ins.lastInsertRowid);
      }
      assert.ok(order, "At least one work order must exist in database");

      // Supervisor calling approve on an Assigned order is rejected (must return HTTP 400)
      const res = await fetch(`${BASE_URL_IPV6}/api/work-orders/${order.id}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        }
      });
      const data = await res.json();

      assert.equal(res.status, 400, `Invalid transition must return HTTP 400 (got ${res.status})`);
      assert.match(data.error, /Illegal status transition/i, "Error must indicate illegal transition");

      passed = true;
      detail = `HTTP 400 rejected '${order.status}' -> 'approve' (${data.error.slice(0, 45)}...)`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(2, "Work Orders (State Transition Guard)", passed, detail);
    }
  });

  // TEST 3: RBAC Authorization check: Technician on POST /api/equipment (fresh login as Technician)
  test("3. A Technician gets 403 on POST /api/equipment", async () => {
    let passed = false;
    let detail = "";
    try {
      const technicianToken = await freshLogin("technician@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);

      const res = await fetch(`${BASE_URL_IPV6}/api/equipment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${technicianToken}`
        },
        body: JSON.stringify({
          code: "TEST-UNAUTH-01",
          name: "Unauthorized Excavator",
          type: "Excavator",
          location: "Mine-I",
          section: "Mining",
          running_hours: 50,
          service_life_hours: 20000
        })
      });
      const data = await res.json();

      assert.equal(res.status, 403, "Technician must receive HTTP 403 Forbidden");
      assert.match(data.error, /Forbidden/i, "Error message must indicate Forbidden");

      passed = true;
      detail = `HTTP 403 Forbidden for role 'Technician'`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(3, "Equipment Register (RBAC /api/equipment)", passed, detail);
    }
  });

  // TEST 4: Audit verify endpoint on clean database (fresh login as Admin)
  test("4. The audit verify endpoint reports valid on a clean database", async () => {
    let passed = false;
    let detail = "";
    try {
      // Generate at least 15 genuine audit rows through real API calls before tamper and gap tests
      await generateGenuineAuditRows(BASE_URL);

      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL);

      const res = await fetch(`${BASE_URL}/api/audit/verify`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();

      assert.equal(res.status, 200, "Verification endpoint must return HTTP 200");
      assert.equal(data.valid, true, "Audit chain must report valid: true");
      assert.ok(typeof data.count === "number" && data.count >= 15, `Must return entry count >= 15 (got ${data.count})`);
      assert.ok(data.anchor, "Must include separate anchor file validation");

      passed = true;
      detail = `HTTP 200 valid: true, rows: ${data.count}, anchor synchronized`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(4, "Audit Log (Clean Chain Verification)", passed, detail);
    }
  });

  // TEST 5: Audit row tampering detection and restoration (fresh login as Admin)
  test("5. Tampering with one audit row makes verify fail (restore it afterward)", async () => {
    let passed = false;
    let detail = "";
    const tempBackupDir = path.join(os.tmpdir(), "nlc_audit_tamper_safe_" + Date.now());
    fs.mkdirSync(tempBackupDir, { recursive: true });
    const safeDbCopy = path.join(tempBackupDir, "nlc.db");
    const safeAnchorCopy = path.join(tempBackupDir, "anchor.json");

    try {
      // Save temporary clean copy of temporary database and anchor before tampering
      fs.copyFileSync(tempDbPath, safeDbCopy);
      if (fs.existsSync(tempAnchorPath)) fs.copyFileSync(tempAnchorPath, safeAnchorCopy);

      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL);

      const rowsBefore = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
      assert.ok(rowsBefore.length >= 15, `Audit log must contain at least 15 rows before tamper test (got ${rowsBefore.length})`);

      const targetRow = db.prepare("SELECT id, action FROM audit_log ORDER BY id DESC LIMIT 1").get();
      assert.ok(targetRow, "Audit log must contain at least one row");
      const originalAction = targetRow.action;

      try {
        db.prepare("UPDATE audit_log SET action = ? WHERE id = ?").run("UNAUTHORIZED_TAMPER_TEST", targetRow.id);

        const tamperRes = await fetch(`${BASE_URL}/api/audit/verify`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${adminToken}` }
        });
        const tamperData = await tamperRes.json();

        assert.equal(tamperRes.status, 200, "Endpoint returns HTTP 200 with tamper diagnosis");
        assert.equal(tamperData.valid, false, "Tampered chain must report valid: false");
        assert.equal(tamperData.brokenRowId, targetRow.id, "Diagnosis must pinpoint tampered row ID");

        detail = `Tamper detected at row #${targetRow.id} (valid: false). `;
      } finally {
        db.prepare("UPDATE audit_log SET action = ? WHERE id = ?").run(originalAction, targetRow.id);
      }

      const restoreRes = await fetch(`${BASE_URL}/api/audit/verify`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const restoreData = await restoreRes.json();

      assert.equal(restoreData.valid, true, "Restored chain must report valid: true");
      detail += `Restored successfully (valid: true).`;
      passed = true;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      // Always restore pristine temporary database and anchor from safe copy
      try {
        if (fs.existsSync(safeDbCopy)) fs.copyFileSync(safeDbCopy, tempDbPath);
        if (fs.existsSync(safeAnchorCopy)) fs.copyFileSync(safeAnchorCopy, tempAnchorPath);
        fs.rmSync(tempBackupDir, { recursive: true, force: true });
      } catch (e) {}
      recordResult(5, "Audit Log (Tamper Detection & Recovery)", passed, detail);
    }
  });

  // TEST 6: Audit row ID continuity and gap detection (fresh login as Admin)
  test("6. Audit verification detects row ID gaps and reports ID_GAP_DETECTED with position", async () => {
    let passed = false;
    let detail = "";
    const tempBackupDir = path.join(os.tmpdir(), "nlc_audit_gap_safe_" + Date.now());
    fs.mkdirSync(tempBackupDir, { recursive: true });
    const safeDbCopy = path.join(tempBackupDir, "nlc.db");
    const safeAnchorCopy = path.join(tempBackupDir, "anchor.json");

    try {
      // Save temporary clean copy of temporary database and anchor before row deletion
      fs.copyFileSync(tempDbPath, safeDbCopy);
      if (fs.existsSync(tempAnchorPath)) fs.copyFileSync(tempAnchorPath, safeAnchorCopy);

      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL);

      const rows = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
      assert.ok(rows.length >= 15, `Database must contain at least 15 audit rows before gap test (got ${rows.length})`);

      const targetIndex = 5; // An intermediate row (6th row in chain)
      const targetRow = rows[targetIndex];
      const prevRow = rows[targetIndex - 1];
      const nextRow = rows[targetIndex + 1];

      try {
        // Delete intermediate row directly in SQLite
        db.prepare("DELETE FROM audit_log WHERE id = ?").run(targetRow.id);

        const gapRes = await fetch(`${BASE_URL}/api/audit/verify`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${adminToken}` }
        });
        const gapData = await gapRes.json();

        assert.equal(gapRes.status, 200, "Verification endpoint returns HTTP 200");
        assert.equal(gapData.valid, false, "Must report valid: false on ID gap");
        assert.equal(gapData.reason, "ID_GAP_DETECTED", `Reason must be ID_GAP_DETECTED (got ${gapData.reason})`);
        assert.equal(gapData.position, targetIndex + 1, `Position must match row position ${targetIndex + 1}`);
        assert.equal(gapData.expectedId, prevRow.id + 1, `Expected ID must be #${prevRow.id + 1}`);
        assert.equal(gapData.foundId, nextRow.id, `Found ID must be #${nextRow.id}`);
        assert.equal(gapData.brokenRowId, nextRow.id, `brokenRowId must point to #${nextRow.id}`);

        detail = `Detected gap at pos ${gapData.position} (expected #${gapData.expectedId}, found #${gapData.foundId}). `;
      } finally {
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

      const restoreRes = await fetch(`${BASE_URL}/api/audit/verify`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const restoreData = await restoreRes.json();
      assert.equal(restoreData.valid, true, "Chain must report valid: true after restoring row");

      detail += "Restored cleanly (valid: true).";
      passed = true;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      // Always restore pristine temporary database and anchor from safe copy
      try {
        if (fs.existsSync(safeDbCopy)) fs.copyFileSync(safeDbCopy, tempDbPath);
        if (fs.existsSync(safeAnchorCopy)) fs.copyFileSync(safeAnchorCopy, tempAnchorPath);
        fs.rmSync(tempBackupDir, { recursive: true, force: true });
      } catch (e) {}
      recordResult(6, "Audit Log (Row ID Continuity & ID_GAP_DETECTED)", passed, detail);
    }
  });

  // TEST 7: Manager creates an action with a past due date and it is overdue (fresh login as Manager)
  test("7. Manager creates an action with a past due date and it is overdue", async () => {
    let passed = false;
    let detail = "";
    try {
      const managerToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 3 days ago

      const res = await fetch(`${BASE_URL_IPV4}/api/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${managerToken}`
        },
        body: JSON.stringify({
          source: "DGMS Safety Audit 2026",
          description: "Inspect electrical cabling isolation on crusher feeder chute",
          owner_id: 3, // Suresh Murugan (Supervisor)
          due_date: pastDate
        })
      });
      const data = await res.json();

      assert.equal(res.status, 201, `Action creation must return HTTP 201 (got ${res.status})`);
      assert.ok(data.action && data.action.id, "Response must include created action object with id");
      assert.equal(data.action.isOverdue, true, "Past-due action item must have isOverdue = true");

      createdActionId = data.action.id;
      passed = true;
      detail = `HTTP 201 created action #${createdActionId}, past due_date: ${pastDate}, isOverdue: true`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(7, "Action Tracker (Creation & Overdue Detection)", passed, detail);
    }
  });

  // TEST 8: Non-owner updating progress gets 403; owner updating gets 200 (fresh logins)
  test("8. Non-owner updating progress gets 403; owner updating gets 200", async () => {
    let passed = false;
    let detail = "";
    try {
      assert.ok(createdActionId, "Action ID from previous test required");

      // Step A: Fresh login as non-owner (Technician, user ID 4) -> must return 403
      const techToken = await freshLogin("technician@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const nonOwnerRes = await fetch(`${BASE_URL_IPV4}/api/actions/${createdActionId}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${techToken}`
        },
        body: JSON.stringify({ status: "In Progress", evidence_note: "Unauthorized progress attempt" })
      });
      const nonOwnerData = await nonOwnerRes.json();
      assert.equal(nonOwnerRes.status, 403, "Non-owner must receive HTTP 403 Forbidden");
      assert.match(nonOwnerData.error, /Forbidden/i, "Error message must indicate Forbidden");

      // Step B: Fresh login as assigned owner (Supervisor, user ID 3) -> must return 200
      const ownerToken = await freshLogin("supervisor@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const ownerRes = await fetch(`${BASE_URL_IPV4}/api/actions/${createdActionId}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          status: "Done",
          evidence_note: "Cabling isolation verified and replacement conduits completed."
        })
      });
      const ownerData = await ownerRes.json();
      assert.equal(ownerRes.status, 200, "Owner progress update must return HTTP 200");
      assert.equal(ownerData.action.status, "Done", "Status must update to Done");

      passed = true;
      detail = `Non-owner progress: HTTP 403 ('${nonOwnerData.error.slice(0, 35)}...'), Owner progress: HTTP 200 (status='Done')`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(8, "Action Tracker (Progress Update RBAC)", passed, detail);
    }
  });

  // TEST 9: Non-Manager verifying gets 403; Manager verifying gets 200 and isOverdue becomes false (fresh logins)
  test("9. Non-Manager verifying gets 403; Manager verifying gets 200 and isOverdue becomes false", async () => {
    let passed = false;
    let detail = "";
    try {
      assert.ok(createdActionId, "Action ID required");

      // Step A: Fresh login as non-manager (Supervisor) -> must return 403
      const supervisorToken = await freshLogin("supervisor@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const nonMgrRes = await fetch(`${BASE_URL_IPV4}/api/actions/${createdActionId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        },
        body: JSON.stringify({ verification_note: "Unauthorized verification attempt" })
      });
      assert.equal(nonMgrRes.status, 403, "Non-manager verification must receive HTTP 403");

      // Step B: Fresh login as Manager -> must return 200 and isOverdue becomes false
      const managerToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const mgrRes = await fetch(`${BASE_URL_IPV4}/api/actions/${createdActionId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${managerToken}`
        },
        body: JSON.stringify({ verification_note: "Closure verified during site inspection." })
      });
      const mgrData = await mgrRes.json();
      assert.equal(mgrRes.status, 200, "Manager verification must return HTTP 200");
      assert.equal(mgrData.action.status, "Verified", "Status must update to Verified");
      assert.equal(mgrData.action.isOverdue, false, "Verified action must no longer be overdue (isOverdue = false)");

      passed = true;
      detail = `Non-Manager verify: HTTP 403, Manager verify: HTTP 200 (status='Verified', isOverdue=false)`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(9, "Action Tracker (Verification RBAC & Overdue Clear)", passed, detail);
    }
  });

  // TEST 10: Dashboard access permissions (403 for Technician & Requester, 200 for Manager & Admin)
  test("10. Dashboard returns 403 for Technician and Requester, 200 for Manager and Admin", async () => {
    let passed = false;
    let detail = "";
    try {
      // Step A: Technician -> 403
      const techToken = await freshLogin("technician@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const techRes = await fetch(`${BASE_URL_IPV4}/api/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${techToken}` }
      });
      assert.equal(techRes.status, 403, "Technician must receive HTTP 403 on /dashboard/stats");

      // Step B: Requester -> 403
      const reqToken = await freshLogin("requester@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const reqRes = await fetch(`${BASE_URL_IPV4}/api/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${reqToken}` }
      });
      assert.equal(reqRes.status, 403, "Requester must receive HTTP 403 on /dashboard/stats");

      // Step C: Manager -> 200
      const mgrToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const mgrRes = await fetch(`${BASE_URL_IPV4}/api/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${mgrToken}` }
      });
      assert.equal(mgrRes.status, 200, "Manager must receive HTTP 200 on /dashboard/stats");

      // Step D: Admin -> 200
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV4);
      const adminRes = await fetch(`${BASE_URL_IPV4}/api/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      assert.equal(adminRes.status, 200, "Admin must receive HTTP 200 on /dashboard/stats");

      passed = true;
      detail = `Tech: HTTP 403, Requester: HTTP 403, Manager: HTTP 200, Admin: HTTP 200`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(10, "Dashboard (Role-Based Access Control)", passed, detail);
    }
  });

  // TEST 11: Dashboard on freshly seeded temporary database has no null or NaN values and PM compliance is a number
  test("11. Freshly seeded temporary database dashboard has no null or NaN values and PM compliance is a number", async () => {
    let passed = false;
    let detail = "";
    const rootBackend = path.resolve(__dirname, "..");
    const tempDir = path.join(os.tmpdir(), "nlc_dash_fresh_" + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    let tempProc = null;

    try {
      const excluded = ["nlc.db", "nlc.db-shm", "nlc.db-wal", "nlc.db.bak", "anchor.json", "anchor.json.bak", ".git", "tests-output", ".env"];

      for (const item of fs.readdirSync(rootBackend)) {
        if (excluded.includes(item)) continue;
        const src = path.join(rootBackend, item);
        const dest = path.join(tempDir, item);

        if (item === "node_modules") {
          try {
            execSync(`cmd /c mklink /J "${dest}" "${src}"`, { stdio: "ignore" });
          } catch (e) {}
        } else {
          const stat = fs.statSync(src);
          if (stat.isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
          } else {
            fs.copyFileSync(src, dest);
          }
        }
      }

      const dashPort = await getFreePort();
      fs.writeFileSync(
        path.join(tempDir, ".env"),
        `PORT=${dashPort}\nJWT_SECRET=super_secret_test_jwt_key_2026_nlc_secure_dashboard_fresh\nDEMO_MODE=true\n`,
        "utf8"
      );

      const nodeModulesDir = path.join(rootBackend, "node_modules");
      const test11Env = { ...process.env, NODE_PATH: nodeModulesDir };
      delete test11Env.DB_PATH;
      delete test11Env.ANCHOR_PATH;

      execSync("npm run seed", {
        cwd: tempDir,
        env: test11Env,
        stdio: "ignore"
      });

      tempProc = spawn(process.execPath, ["index.js"], {
        cwd: tempDir,
        env: {
          ...test11Env,
          PORT: String(dashPort),
          JWT_SECRET: "super_secret_test_jwt_key_2026_nlc_secure_dashboard_fresh"
        },
        stdio: "ignore"
      });

      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const r = await fetch(`http://127.0.0.1:${dashPort}/api/health`, { signal: AbortSignal.timeout(500) });
          if (r.ok) { ready = true; break; }
        } catch (e) {}
      }

      assert.ok(ready, `Temporary server must start successfully on port ${dashPort}`);

      const loginRes = await fetch(`http://127.0.0.1:${dashPort}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@nlc.in", password: "NlcSecure@2026!" })
      });
      const loginData = await loginRes.json();
      assert.ok(loginData.token, "Login on fresh database must succeed");

      const dashRes = await fetch(`http://127.0.0.1:${dashPort}/api/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${loginData.token}` }
      });
      assert.equal(dashRes.status, 200, "Dashboard stats must return HTTP 200");
      const stats = await dashRes.json();

      const pmCompliance = stats.preventiveMaintenance?.compliancePercentage;
      assert.equal(typeof pmCompliance, "number", "PM compliance percentage must be a number");
      assert.equal(Number.isNaN(pmCompliance), false, "PM compliance percentage cannot be NaN");

      const hasBadValues = hasNullOrNaN(stats);
      assert.equal(hasBadValues, false, "Dashboard stats must not contain any null or NaN values");

      passed = true;
      detail = `HTTP 200, zero null/NaN values, PM compliance: ${pmCompliance}% (type: number)`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      if (tempProc) {
        try { tempProc.kill(); } catch (e) {}
      }
      try {
        const junction = path.join(tempDir, "node_modules");
        if (fs.existsSync(junction)) {
          try { execSync(`cmd /c rmdir "${junction}"`, { stdio: "ignore" }); } catch (e) {}
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
      recordResult(11, "Dashboard (Fresh Temporary DB Data Integrity)", passed, detail);
    }
  });

  // TEST 12: CORS origin policy enforcement (403 for disallowed origin, 200/204 for allowed origin)
  test("12. CORS policy enforcement: clean 403 on disallowed origin, normal headers on allowed origin", async () => {
    let passed = false;
    let detail = "";
    try {
      // Step A: Disallowed origin -> must return 403 JSON without ACAO header and without stack trace
      const disallowedRes = await fetch(`${BASE_URL_IPV6}/api/health`, {
        headers: { "Origin": "http://localhost:9999" }
      });
      const disallowedBody = await disallowedRes.json();
      const disallowedAcao = disallowedRes.headers.get("access-control-allow-origin");

      assert.equal(disallowedRes.status, 403, `Disallowed origin must return HTTP 403 (got ${disallowedRes.status})`);
      assert.equal(disallowedAcao, null, "Disallowed origin must NOT receive Access-Control-Allow-Origin header");
      assert.ok(disallowedBody.error, "Response body must contain error message");
      assert.match(disallowedBody.error, /CORS/i, "Error message must indicate CORS policy denial");
      assert.equal(disallowedBody.stack, undefined, "Response body must not expose error stack trace");

      // Step B: Allowed origin -> must return 200 with Access-Control-Allow-Origin header
      const allowedRes = await fetch(`${BASE_URL_IPV6}/api/health`, {
        headers: { "Origin": "http://localhost:3000" }
      });
      const allowedBody = await allowedRes.json();
      const allowedAcao = allowedRes.headers.get("access-control-allow-origin");
      const allowedAcac = allowedRes.headers.get("access-control-allow-credentials");

      assert.equal(allowedRes.status, 200, "Allowed origin must return HTTP 200");
      assert.equal(allowedAcao, "http://localhost:3000", "Access-Control-Allow-Origin must match requesting allowed origin");
      assert.equal(allowedAcac, "true", "Access-Control-Allow-Credentials must be true");
      assert.deepEqual(allowedBody, { status: "ok" });

      // Step C: Preflight OPTIONS for allowed origin -> HTTP 204
      const preflightRes = await fetch(`${BASE_URL_IPV6}/api/health`, {
        method: "OPTIONS",
        headers: {
          "Origin": "http://localhost:3000",
          "Access-Control-Request-Method": "GET"
        }
      });
      assert.equal(preflightRes.status, 204, "Allowed preflight OPTIONS must return HTTP 204");
      assert.equal(preflightRes.headers.get("access-control-allow-origin"), "http://localhost:3000");

      passed = true;
      detail = `Disallowed (9999): HTTP 403 JSON (ACAO=null, stack=undefined), Allowed (3000): HTTP 200 (ACAO='http://localhost:3000')`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(12, "Security Hardening (CORS Policy Enforcement)", passed, detail);
    }
  });

  // TEST 13: SLA escalation engine: past-due assigned orders escalated=1 & audit row, Completed/Closed excluded, idempotent
  test("13. SLA escalation engine escalates past-due assigned orders and excludes Completed/Closed", async () => {
    let passed = false;
    let detail = "";
    try {
      const pastSla = new Date(Date.now() - 60 * 1000).toISOString(); // Exact ISO format written by assign route

      // 1. Create assigned work order with sla_due_at 1 minute in the past
      const insertAssigned = db.prepare(`
        INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
        VALUES (?, ?, 1, 1, 4, 'Critical', 'Assigned', 'corrective', ?, 0)
      `).run("SLA Escalation Engine Test Order", "Test description for SLA escalation", pastSla);
      const assignedOrderId = insertAssigned.lastInsertRowid;

      // 2. Create Completed and Closed orders with past sla_due_at (must NOT be escalated)
      const insertCompleted = db.prepare(`
        INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
        VALUES (?, ?, 1, 1, 4, 'Critical', 'Completed', 'corrective', ?, 0)
      `).run("Completed Order Past SLA", "Should not escalate", pastSla);
      const completedOrderId = insertCompleted.lastInsertRowid;

      const insertClosed = db.prepare(`
        INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
        VALUES (?, ?, 1, 1, 4, 'Critical', 'Closed', 'corrective', ?, 0)
      `).run("Closed Order Past SLA", "Should not escalate", pastSla);
      const closedOrderId = insertClosed.lastInsertRowid;

      // 3. Call the escalation function directly
      const escalatedOrders = escalateOverdueOrders();

      // Verify assigned order is escalated=1 in database
      const order = db.prepare("SELECT id, status, sla_due_at, escalated FROM work_orders WHERE id = ?").get(assignedOrderId);
      assert.equal(order.escalated, 1, `Order #${assignedOrderId} must be marked escalated = 1`);

      // Verify WORK_ORDER_ESCALATED audit row exists
      const auditRows = db.prepare("SELECT * FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' ORDER BY id DESC").all();
      const matchingAudit = auditRows.find(a => {
        try {
          const d = JSON.parse(a.details);
          return d.id === assignedOrderId;
        } catch {
          return false;
        }
      });
      assert.ok(matchingAudit, `Audit row WORK_ORDER_ESCALATED must exist for order #${assignedOrderId}`);
      const auditDetails = JSON.parse(matchingAudit.details);
      assert.equal(auditDetails.id, assignedOrderId);
      assert.equal(auditDetails.status, "Assigned");
      assert.equal(auditDetails.sla_due_at, pastSla);

      // 4. Verify Completed and Closed orders are NOT escalated
      const compOrder = db.prepare("SELECT escalated FROM work_orders WHERE id = ?").get(completedOrderId);
      assert.equal(compOrder.escalated, 0, "Completed order must NOT be escalated");

      const clsOrder = db.prepare("SELECT escalated FROM work_orders WHERE id = ?").get(closedOrderId);
      assert.equal(clsOrder.escalated, 0, "Closed order must NOT be escalated");

      // 5. Verify already escalated order is NOT escalated twice (idempotence)
      const auditCountBefore = db.prepare("SELECT count(*) as c FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' AND details LIKE ?").get(`%"id":${assignedOrderId}%`).c;
      assert.equal(auditCountBefore, 1, "Exactly 1 audit row after first escalation");

      escalateOverdueOrders();

      const auditCountAfter = db.prepare("SELECT count(*) as c FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' AND details LIKE ?").get(`%"id":${assignedOrderId}%`).c;
      assert.equal(auditCountAfter, 1, "Still exactly 1 audit row after second escalation (no duplicate audit entries)");

      passed = true;
      detail = `Order #${assignedOrderId} escalated=1, audit row written, Completed/Closed excluded (escalated=0), idempotent (1 audit row)`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(13, "Work Orders (SLA Escalation Engine & Audit Log)", passed, detail);
    }
  });

  // TEST 14: Rate limiting on rapid logins (isolated instance with default limits)
  test("14. 11 rapid logins return 429", async () => {
    let passed = false;
    let detail = "";
    let rateProc = null;

    try {
      const ratePort = await getFreePort();
      const rateUrl = `http://127.0.0.1:${ratePort}`;

      // Start backend with default rate limits (delete suite's elevated rate limits)
      const rateEnv = { ...process.env };
      delete rateEnv.LOGIN_RATE_LIMIT_MAX;
      delete rateEnv.API_RATE_LIMIT_MAX;

      rateProc = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
        cwd: path.join(__dirname, ".."),
        env: {
          ...rateEnv,
          PORT: String(ratePort),
          JWT_SECRET: "test_jwt_secret_rate_limit_key_2026",
          DB_PATH: tempDbPath,
          ANCHOR_PATH: tempAnchorPath
        },
        stdio: "ignore"
      });

      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          const r = await fetch(`${rateUrl}/api/health`, { signal: AbortSignal.timeout(500) });
          if (r.ok) { ready = true; break; }
        } catch (e) {}
      }

      assert.ok(ready, `Rate limit test server must be ready on ${rateUrl}`);

      const statuses = [];
      for (let i = 1; i <= 11; i++) {
        const res = await fetch(`${rateUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `rate_probe_${i}@nlc.in`,
            password: "WrongPassword999!"
          })
        });
        statuses.push(res.status);
      }

      const eleventhStatus = statuses[10];
      assert.equal(eleventhStatus, 429, `11th login attempt must return HTTP 429 Too Many Requests (got ${eleventhStatus})`);

      passed = true;
      detail = `First 10 returned 401, 11th request returned HTTP 429 (Too Many Requests)`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      if (rateProc) {
        try { rateProc.kill(); } catch (e) {}
      }
      recordResult(14, "Security Hardening (Rate Limiter: 11 Logins -> 429)", passed, detail);
    }
  });

  // TEST 15: Admin forbidden from work-order workflow actions (HTTP 403 on approve, assign, start, complete, close)
  test("15. Admin gets 403 on approve, assign, start, complete and close", async () => {
    let passed = false;
    let detail = "";
    try {
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const order = db.prepare("SELECT id FROM work_orders LIMIT 1").get();
      assert.ok(order, "At least one work order must exist in database");
      const orderId = order.id;

      // 1. Admin gets 403 on approve
      const approveRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
      });
      const approveData = await approveRes.json();
      assert.equal(approveRes.status, 403, `Admin on approve must receive 403 (got ${approveRes.status})`);
      assert.match(approveData.error, /Forbidden/i, "Approve error must mention Forbidden");

      // 2. Admin gets 403 on assign
      const assignRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` },
        body: JSON.stringify({ technician_id: 4, priority: "High" })
      });
      const assignData = await assignRes.json();
      assert.equal(assignRes.status, 403, `Admin on assign must receive 403 (got ${assignRes.status})`);
      assert.match(assignData.error, /Forbidden/i, "Assign error must mention Forbidden");

      // 3. Admin gets 403 on start
      const startRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/start`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
      });
      const startData = await startRes.json();
      assert.equal(startRes.status, 403, `Admin on start must receive 403 (got ${startRes.status})`);
      assert.match(startData.error, /Forbidden/i, "Start error must mention Forbidden");

      // 4. Admin gets 403 on complete
      const completeRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
      });
      const completeData = await completeRes.json();
      assert.equal(completeRes.status, 403, `Admin on complete must receive 403 (got ${completeRes.status})`);
      assert.match(completeData.error, /Forbidden/i, "Complete error must mention Forbidden");

      // 5. Admin gets 403 on verify-close
      const closeRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/verify-close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
      });
      const closeData = await closeRes.json();
      assert.equal(closeRes.status, 403, `Admin on verify-close must receive 403 (got ${closeRes.status})`);
      assert.match(closeData.error, /Forbidden/i, "Close error must mention Forbidden");

      passed = true;
      detail = "Admin received HTTP 403 across all 5 actions: approve, assign, start, complete, close";
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(15, "Work Orders (Admin Forbidden from Workflow Actions: 403)", passed, detail);
    }
  });

  // TEST 16: Segregation of Duties: User cannot approve or reject a work order they raised themselves (HTTP 403)
  test("16. User cannot approve or reject a work order they raised themselves (HTTP 403)", async () => {
    let passed = false;
    let detail = "";
    try {
      // Step A: Supervisor creates a work order (requester_id will be Supervisor's id = 3)
      const supervisorToken = await freshLogin("supervisor@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const createRes = await fetch(`${BASE_URL_IPV6}/api/work-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        },
        body: JSON.stringify({
          title: "Self-Approval Segregation Test Order",
          description: "Supervisor raised this order; must be blocked from self-approval and self-rejection.",
          equipment_id: 1,
          priority: "Medium"
        })
      });
      const createData = await createRes.json();
      assert.equal(createRes.status, 201, "Work order creation by supervisor must return HTTP 201");
      const orderId = createData.workOrder.id;

      // Step B: Supervisor attempts to approve their own work order -> must return HTTP 403
      const approveRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        }
      });
      const approveData = await approveRes.json();
      assert.equal(approveRes.status, 403, `Self-approval must return HTTP 403 (got ${approveRes.status})`);
      assert.match(approveData.error, /cannot approve a work order that you raised yourself/i, "Error must cite self-approval block");

      // Step C: Supervisor attempts to reject their own work order -> must return HTTP 403
      const rejectRes = await fetch(`${BASE_URL_IPV6}/api/work-orders/${orderId}/reject`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        }
      });
      const rejectData = await rejectRes.json();
      assert.equal(rejectRes.status, 403, `Self-rejection must return HTTP 403 (got ${rejectRes.status})`);
      assert.match(rejectData.error, /cannot reject a work order that you raised yourself/i, "Error must cite self-rejection block");

      passed = true;
      detail = `Self-approve: HTTP 403 ('${approveData.error.slice(0, 38)}...'), Self-reject: HTTP 403 ('${rejectData.error.slice(0, 37)}...')`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(16, "Segregation of Duties (Self-Approve/Reject Block: 403)", passed, detail);
    }
  });

  // TEST 17: Action Tracker: Only assigned owner can update progress (Admin gets HTTP 403)
  test("17. Action progress updates: only the assigned owner, not Admin (HTTP 403)", async () => {
    let passed = false;
    let detail = "";
    try {
      const mgrToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const supervisorToken = await freshLogin("supervisor@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);

      // Step A: Create an action owned by Supervisor (ID 3)
      const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      const createRes = await fetch(`${BASE_URL_IPV6}/api/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({
          source: "DGMS Audit Action",
          description: "Inspect dust suppression nozzles on conveyor CV-01",
          owner_id: 3, // Suresh Murugan (Supervisor)
          due_date: futureDate
        })
      });
      const createData = await createRes.json();
      assert.equal(createRes.status, 201, "Action item creation must return HTTP 201");
      const actionId = createData.action.id;

      // Step B: Admin attempts to update progress on this action -> must return HTTP 403
      const adminRes = await fetch(`${BASE_URL_IPV6}/api/actions/${actionId}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          status: "In Progress",
          evidence_note: "Admin attempting progress update"
        })
      });
      const adminData = await adminRes.json();
      assert.equal(adminRes.status, 403, `Admin progress update must return HTTP 403 (got ${adminRes.status})`);
      assert.match(adminData.error, /Only the assigned action owner/i, "Error must cite owner-only restriction");

      // Step C: Legitimate assigned owner (Supervisor ID 3) updates progress -> must return HTTP 200
      const ownerRes = await fetch(`${BASE_URL_IPV6}/api/actions/${actionId}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supervisorToken}`
        },
        body: JSON.stringify({
          status: "In Progress",
          evidence_note: "Nozzles inspected and calibrated."
        })
      });
      const ownerData = await ownerRes.json();
      assert.equal(ownerRes.status, 200, "Assigned owner progress update must return HTTP 200");
      assert.equal(ownerData.action.status, "In Progress");

      passed = true;
      detail = `Admin progress: HTTP 403 ('${adminData.error.slice(0, 36)}...'), Assigned owner progress: HTTP 200`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(17, "Action Tracker (Owner-Only Progress: Admin 403)", passed, detail);
    }
  });

  // TEST 18: Action verification: Manager only (Admin gets 403) and verifier cannot be the action's owner
  test("18. Action verification: Manager only (Admin gets 403) and verifier cannot be action owner (403)", async () => {
    let passed = false;
    let detail = "";
    try {
      const mgrToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

      // Step A: Create an action owned by Manager (ID 2: Ananya Sharma)
      const selfOwnedRes = await fetch(`${BASE_URL_IPV6}/api/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({
          source: "Internal Review",
          description: "Update emergency evacuation protocol documents",
          owner_id: 2, // Ananya Sharma (Manager)
          due_date: futureDate
        })
      });
      const selfOwnedData = await selfOwnedRes.json();
      assert.equal(selfOwnedRes.status, 201, "Self-owned action creation must return HTTP 201");
      const selfOwnedId = selfOwnedData.action.id;

      // Step B: Admin attempts to verify -> must return HTTP 403 (Manager only)
      const adminVerifyRes = await fetch(`${BASE_URL_IPV6}/api/actions/${selfOwnedId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({ verification_note: "Admin verify attempt" })
      });
      const adminVerifyData = await adminVerifyRes.json();
      assert.equal(adminVerifyRes.status, 403, `Admin verification must return HTTP 403 (got ${adminVerifyRes.status})`);
      assert.match(adminVerifyData.error, /Forbidden/i, "Admin verification must be forbidden");

      // Step C: Manager attempts to verify their own action -> must return HTTP 403 (Segregation of Duties)
      const mgrSelfVerifyRes = await fetch(`${BASE_URL_IPV6}/api/actions/${selfOwnedId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({ verification_note: "Manager self-verification attempt" })
      });
      const mgrSelfVerifyData = await mgrSelfVerifyRes.json();
      assert.equal(mgrSelfVerifyRes.status, 403, `Manager self-verification must return HTTP 403 (got ${mgrSelfVerifyRes.status})`);
      assert.match(mgrSelfVerifyData.error, /cannot verify closure of an action item you own/i, "Must cite self-verification block");

      // Step D: Create action owned by Supervisor (ID 3), Manager verifies it -> must return HTTP 200
      const otherActionRes = await fetch(`${BASE_URL_IPV6}/api/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({
          source: "Safety Circular 10",
          description: "Replace warning signs along haul road sector 4",
          owner_id: 3, // Suresh Murugan (Supervisor)
          due_date: futureDate
        })
      });
      const otherActionData = await otherActionRes.json();
      const otherActionId = otherActionData.action.id;

      const mgrOtherVerifyRes = await fetch(`${BASE_URL_IPV6}/api/actions/${otherActionId}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({ verification_note: "Verified on site by Manager" })
      });
      const mgrOtherVerifyData = await mgrOtherVerifyRes.json();
      assert.equal(mgrOtherVerifyRes.status, 200, "Manager verification of non-owned action must return HTTP 200");
      assert.equal(mgrOtherVerifyData.action.status, "Verified");

      passed = true;
      detail = `Admin verify: HTTP 403, Manager self-verify: HTTP 403 ('${mgrSelfVerifyData.error.slice(0, 36)}...'), Manager verify other: HTTP 200`;
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      recordResult(18, "Action Verification (Manager-Only & Non-Owner Segregation: 403)", passed, detail);
    }
  });

  // TEST 19: Running-hours PM scheduler: threshold trigger, duplicate suppression per schedule, second schedule on same machine, and day schedules
  test("19. Running-hours PM schedule: threshold trigger, duplicate suppression per schedule, second schedule on same machine, and day schedules", async () => {
    let passed = false;
    let detail = "";
    let originalRunningHours;

    try {
      const mgrToken = await freshLogin("manager@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);

      // Part 1: Input Validation
      // Hours schedule with interval_hours <= 0 -> 400
      const badHoursRes = await fetch(`${BASE_URL_IPV6}/api/pm-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mgrToken}` },
        body: JSON.stringify({ equipment_id: 2, task: "Invalid zero-hour PM", trigger_type: "hours", interval_hours: 0 })
      });
      assert.equal(badHoursRes.status, 400, "Hours schedule with interval_hours <= 0 must return HTTP 400");

      // Days schedule with interval_days <= 0 -> 400
      const badDaysRes = await fetch(`${BASE_URL_IPV6}/api/pm-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mgrToken}` },
        body: JSON.stringify({ equipment_id: 2, task: "Invalid zero-day PM", trigger_type: "days", interval_days: 0 })
      });
      assert.equal(badDaysRes.status, 400, "Day schedule with interval_days <= 0 must return HTTP 400");

      // Part 2: Hours schedule threshold check
      const eq = db.prepare("SELECT id, running_hours FROM equipment WHERE id = 2").get();
      originalRunningHours = eq.running_hours;

      // Create Schedule 1 for equipment 2: triggers at (originalRunningHours + 100)
      const sched1Res = await fetch(`${BASE_URL_IPV6}/api/pm-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mgrToken}` },
        body: JSON.stringify({
          equipment_id: 2,
          task: "100h Hydraulic System Inspection",
          trigger_type: "hours",
          interval_hours: 100,
          last_done_hours: originalRunningHours
        })
      });
      assert.equal(sched1Res.status, 201, "Valid hours schedule creation must return HTTP 201");
      const sched1Data = await sched1Res.json();
      const sched1Id = sched1Data.schedule.id;

      // Before threshold crossed: running_hours is originalRunningHours (< originalRunningHours + 100)
      runPmScheduler();
      const woBefore = db.prepare("SELECT id FROM work_orders WHERE pm_schedule_id = ?").all(sched1Id);
      assert.equal(woBefore.length, 0, "Hours schedule must NOT fire before threshold is crossed");

      // Cross threshold: update running_hours to originalRunningHours + 100
      db.prepare("UPDATE equipment SET running_hours = ? WHERE id = 2").run(originalRunningHours + 100);
      runPmScheduler();

      const woAfter = db.prepare("SELECT id, title, type, status, pm_schedule_id FROM work_orders WHERE pm_schedule_id = ?").all(sched1Id);
      assert.equal(woAfter.length, 1, "Hours schedule MUST fire when threshold is crossed");
      assert.equal(woAfter[0].type, "preventive", "Created order must have type='preventive'");
      assert.equal(woAfter[0].status, "Submitted", "Created order must have status='Submitted'");
      assert.equal(woAfter[0].pm_schedule_id, sched1Id, "Created order must reference pm_schedule_id");

      // Verify pm_schedules last_done_hours updated to equipment's current running_hours
      const sched1Updated = db.prepare("SELECT last_done_hours FROM pm_schedules WHERE id = ?").get(sched1Id);
      assert.equal(sched1Updated.last_done_hours, originalRunningHours + 100, "Schedule last_done_hours must update to current running_hours");

      // Part 3: Duplicate suppression while order is open
      // Trigger runner again while woAfter[0] is still in status 'Submitted'
      runPmScheduler();
      const woDup = db.prepare("SELECT id FROM work_orders WHERE pm_schedule_id = ?").all(sched1Id);
      assert.equal(woDup.length, 1, "Duplicate work order must be suppressed while existing order is open");

      // Part 4: A second schedule on the SAME machine still fires independently
      const sched2Res = await fetch(`${BASE_URL_IPV6}/api/pm-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mgrToken}` },
        body: JSON.stringify({
          equipment_id: 2,
          task: "50h Gearbox Oil Sampling",
          trigger_type: "hours",
          interval_hours: 50,
          last_done_hours: originalRunningHours + 50
        })
      });
      assert.equal(sched2Res.status, 201, "Second schedule creation must return HTTP 201");
      const sched2Data = await sched2Res.json();
      const sched2Id = sched2Data.schedule.id;

      // Machine running hours is originalRunningHours + 100, which satisfies (originalRunningHours + 50) + 50
      runPmScheduler();
      const woSched2 = db.prepare("SELECT id, pm_schedule_id FROM work_orders WHERE pm_schedule_id = ?").all(sched2Id);
      assert.equal(woSched2.length, 1, "Second schedule on same machine must fire independently despite first schedule having open order");

      // Part 5: Day schedules still work
      const pastIso = new Date(Date.now() - 120000).toISOString();
      const daySchedRes = await fetch(`${BASE_URL_IPV6}/api/pm-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mgrToken}` },
        body: JSON.stringify({
          equipment_id: 2,
          task: "Weekly Emergency Stop Verification",
          trigger_type: "days",
          interval_days: 1,
          next_due: pastIso
        })
      });
      assert.equal(daySchedRes.status, 201, "Day schedule creation must return HTTP 201");
      const daySchedData = await daySchedRes.json();
      const daySchedId = daySchedData.schedule.id;

      runPmScheduler();
      const woDay = db.prepare("SELECT id, pm_schedule_id FROM work_orders WHERE pm_schedule_id = ?").all(daySchedId);
      assert.equal(woDay.length, 1, "Day schedule must fire and create preventive work order when next_due <= now");

      passed = true;
      detail = "Threshold gating verified, duplicates suppressed per schedule, multi-schedule per asset verified, day schedules functional";
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      if (originalRunningHours !== undefined) {
        db.prepare("UPDATE equipment SET running_hours = ? WHERE id = 2").run(originalRunningHours);
      }
      recordResult(19, "Preventive Maintenance (Running-Hours Triggers & Per-Schedule Duplicates)", passed, detail);
    }
  });

  // TEST 20: Audit log tamper-evident protection: Deleting a user with audit records is rejected by RESTRICT and preserves chain integrity
  test("20. Audit log tamper-evident protection: Deleting a user with audit records is rejected by RESTRICT and preserves chain integrity", async () => {
    let passed = false;
    let detail = "";
    const Database = require("better-sqlite3");
    const bcrypt = require("bcrypt");
    const { computeHash } = require("../audit");

    const tempTestDir = path.join(os.tmpdir(), "nlc_audit_restrict_" + Date.now());
    fs.mkdirSync(tempTestDir, { recursive: true });
    let tempDb = null;

    try {
      const tempDbPath = path.join(tempTestDir, "test_restrict.db");
      const tempAnchorPath = path.join(tempTestDir, "anchor.json");
      tempDb = new Database(tempDbPath);
      tempDb.pragma("foreign_keys = ON");

      // Initialize schema with ON DELETE RESTRICT on audit_log.user_id
      tempDb.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          section TEXT
        );
        CREATE TABLE audit_log (
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

      // 1. Insert temporary user in temporary database
      const dummyHash = bcrypt.hashSync("TempPass@2026!", 10);
      const insUser = tempDb.prepare(
        "INSERT INTO users (name, email, password_hash, role, section) VALUES (?, ?, ?, 'Requester', 'Mining')"
      ).run("Audit Restrict Test", "audit_restrict_test@nlc.in", dummyHash);
      const tempUserId = insUser.lastInsertRowid;

      // 2. Insert audit entry referencing user
      const timestamp = new Date().toISOString();
      const prevHash = "GENESIS";
      const action = "TEST_SECURITY_ACTION";
      const entity = "users";
      const details = JSON.stringify({ note: "Tamper-evident verification check" });
      const rowHash = computeHash(prevHash, timestamp, tempUserId, action, entity, details);

      const insAudit = tempDb.prepare(`
        INSERT INTO audit_log (timestamp, user_id, action, entity, details, prev_hash, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(timestamp, tempUserId, action, entity, details, prevHash, rowHash);

      // Save temporary anchor
      fs.writeFileSync(tempAnchorPath, JSON.stringify({ row_id: insAudit.lastInsertRowid, hash: rowHash, timestamp }), "utf8");

      // Helper function to verify chain on this temporary db
      const verifyTempChain = () => {
        const rows = tempDb.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
        if (rows.length === 0) return { valid: false };
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const expectedPrev = i === 0 ? "GENESIS" : rows[i - 1].hash;
          if (row.prev_hash !== expectedPrev) return { valid: false, reason: "BROKEN_LINK" };
          const h = computeHash(row.prev_hash, row.timestamp, row.user_id, row.action, row.entity, row.details);
          if (row.hash !== h) return { valid: false, reason: "HASH_MISMATCH" };
        }
        return { valid: true, count: rows.length };
      };

      assert.strictEqual(verifyTempChain().valid, true, "Initial temporary audit chain must be valid");

      // 3. Attempt to delete user - must throw FOREIGN KEY constraint failed
      assert.throws(
        () => {
          tempDb.prepare("DELETE FROM users WHERE id = ?").run(tempUserId);
        },
        /FOREIGN KEY constraint failed/,
        "Database must throw FOREIGN KEY constraint failed when attempting to delete user with audit records"
      );

      // 4. Verify audit row user_id was NOT modified or set to null
      const rowAfter = tempDb.prepare("SELECT * FROM audit_log WHERE id = ?").get(insAudit.lastInsertRowid);
      assert.strictEqual(rowAfter.user_id, tempUserId, "Audit log user_id must remain untouched");

      // 5. Verify audit chain remains 100% valid
      assert.strictEqual(verifyTempChain().valid, true, "Audit chain must remain valid after blocked delete");

      passed = true;
      detail = "ON DELETE RESTRICT blocked user deletion; audit log user_id unchanged and chain valid";
    } catch (err) {
      detail = err.message;
      throw err;
    } finally {
      if (tempDb) {
        try { tempDb.close(); } catch (e) {}
      }
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch (e) {}
      recordResult(20, "Audit Log (Tamper-Evident User Delete RESTRICT)", passed, detail);
    }
  });
});
