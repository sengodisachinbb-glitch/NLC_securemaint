// Test Group T1 Runner
// Validates health, seeding, authentication, lockout, equipment permissions & degradation, and audit hash chain

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const db = require("../db");

const BASE_URL = process.env.API_URL || "http://localhost:5000";
const results = [];
let serverProcess = null;

async function isServerHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (err) {
    return false;
  }
}

function record(id, description, expected, actual, status) {
  results.push({
    "ID": id,
    "What Was Tested": description,
    "Expected": expected,
    "Actual": actual,
    "Status": status
  });
}

async function runTests() {
  console.log("=== Starting Test Group T1 Execution ===");

  // Ensure backend server is reachable; if not, spin up a child instance
  const healthy = await isServerHealthy();
  if (!healthy) {
    console.log(`[Test Runner] Server not responding on ${BASE_URL}. Launching backend server...`);
    serverProcess = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: "5000" },
      stdio: "inherit"
    });

    let connected = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (await isServerHealthy()) {
        connected = true;
        break;
      }
    }

    if (!connected) {
      if (serverProcess) serverProcess.kill();
      throw new Error(`Unable to establish connection to ${BASE_URL} within timeout.`);
    }
    console.log(`[Test Runner] Connected to backend on ${BASE_URL}`);
  } else {
    console.log(`[Test Runner] Connected to existing running backend server on ${BASE_URL}`);
  }

  // -------------------------------------------------------------
  // Test 1: GET /api/health returns {"status":"ok"}
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    const passed = res.status === 200 && data.status === "ok";
    record(
      "T1.1",
      "GET /api/health availability and response payload",
      'HTTP 200 with {"status":"ok"}',
      `HTTP ${res.status} with ${JSON.stringify(data)}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.1", "GET /api/health availability", 'HTTP 200 with {"status":"ok"}', err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 2: Run npm run seed twice; confirm 5 users, 10 equipment, no duplicates, no plaintext passwords
  // -------------------------------------------------------------
  try {
    // Run seed twice
    execSync("npm run seed", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    execSync("npm run seed", { cwd: path.join(__dirname, ".."), stdio: "pipe" });

    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const eqCount = db.prepare("SELECT COUNT(*) as count FROM equipment").get().count;
    
    // Check for plaintext passwords
    const plainPasswords = db.prepare("SELECT email FROM users WHERE password_hash = 'NlcSecure@2026!'").all();
    const allUsers = db.prepare("SELECT email, password_hash FROM users").all();
    const allBcrypt = allUsers.every(u => u.password_hash.startsWith("$2b$") && u.password_hash.length === 60);

    // Check for duplicate emails or equipment codes
    const dupUsers = db.prepare("SELECT email, COUNT(*) as c FROM users GROUP BY email HAVING c > 1").all();
    const dupEquipment = db.prepare("SELECT code, COUNT(*) as c FROM equipment GROUP BY code HAVING c > 1").all();

    const passed = userCount === 5 && eqCount === 10 && plainPasswords.length === 0 && allBcrypt && dupUsers.length === 0 && dupEquipment.length === 0;

    record(
      "T1.2",
      "Idempotent database seeding (npm run seed x2)",
      "Exactly 5 users and 10 equipment items, 0 duplicates, 0 plaintext passwords (all bcrypt)",
      `Users: ${userCount}, Equipment: ${eqCount}, Duplicates: (Users: ${dupUsers.length}, Equip: ${dupEquipment.length}), Plaintext: ${plainPasswords.length}, Valid bcrypt hashes: ${allBcrypt}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.2", "Idempotent database seeding", "5 users, 10 equipment, no duplicates", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 3: Login with correct credentials for Supervisor and Technician
  // -------------------------------------------------------------
  let supervisorToken = null;
  let technicianToken = null;
  try {
    const rSup = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "supervisor@nlc.in", password: "NlcSecure@2026!" })
    });
    const dSup = await rSup.json();
    supervisorToken = dSup.token;

    const rTech = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "technician@nlc.in", password: "NlcSecure@2026!" })
    });
    const dTech = await rTech.json();
    technicianToken = dTech.token;

    const passed = rSup.status === 200 && Boolean(supervisorToken) && rTech.status === 200 && Boolean(technicianToken);
    record(
      "T1.3",
      "Authentication with valid credentials (Supervisor & Technician)",
      "HTTP 200 returning valid signed JWT token for both accounts",
      `Supervisor: HTTP ${rSup.status} (token length: ${supervisorToken?.length || 0}), Technician: HTTP ${rTech.status} (token length: ${technicianToken?.length || 0})`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.3", "Login for Supervisor and Technician", "HTTP 200 with tokens", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 4: Wrong password and unknown email return identical generic 401 message
  // -------------------------------------------------------------
  try {
    const rUnknown = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent_employee@nlc.in", password: "NlcSecure@2026!" })
    });
    const dUnknown = await rUnknown.json();

    const rWrong = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "technician@nlc.in", password: "WrongPassword999!" })
    });
    const dWrong = await rWrong.json();

    // Reset failed attempts on technician to prevent test pollution
    db.prepare("UPDATE users SET failed_attempts = 0 WHERE email = 'technician@nlc.in'").run();

    const passed = rUnknown.status === 401 && rWrong.status === 401 &&
                   dUnknown.error === "Invalid email or password." &&
                   dWrong.error === "Invalid email or password." &&
                   dUnknown.error === dWrong.error;

    record(
      "T1.4",
      "Account enumeration mitigation (wrong password vs unknown email)",
      "Both return HTTP 401 with identical message: 'Invalid email or password.'",
      `Unknown email: HTTP ${rUnknown.status} ('${dUnknown.error}'), Wrong password: HTTP ${rWrong.status} ('${dWrong.error}') [Identical: ${dUnknown.error === dWrong.error}]`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.4", "Wrong password and unknown email comparison", "Identical 401 error", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 5: Five wrong passwords locks account; correct password refused while locked
  // -------------------------------------------------------------
  try {
    const lockEmail = "requester@nlc.in";
    const attemptStatuses = [];
    let fifthAttemptBody = null;

    for (let i = 1; i <= 5; i++) {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lockEmail, password: "IncorrectPassword#" + i })
      });
      const d = await r.json();
      attemptStatuses.push(r.status);
      if (i === 5) fifthAttemptBody = d;
    }

    // Attempt login with CORRECT password while account is locked
    const rCorrectWhileLocked = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lockEmail, password: "NlcSecure@2026!" })
    });
    const dCorrectWhileLocked = await rCorrectWhileLocked.json();

    // Check database state
    const lockedUser = db.prepare("SELECT failed_attempts, locked_until FROM users WHERE email = ?").get(lockEmail);

    const passed = attemptStatuses[4] === 403 &&
                   fifthAttemptBody.error.includes("Account locked for 15 minutes") &&
                   rCorrectWhileLocked.status === 403 &&
                   dCorrectWhileLocked.error.includes("Account is temporarily locked") &&
                   lockedUser.failed_attempts === 5 &&
                   Boolean(lockedUser.locked_until);

    record(
      "T1.5",
      "Account lockout after 5 consecutive failed login attempts",
      "5th failed attempt locks account (HTTP 403); subsequent correct password is refused with HTTP 403",
      `5th attempt: HTTP ${attemptStatuses[4]} ('${fifthAttemptBody.error}'), Correct password while locked: HTTP ${rCorrectWhileLocked.status} ('${dCorrectWhileLocked.error}'), locked_until: ${lockedUser.locked_until}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.5", "Account lockout test", "HTTP 403 on lockout and refusal while locked", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 6: GET /api/auth/me with no token, fake token, valid token
  // -------------------------------------------------------------
  try {
    const rNoToken = await fetch(`${BASE_URL}/api/auth/me`);
    const dNoToken = await rNoToken.json();

    const rFakeToken = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { "Authorization": "Bearer fake.tampered.token" }
    });
    const dFakeToken = await rFakeToken.json();

    const rValidToken = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });
    const dValidToken = await rValidToken.json();

    const passed = rNoToken.status === 401 && rFakeToken.status === 401 && rValidToken.status === 200 &&
                   dValidToken.user && dValidToken.user.email === "supervisor@nlc.in";

    record(
      "T1.6",
      "GET /api/auth/me token authentication states",
      "No token -> HTTP 401, Fake token -> HTTP 401, Valid token -> HTTP 200 with user profile",
      `No token: HTTP ${rNoToken.status} ('${dNoToken.error}'), Fake token: HTTP ${rFakeToken.status} ('${dFakeToken.error}'), Valid token: HTTP ${rValidToken.status} (user: '${dValidToken.user?.name}', role: '${dValidToken.user?.role}')`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.6", "GET /api/auth/me verification", "401, 401, 200", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 7: Equipment permissions (GET all roles, POST/PUT Tech 403, POST Manager 201, invalid 400)
  // -------------------------------------------------------------
  let managerToken = null;
  let createdEquipmentId = null;
  try {
    // 1. GET /api/equipment as Technician (any role)
    const rGetTech = await fetch(`${BASE_URL}/api/equipment`, {
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dGetTech = await rGetTech.json();

    // 2. POST as Technician
    const rPostTech = await fetch(`${BASE_URL}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${technicianToken}` },
      body: JSON.stringify({
        code: "UNAUTH-TECH-01",
        name: "Unauthorized Tech Asset",
        type: "Conveyor",
        location: "Mine-I",
        section: "Conveyor Section",
        running_hours: 10,
        service_life_hours: 1000
      })
    });
    const dPostTech = await rPostTech.json();

    // 3. PUT as Technician
    const rPutTech = await fetch(`${BASE_URL}/api/equipment/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${technicianToken}` },
      body: JSON.stringify({
        code: "BWE-01",
        name: "Bucket Wheel Excavator 1400L",
        type: "Excavator",
        location: "Mine-II Bench 2",
        section: "Mining Section",
        running_hours: 2500,
        service_life_hours: 10000
      })
    });
    const dPutTech = await rPutTech.json();

    // 4. Generate Manager token (role authorized to create/edit equipment)
    managerToken = jwt.sign(
      { id: 2, name: "Ananya Sharma (Manager)", email: "manager@nlc.in", role: "Manager", section: "Maintenance Planning" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 5. POST as Manager (valid)
    const rPostMgr = await fetch(`${BASE_URL}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        code: "MGR-ASSET-01",
        name: "Manager Commissioned High-Capacity Belt",
        type: "Conveyor",
        location: "Mine-IA Sector 4",
        section: "Thermal Power Station",
        running_hours: 500,
        service_life_hours: 10000
      })
    });
    const dPostMgr = await rPostMgr.json();
    if (dPostMgr.equipment) {
      createdEquipmentId = dPostMgr.equipment.id;
    }

    // 6. POST as Manager with INVALID input
    const rPostInvalid = await fetch(`${BASE_URL}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        code: "",
        name: "",
        running_hours: -20
      })
    });
    const dPostInvalid = await rPostInvalid.json();

    const passed = rGetTech.status === 200 && Array.isArray(dGetTech.equipment) &&
                   rPostTech.status === 403 &&
                   rPutTech.status === 403 &&
                   rPostMgr.status === 201 && Boolean(createdEquipmentId) &&
                   rPostInvalid.status === 400 && Array.isArray(dPostInvalid.errors);

    record(
      "T1.7",
      "Equipment Register RBAC & Input Validation",
      "GET: HTTP 200 for any role; POST/PUT: HTTP 403 for Technician; POST: HTTP 201 for Manager; Invalid POST: HTTP 400",
      `GET (Tech): HTTP ${rGetTech.status} (${dGetTech.equipment?.length} items), POST (Tech): HTTP ${rPostTech.status} ('${dPostTech.error}'), PUT (Tech): HTTP ${rPutTech.status} ('${dPutTech.error}'), POST (Manager): HTTP ${rPostMgr.status} (ID: ${createdEquipmentId}), Invalid POST: HTTP ${rPostInvalid.status} (${dPostInvalid.errors?.length} validation errors)`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.7", "Equipment permissions and validation", "200, 403, 403, 201, 400", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 8: Equipment lifeStatus calculation (50% -> Green, 90% -> Amber, 110% -> Red)
  // -------------------------------------------------------------
  try {
    const eqId = createdEquipmentId || 1;
    const currentEq = db.prepare("SELECT * FROM equipment WHERE id = ?").get(eqId);
    const serviceLife = 10000;

    // 50% usage: 5,000 running hours
    const r50 = await fetch(`${BASE_URL}/api/equipment/${eqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        code: currentEq.code,
        name: currentEq.name,
        type: currentEq.type,
        location: currentEq.location,
        section: currentEq.section,
        running_hours: 5000,
        service_life_hours: serviceLife
      })
    });
    const d50 = await r50.json();
    const status50 = d50.equipment?.lifeStatus;

    // 90% usage: 9,000 running hours
    const r90 = await fetch(`${BASE_URL}/api/equipment/${eqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        code: currentEq.code,
        name: currentEq.name,
        type: currentEq.type,
        location: currentEq.location,
        section: currentEq.section,
        running_hours: 9000,
        service_life_hours: serviceLife
      })
    });
    const d90 = await r90.json();
    const status90 = d90.equipment?.lifeStatus;

    // 110% usage: 11,000 running hours
    const r110 = await fetch(`${BASE_URL}/api/equipment/${eqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        code: currentEq.code,
        name: currentEq.name,
        type: currentEq.type,
        location: currentEq.location,
        section: currentEq.section,
        running_hours: 11000,
        service_life_hours: serviceLife
      })
    });
    const d110 = await r110.json();
    const status110 = d110.equipment?.lifeStatus;

    const passed = status50 === "Green" && status90 === "Amber" && status110 === "Red";

    record(
      "T1.8",
      "Equipment degradation lifecycle calculation (RAG Life Status)",
      "50% usage -> 'Green', 90% usage -> 'Amber', 110% usage -> 'Red'",
      `50% (5,000 hrs / 10,000 hrs): '${status50}', 90% (9,000 hrs / 10,000 hrs): '${status90}', 110% (11,000 hrs / 10,000 hrs): '${status110}'`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.8", "Equipment lifeStatus calculation", "Green, Amber, Red", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 9: Audit log hash chain and RBAC verification
  // -------------------------------------------------------------
  try {
    // 1. Inspect audit log entries from DB
    const firstRow = db.prepare("SELECT * FROM audit_log ORDER BY id ASC LIMIT 1").get();
    const allAuditRows = db.prepare("SELECT id, action, prev_hash, hash FROM audit_log ORDER BY id ASC").all();

    let genesisCorrect = firstRow && firstRow.prev_hash === "GENESIS";
    let linksValid = true;
    for (let i = 1; i < allAuditRows.length; i++) {
      if (allAuditRows[i].prev_hash !== allAuditRows[i - 1].hash) {
        linksValid = false;
        break;
      }
    }

    const actionList = allAuditRows.map(r => r.action);
    const hasLoginAction = actionList.includes("LOGIN_SUCCESS");
    const hasEquipAction = actionList.includes("EQUIPMENT_CREATE") || actionList.includes("EQUIPMENT_UPDATE");

    // Admin token for audit inspection
    const adminToken = jwt.sign(
      { id: 1, name: "Rajesh Kumar (Admin)", email: "admin@nlc.in", role: "Admin", section: "Systems & Security" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. GET /api/audit as Admin
    const rAuditAdmin = await fetch(`${BASE_URL}/api/audit`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const dAuditAdmin = await rAuditAdmin.json();

    // 3. GET /api/audit/verify as Admin
    const rVerifyAdmin = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const dVerifyAdmin = await rVerifyAdmin.json();

    // 4. GET /api/audit as Technician (non-admin)
    const rAuditTech = await fetch(`${BASE_URL}/api/audit`, {
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dAuditTech = await rAuditTech.json();

    // 5. GET /api/audit/verify as Technician (non-admin)
    const rVerifyTech = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dVerifyTech = await rVerifyTech.json();

    const passed = genesisCorrect && linksValid && hasLoginAction && hasEquipAction &&
                   rAuditAdmin.status === 200 && Array.isArray(dAuditAdmin.auditLogs) &&
                   rVerifyAdmin.status === 200 && dVerifyAdmin.valid === true &&
                   rAuditTech.status === 403 &&
                   rVerifyTech.status === 403;

    record(
      "T1.9",
      "Audit Log cryptographic hash chain & role authorization",
      "First row prev_hash is GENESIS; all rows sequentially chained; login & equipment actions present; Admin access HTTP 200 (valid: true); Non-admin access HTTP 403",
      `First prev_hash: '${firstRow?.prev_hash}', Chain integrity: ${linksValid} (${allAuditRows.length} entries), Login & Equip actions logged: (Login: ${hasLoginAction}, Equip: ${hasEquipAction}), Admin /audit: HTTP ${rAuditAdmin.status}, Admin /verify: HTTP ${rVerifyAdmin.status} (valid: ${dVerifyAdmin.valid}), Tech /audit: HTTP ${rAuditTech.status}, Tech /verify: HTTP ${rVerifyTech.status}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T1.9", "Audit chain and verify endpoint", "GENESIS start, 200 for Admin, 403 for non-admin", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Generate Markdown Report
  // -------------------------------------------------------------
  const mdLines = [
    "# Test Group T1: Core Foundation, Authentication, Equipment & Audit Log",
    `**Execution Date:** ${new Date().toISOString()}  `,
    `**Tested Environment:** ${BASE_URL}  `,
    `**Evaluator Role:** Independent QA Tester  `,
    "",
    "---",
    "",
    "## Summary of Test Results",
    "",
    "| ID | What Was Tested | Expected Result | Actual Result / Output | Status |",
    "| :--- | :--- | :--- | :--- | :---: |"
  ];

  results.forEach(r => {
    // Escape pipes for markdown table compatibility
    const testDesc = r["What Was Tested"].replace(/\|/g, "\\|");
    const exp = r["Expected"].replace(/\|/g, "\\|");
    const act = r["Actual"].replace(/\|/g, "\\|");
    const badge = r.Status === "PASS" ? "✅ **PASS**" : r.Status === "FAIL" ? "❌ **FAIL**" : "⚠️ **NOT RUN**";
    mdLines.push(`| **${r.ID}** | ${testDesc} | ${exp} | ${act} | ${badge} |`);
  });

  const totalPass = results.filter(r => r.Status === "PASS").length;
  const totalFail = results.filter(r => r.Status === "FAIL").length;

  mdLines.push("");
  mdLines.push("---");
  mdLines.push("");
  mdLines.push(`### Verdict: ${totalPass}/${results.length} Tests Passed (${Math.round((totalPass / results.length) * 100)}%)`);
  if (totalFail === 0) {
    mdLines.push("All tested criteria under Test Group T1 passed successfully with zero failures.");
  } else {
    mdLines.push(`Warning: ${totalFail} test(s) failed.`);
  }

  const outputPath = path.resolve(__dirname, "../../tests-output/T1-results.md");
  fs.writeFileSync(outputPath, mdLines.join("\n"), "utf8");
  console.log(`\nResults written successfully to: ${outputPath}`);

  if (serverProcess) {
    serverProcess.kill();
    console.log("[Test Runner] Cleaned up temporary backend server instance.");
  }

  console.log("\n==========================================================================================");
  console.log("                                 TEST GROUP T1 RESULTS TABLE                              ");
  console.log("==========================================================================================");
  console.table(results.map(r => ({
    ID: r.ID,
    Test: r["What Was Tested"],
    Status: r.Status,
    Actual: r.Actual.slice(0, 65) + "..."
  })));
  console.log("==========================================================================================\n");
}

runTests().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
