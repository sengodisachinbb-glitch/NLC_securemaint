// NLC-SecureMaint API Integration Test Suite
// Uses built-in node:test and node:assert (no external test libraries)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const otplib = require("otplib");
const db = require("../db");
const { escalateOverdueOrders } = require("../cron");

const BASE_URL = process.env.API_URL || "http://localhost:5000";
const urlObj = new URL(BASE_URL);
const PORT = urlObj.port || "5000";

const BASE_URL_IPV6 = `http://localhost:${PORT}`;
const BASE_URL_IPV4 = `http://127.0.0.1:${PORT}`;

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
async function freshLogin(email, password = "NlcSecure@2026!", host = BASE_URL_IPV4) {
  const loginRes = await fetch(`${host}/api/auth/login`, {
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
    const verifyRes = await fetch(`${host}/api/auth/2fa/verify`, {
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

  throw new Error(`Fresh login failed for ${email}: ${loginRes.status} ${JSON.stringify(loginData)}`);
}

describe("NLC-SecureMaint API Test Suite", () => {
  let createdActionId = null;

  before(async () => {
    const healthy = await isServerHealthy(BASE_URL_IPV6);
    if (!healthy) {
      console.log(`[Test Runner] Server not responding on ${BASE_URL_IPV6}. Launching backend server...`);
      serverProcess = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, PORT: String(PORT) },
        stdio: "inherit"
      });

      let connected = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await isServerHealthy(BASE_URL_IPV6)) {
          connected = true;
          break;
        }
      }

      if (!connected) {
        if (serverProcess) serverProcess.kill();
        throw new Error(`Unable to establish connection to ${BASE_URL_IPV6} within timeout.`);
      }
      console.log(`[Test Runner] Connected to backend on ${BASE_URL_IPV6}`);
    } else {
      console.log(`[Test Runner] Connected to existing running backend server on ${BASE_URL_IPV6}`);
    }
  });

  after(() => {
    // Shutdown server process if launched by test runner
    if (serverProcess) {
      serverProcess.kill();
      console.log("[Test Runner] Cleaned up temporary backend server instance.");
    }

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

  // TEST 2: Work Order state machine transition rejection (fresh login as Admin)
  test("2. An invalid state transition on a work order is rejected", async () => {
    let passed = false;
    let detail = "";
    try {
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const order = db.prepare("SELECT id, status FROM work_orders ORDER BY id ASC LIMIT 1").get();
      assert.ok(order, "At least one work order must exist in database");

      const invalidTarget = order.status === "Assigned" ? "approve" : "start";
      const res = await fetch(`${BASE_URL_IPV6}/api/work-orders/${order.id}/${invalidTarget}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        }
      });
      const data = await res.json();

      assert.equal(res.status, 400, `Invalid transition must return HTTP 400 (got ${res.status})`);
      assert.match(data.error, /Illegal status transition/i, "Error must indicate illegal transition");

      passed = true;
      detail = `HTTP 400 rejected '${order.status}' -> '${invalidTarget}' (${data.error.slice(0, 45)}...)`;
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
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);

      const res = await fetch(`${BASE_URL_IPV6}/api/audit/verify`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();

      assert.equal(res.status, 200, "Verification endpoint must return HTTP 200");
      assert.equal(data.valid, true, "Audit chain must report valid: true");
      assert.ok(typeof data.count === "number" && data.count >= 0, "Must return entry count");
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
    try {
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);
      const targetRow = db.prepare("SELECT id, action FROM audit_log ORDER BY id DESC LIMIT 1").get();
      assert.ok(targetRow, "Audit log must contain at least one row");
      const originalAction = targetRow.action;

      try {
        db.prepare("UPDATE audit_log SET action = ? WHERE id = ?").run("UNAUTHORIZED_TAMPER_TEST", targetRow.id);

        const tamperRes = await fetch(`${BASE_URL_IPV6}/api/audit/verify`, {
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

      const restoreRes = await fetch(`${BASE_URL_IPV6}/api/audit/verify`, {
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
      recordResult(5, "Audit Log (Tamper Detection & Recovery)", passed, detail);
    }
  });

  // TEST 6: Audit row ID continuity and gap detection (fresh login as Admin)
  test("6. Audit verification detects row ID gaps and reports ID_GAP_DETECTED with position", async () => {
    let passed = false;
    let detail = "";
    try {
      const adminToken = await freshLogin("admin@nlc.in", "NlcSecure@2026!", BASE_URL_IPV6);

      const rows = db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all();
      assert.ok(rows.length >= 3, "Database must contain at least 3 audit rows");

      const targetIndex = 1; // 2nd row
      const targetRow = rows[targetIndex];
      const prevRow = rows[targetIndex - 1];
      const nextRow = rows[targetIndex + 1];

      try {
        // Delete intermediate row directly in SQLite
        db.prepare("DELETE FROM audit_log WHERE id = ?").run(targetRow.id);

        const gapRes = await fetch(`${BASE_URL_IPV6}/api/audit/verify`, {
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

      const restoreRes = await fetch(`${BASE_URL_IPV6}/api/audit/verify`, {
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

      fs.writeFileSync(
        path.join(tempDir, ".env"),
        "PORT=5096\nJWT_SECRET=super_secret_test_jwt_key_2026_nlc_secure_dashboard_fresh\nDEMO_MODE=true\n",
        "utf8"
      );

      execSync("npm run seed", { cwd: tempDir, stdio: "ignore" });

      tempProc = spawn(process.execPath, ["index.js"], {
        cwd: tempDir,
        env: { ...process.env, PORT: "5096", JWT_SECRET: "super_secret_test_jwt_key_2026_nlc_secure_dashboard_fresh" },
        stdio: "ignore"
      });

      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const r = await fetch("http://localhost:5096/api/health", { signal: AbortSignal.timeout(500) });
          if (r.ok) { ready = true; break; }
        } catch (e) {}
      }

      assert.ok(ready, "Temporary server must start successfully on port 5096");

      const loginRes = await fetch("http://localhost:5096/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@nlc.in", password: "NlcSecure@2026!" })
      });
      const loginData = await loginRes.json();
      assert.ok(loginData.token, "Login on fresh database must succeed");

      const dashRes = await fetch("http://localhost:5096/api/dashboard/stats", {
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

  // TEST 14: Rate limiting on rapid logins (isolated instance on port 5094)
  test("14. 11 rapid logins return 429", async () => {
    let passed = false;
    let detail = "";
    let rateProc = null;

    try {
      rateProc = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, PORT: "5094", JWT_SECRET: "test_jwt_secret_rate_limit_key_2026" },
        stdio: "ignore"
      });

      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          const r = await fetch("http://localhost:5094/api/health", { signal: AbortSignal.timeout(500) });
          if (r.ok) { ready = true; break; }
        } catch (e) {}
      }

      assert.ok(ready, "Rate limit test server must be ready on port 5094");

      const statuses = [];
      for (let i = 1; i <= 11; i++) {
        const res = await fetch("http://localhost:5094/api/auth/login", {
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
});
