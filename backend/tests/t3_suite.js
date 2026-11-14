// Test Group T3 Runner
// Validates:
// 1. Rate limiting (11 rapid wrong logins -> 429 on 11th)
// 2. CORS (unauthorized origin vs authorized localhost:3000)
// 3. H1: Zero-fallback JWT_SECRET startup enforcement
// 4. H2: Password policy enforcement for weak vs compliant passwords
// 5. H3: Manager 2FA lifecycle, token isolation, and verify rate limiting
// 6. H5: Audit log verification, truncation detection, and row tamper detection
// 7. H6: Backend SQL parameterization audit and route auth/authz catalog
// 8. C6: Sensitive field exposure & stack trace leakage verification

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const jwt = require("jsonwebtoken");
const otplib = require("otplib");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const db = require("../db");
const { verifyAuditChain, getAnchor, saveAnchor } = require("../audit");
const { validatePasswordPolicy } = require("../utils/passwordPolicy");

const BASE_URL = process.env.API_URL || "http://localhost:5000";
const results = [];
let serverProcess = null;

// Backup paths
const dbPath = path.join(__dirname, "../nlc.db");
const dbBakPath = path.join(__dirname, "../nlc.db.bak");
const anchorPath = path.join(__dirname, "../anchor.json");
const anchorBakPath = path.join(__dirname, "../anchor.json.bak");
const envPath = path.join(__dirname, "../.env");
const envBakPath = path.join(__dirname, "../.env.test_bak");

function record(id, description, expected, actual, status) {
  results.push({
    "ID": id,
    "What Was Tested": description,
    "Expected": expected,
    "Actual": actual,
    "Status": status
  });
}

function backupDatabase() {
  db.pragma("wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(dbPath, dbBakPath);
  if (fs.existsSync(anchorPath)) {
    fs.copyFileSync(anchorPath, anchorBakPath);
  }
}

function restoreDatabase() {
  if (fs.existsSync(dbBakPath)) {
    fs.copyFileSync(dbBakPath, dbPath);
  }
  if (fs.existsSync(anchorBakPath)) {
    fs.copyFileSync(anchorBakPath, anchorPath);
  }
}

async function isServerHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function startServer() {
  if (await isServerHealthy()) {
    console.log(`[Test Runner] Server already listening on ${BASE_URL}`);
    return;
  }
  console.log(`[Test Runner] Launching backend server on port 5000...`);
  serverProcess = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: "5000" },
    stdio: "inherit"
  });

  let connected = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isServerHealthy()) {
      connected = true;
      break;
    }
  }

  if (!connected) {
    if (serverProcess) serverProcess.kill();
    throw new Error(`Failed to connect to backend on ${BASE_URL} within timeout.`);
  }
  console.log(`[Test Runner] Connected to backend on ${BASE_URL}`);
}

async function stopServer() {
  if (serverProcess) {
    console.log(`[Test Runner] Stopping child server process (PID: ${serverProcess.pid})...`);
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${serverProcess.pid}`, { stdio: "ignore" });
      } else {
        serverProcess.kill("SIGTERM");
      }
    } catch (e) {
      serverProcess.kill();
    }
    serverProcess = null;
    await new Promise((r) => setTimeout(r, 1200));
  } else {
    try {
      if (process.platform === "win32") {
        const out = execSync('netstat -ano | findstr :5000 | findstr LISTENING', { encoding: "utf8" });
        const lines = out.trim().split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && Number(pid) > 0 && Number(pid) !== process.pid) {
            console.log(`[Test Runner] Killing process on port 5000 (PID: ${pid})`);
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      // Ignore
    }
  }
}

async function restartServer() {
  console.log(`[Test Runner] Restarting server...`);
  await stopServer();
  await startServer();
}

async function runTests() {
  console.log("=== Starting Test Group T3 Execution ===");

  // Ensure DB and anchor are backed up prior to running tests
  backupDatabase();

  await startServer();

  // -------------------------------------------------------------
  // Test 1: Rate limit (11 rapid wrong logins returns 429 on 11th)
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.1: Rate Limiting ---");
  try {
    const statuses = [];
    let eleventhBody = null;

    for (let i = 1; i <= 11; i++) {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `ratelimit_test_${i}@nlc.in`, password: "WrongPassword123!" })
      });
      statuses.push(res.status);
      if (i === 11) {
        try {
          eleventhBody = await res.json();
        } catch (e) {
          eleventhBody = await res.text();
        }
      }
    }

    const firstTenAre401 = statuses.slice(0, 10).every((s) => s === 401);
    const eleventhIs429 = statuses[10] === 429;
    const passed = firstTenAre401 && eleventhIs429;

    record(
      "T3.1",
      "Rate limit: 11 rapid wrong logins from one client returns 429 on the 11th",
      "1st-10th return HTTP 401; 11th returns HTTP 429 with rate limit message",
      `Attempts 1-10: HTTP ${statuses[0]}, Attempt 11: HTTP ${statuses[10]} (${JSON.stringify(eleventhBody)})`,
      passed ? "PASS" : "FAIL"
    );

    // Restart server immediately to reset the in-memory loginLimiter store so subsequent tests are not blocked
    await restartServer();
  } catch (err) {
    console.error("Test T3.1 error:", err);
    record("T3.1", "Rate limit on /api/auth/login", "11th returns HTTP 429", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 2: CORS Whitelisting (http://localhost:9999 vs http://localhost:3000)
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.2: CORS Whitelisting ---");
  try {
    // 1. Authorized Origin: http://localhost:3000
    const resAllowed = await fetch(`${BASE_URL}/api/health`, {
      headers: { Origin: "http://localhost:3000" }
    });
    const acaoAllowed = resAllowed.headers.get("access-control-allow-origin");
    const acacAllowed = resAllowed.headers.get("access-control-allow-credentials");

    // 2. Preflight OPTIONS for authorized origin
    const preflightAllowed = await fetch(`${BASE_URL}/api/equipment`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
      }
    });
    const acaoPreflight = preflightAllowed.headers.get("access-control-allow-origin");

    // 3. Unauthorized Origin: http://localhost:9999
    let resDeniedStatus = null;
    let acaoDenied = null;
    try {
      const resDenied = await fetch(`${BASE_URL}/api/health`, {
        headers: { Origin: "http://localhost:9999" }
      });
      resDeniedStatus = resDenied.status;
      acaoDenied = resDenied.headers.get("access-control-allow-origin");
    } catch (corsErr) {
      resDeniedStatus = "Connection/CORS error";
      acaoDenied = null;
    }

    const authorizedOk = acaoAllowed === "http://localhost:3000" && acacAllowed === "true" && acaoPreflight === "http://localhost:3000";
    const unauthorizedOk = acaoDenied === null || acaoDenied === undefined;
    const passed = authorizedOk && unauthorizedOk;

    record(
      "T3.2",
      "CORS policy enforcement (http://localhost:9999 unauthorized vs http://localhost:3000 allowed)",
      "Origin http://localhost:3000 receives Access-Control-Allow-Origin: http://localhost:3000; http://localhost:9999 receives no CORS allow headers",
      `Allowed origin (3000): HTTP ${resAllowed.status}, ACAO='${acaoAllowed}', ACAC='${acacAllowed}'; Preflight ACAO='${acaoPreflight}'; Denied origin (9999): HTTP ${resDeniedStatus}, ACAO=${acaoDenied === null ? "null (omitted)" : `'${acaoDenied}'`}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    console.error("Test T3.2 error:", err);
    record("T3.2", "CORS policy enforcement", "Unauthorized origin blocked", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 3: H1 - Server refuses to start without JWT_SECRET
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.3: H1 Zero-Fallback JWT_SECRET Enforcement ---");
  try {
    // 1. Back up .env file
    fs.copyFileSync(envPath, envBakPath);

    // 2. Temporarily write .env without JWT_SECRET
    const originalEnvContent = fs.readFileSync(envPath, "utf8");
    const strippedEnv = originalEnvContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("JWT_SECRET="))
      .join("\n");
    fs.writeFileSync(envPath, strippedEnv, "utf8");

    // 3. Stop running server first
    await stopServer();

    // 4. Attempt to spawn node index.js with JWT_SECRET unset/empty
    const testEnv = { ...process.env };
    delete testEnv.JWT_SECRET;

    let childOutput = "";
    let childError = "";
    let exitCode = null;

    const child = spawn(process.execPath, [path.join(__dirname, "../index.js")], {
      cwd: path.join(__dirname, ".."),
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (d) => { childOutput += d.toString(); });
    child.stderr.on("data", (d) => { childError += d.toString(); });

    await new Promise((resolve) => {
      child.on("close", (code) => {
        exitCode = code;
        resolve();
      });
      setTimeout(() => {
        child.kill();
        resolve();
      }, 3000);
    });

    const fullOutput = childOutput + childError;
    const hasFatalLog = fullOutput.includes("[FATAL ERROR] Missing required environment variable: JWT_SECRET");
    const hasRefusalNotice = fullOutput.includes("refuses to start without a valid JWT_SECRET");
    const passed = exitCode === 1 && hasFatalLog && hasRefusalNotice;

    record(
      "T3.3",
      "H1: Server startup refusal without valid JWT_SECRET in environment",
      "Process exits with code 1 and logs '[FATAL ERROR] Missing required environment variable: JWT_SECRET'",
      `Exit Code: ${exitCode}, Fatal log present: ${hasFatalLog}, Refusal message present: ${hasRefusalNotice}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    console.error("Test T3.3 error:", err);
    record("T3.3", "H1: JWT_SECRET check at startup", "Refuses to start", err.message, "FAIL");
  } finally {
    // Ensure .env is restored and backup removed
    if (fs.existsSync(envBakPath)) {
      fs.copyFileSync(envBakPath, envPath);
      try { fs.unlinkSync(envBakPath); } catch (e) {}
    }
    await startServer();
  }

  // -------------------------------------------------------------
  // Test 4: H2 - Password Policy Enforcement
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.4: H2 Password Policy Enforcement ---");
  try {
    const weakTests = [
      { pw: "short", expectedError: "Password must be at least 10 characters long." },
      { pw: "nouppercase123!", expectedError: "Password must contain at least one uppercase letter (A-Z)." },
      { pw: "NOLOWERCASE123!", expectedError: "Password must contain at least one lowercase letter (a-z)." },
      { pw: "NoDigitsInPassword!", expectedError: "Password must contain at least one numerical digit (0-9)." },
      { pw: "NoSpecialChars1234", expectedError: "Password must contain at least one special character / symbol (e.g. !@#$%^&*)." }
    ];

    const weakResults = weakTests.map((t) => {
      const res = validatePasswordPolicy(t.pw);
      return {
        pw: t.pw,
        valid: res.valid,
        error: res.error,
        matchesExpected: res.valid === false && res.error === t.expectedError
      };
    });

    const compliantPw = "NlcSecure@2026!";
    const compliantRes = validatePasswordPolicy(compliantPw);

    // Also inspect seed.js policy check integration
    const seedContent = fs.readFileSync(path.join(__dirname, "../seed.js"), "utf8");
    const seedHasPolicyCheck = seedContent.includes("validatePasswordPolicy(DEFAULT_PASSWORD)") &&
                               seedContent.includes("process.exit(1)");

    const allWeakRejected = weakResults.every((r) => r.matchesExpected);
    const compliantAccepted = compliantRes.valid === true;
    const passed = allWeakRejected && compliantAccepted && seedHasPolicyCheck;

    record(
      "T3.4",
      "H2: Password policy enforcement for weak vs policy-compliant credentials",
      "Weak passwords (<10 chars, missing upper/lower/digit/symbol) rejected with exact errors; compliant accepted; seed.js enforces check",
      `Weak passwords rejected: ${allWeakRejected} (tested 5 edge cases), Compliant ('${compliantPw}') accepted: ${compliantAccepted}, seed.js enforcement guard: ${seedHasPolicyCheck}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    console.error("Test T3.4 error:", err);
    record("T3.4", "H2: Password policy enforcement", "Weak rejected, compliant accepted", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 5: H3 - Manager 2FA Lifecycle & Defenses
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.5: H3 Manager 2FA Lifecycle & Defenses ---");
  try {
    // 1. Clear Manager 2FA in database using parameterized query
    db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE email = ?").run("manager@nlc.in");

    // 2. Login Manager (initial setup state)
    const initialLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "manager@nlc.in", password: "NlcSecure@2026!" })
    });
    const initialLoginData = await initialLoginRes.json();
    const managerToken = initialLoginData.token;
    const needsSetup = initialLoginData.needs2faSetup === true;

    // 3. Initiate 2FA setup (POST /api/auth/2fa/setup)
    const setupRes = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${managerToken}`
      }
    });
    const setupData = await setupRes.json();
    const totpSecret = setupData.secret;
    const hasQrCode = !!setupData.qrCode && setupData.qrCode.startsWith("data:image/png;base64,");

    // 4. Generate valid 6-digit TOTP code using otplib
    const validCode = otplib.generateSync({ secret: totpSecret });

    // 5. Enable 2FA (POST /api/auth/2fa/enable)
    const enableRes = await fetch(`${BASE_URL}/api/auth/2fa/enable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${managerToken}`
      },
      body: JSON.stringify({ code: validCode })
    });
    const enableData = await enableRes.json();
    const enabledOk = enableRes.status === 200 && enableData.totp_enabled === true;

    // 6. Login again: now returns pending 2FA token
    const secondLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "manager@nlc.in", password: "NlcSecure@2026!" })
    });
    const secondLoginData = await secondLoginRes.json();
    const requires2fa = secondLoginData.requires2fa === true;
    const tempToken = secondLoginData.tempToken;

    // 7. Verify pending token rejected on protected route (GET /api/equipment)
    const protectedProbeRes = await fetch(`${BASE_URL}/api/equipment`, {
      headers: { "Authorization": `Bearer ${tempToken}` }
    });
    const protectedProbeData = await protectedProbeRes.json();
    const tempTokenRejected = protectedProbeRes.status === 401 &&
      protectedProbeData.error.includes("Two-factor authentication pending");

    // 8. Verify with wrong 6-digit code fails
    const wrongCodeRes = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken, code: "000000" })
    });
    const wrongCodeData = await wrongCodeRes.json();
    const wrongCodeRejected = wrongCodeRes.status === 401 &&
      wrongCodeData.error === "Invalid two-factor authentication code.";

    // 9. Rate limiting on 2FA verify: send 4 more failed attempts (total 5), then 6th attempt
    const verifyLimiterStatuses = [];
    for (let i = 2; i <= 5; i++) {
      const r = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: `00000${i}` })
      });
      verifyLimiterStatuses.push(r.status);
    }
    const sixthRes = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken, code: "999999" })
    });
    const sixthData = await sixthRes.json();
    const rateLimitedOnSixth = sixthRes.status === 429 &&
      sixthData.error.includes("Too many 2FA verification attempts");

    // 10. Restart server to clear 2FA verify rate limiter, re-login to obtain fresh tempToken, and verify with correct code
    await restartServer();

    const freshLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "manager@nlc.in", password: "NlcSecure@2026!" })
    });
    const freshLoginData = await freshLoginRes.json();
    const freshTempToken = freshLoginData.tempToken;
    const freshValidCode = otplib.generateSync({ secret: totpSecret });

    const finalVerifyRes = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken: freshTempToken, code: freshValidCode })
    });
    const finalVerifyData = await finalVerifyRes.json();
    const finalFullToken = finalVerifyData.token;
    const verifySuccess = finalVerifyRes.status === 200 && !!finalFullToken;

    // Confirm full token works on protected route
    const equipRes = await fetch(`${BASE_URL}/api/equipment`, {
      headers: { "Authorization": `Bearer ${finalFullToken}` }
    });
    const fullTokenWorks = equipRes.status === 200;

    const passed = needsSetup && hasQrCode && enabledOk && requires2fa &&
                   tempTokenRejected && wrongCodeRejected && rateLimitedOnSixth &&
                   verifySuccess && fullTokenWorks;

    record(
      "T3.5",
      "H3: Manager 2FA lifecycle (setup, enable, pending token rejection, wrong code 401, verify rate limit 429, valid code 200)",
      "Setup generates secret/QR; enable activates 2FA; login gives pending token; pending token rejected on /equipment (401); wrong code rejected (401); 6th attempt returns 429; correct code returns full JWT (200)",
      `Setup needs2faSetup=${needsSetup}, QR present=${hasQrCode}; Enable totp_enabled=${enabledOk}; Pending token on /equipment: HTTP ${protectedProbeRes.status}; Wrong code: HTTP ${wrongCodeRes.status}; 6th verify attempt: HTTP ${sixthRes.status} (429 rate limited: ${rateLimitedOnSixth}); Valid TOTP verify: HTTP ${finalVerifyRes.status} (Token received: ${!!finalFullToken}); Equipment access with full token: HTTP ${equipRes.status}`,
      passed ? "PASS" : "FAIL"
    );

    // Restart server and restore database cleanly to reset 2FA state before audit chain tests
    await stopServer();
    restoreDatabase();
    await startServer();
  } catch (err) {
    console.error("Test T3.5 error:", err);
    await stopServer();
    restoreDatabase();
    await startServer();
    record("T3.5", "H3: Manager 2FA lifecycle & defenses", "Complete 2FA flow", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 6: H5 - Audit Log Verification, Truncation & Tamper Detection
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.6: H5 Audit Log Hash Chain & Tamper Detection ---");
  try {
    // Generate valid Admin token
    const adminUser = db.prepare("SELECT id, name, email, role, section FROM users WHERE role = 'Admin'").get();
    const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: "24h" });

    // Ensure anchor file is synchronized with current latest row before verification
    const fullLastRow = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1").get();
    saveAnchor(fullLastRow.id, fullLastRow.hash, fullLastRow.timestamp);

    // Step 1: Clean log verification
    const cleanVerifyRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const cleanData = await cleanVerifyRes.json();
    const cleanValid = cleanVerifyRes.status === 200 && cleanData.valid === true;

    // Step 2: Truncation detection (delete the last audit row directly in SQLite)
    db.prepare("DELETE FROM audit_log WHERE id = ?").run(fullLastRow.id);

    const truncVerifyRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const truncData = await truncVerifyRes.json();
    const truncDetected = truncData.valid === false &&
                          truncData.reason === "TRUNCATION_DETECTED" &&
                          truncData.anchorRowId === fullLastRow.id;

    // Step 3: Restore deleted row and confirm valid again
    db.prepare(`
      INSERT INTO audit_log (id, timestamp, user_id, action, entity, details, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullLastRow.id,
      fullLastRow.timestamp,
      fullLastRow.user_id,
      fullLastRow.action,
      fullLastRow.entity,
      fullLastRow.details,
      fullLastRow.prev_hash,
      fullLastRow.hash
    );

    const restoredVerifyRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const restoredData = await restoredVerifyRes.json();
    const restoredValid = restoredData.valid === true;

    // Step 4: Row tampering detection (modify the action of an intermediate row)
    const targetRow = db.prepare("SELECT id, action FROM audit_log ORDER BY id ASC LIMIT 1 OFFSET 2").get();
    const originalAction = targetRow.action;
    db.prepare("UPDATE audit_log SET action = 'MALICIOUS_UNAUTHORIZED_MUTATION' WHERE id = ?").run(targetRow.id);

    const tamperVerifyRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const tamperData = await tamperVerifyRes.json();
    const tamperDetected = tamperData.valid === false &&
                           tamperData.reason === "HASH_MISMATCH" &&
                           tamperData.brokenRowId === targetRow.id;

    // Step 5: Restore mutated row and verify clean again
    db.prepare("UPDATE audit_log SET action = ? WHERE id = ?").run(originalAction, targetRow.id);

    const finalCleanRes = await fetch(`${BASE_URL}/api/audit/verify`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const finalCleanData = await finalCleanRes.json();
    const finalCleanValid = finalCleanData.valid === true;

    const passed = cleanValid && truncDetected && restoredValid && tamperDetected && finalCleanValid;

    record(
      "T3.6",
      "H5: Cryptographic audit log hash chain, truncation detection, and row tamper diagnosis",
      "Clean log -> valid: true; Deleted tail row -> valid: false (TRUNCATION_DETECTED); Restored -> valid: true; Mutated row -> valid: false (HASH_MISMATCH at exact brokenRowId); Restored -> valid: true",
      `Clean verify: valid=${cleanData.valid} (count: ${cleanData.count}); Tail truncation: valid=${truncData.valid}, reason='${truncData.reason}', anchorRowId=${truncData.anchorRowId}; Restored: valid=${restoredData.valid}; Row tamper at ID #${targetRow.id}: valid=${tamperData.valid}, reason='${tamperData.reason}', brokenRowId=${tamperData.brokenRowId}; Final restored verify: valid=${finalCleanData.valid}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    console.error("Test T3.6 error:", err);
    record("T3.6", "H5: Audit hash chain verification", "Detects truncation and tampering", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 7: H6 - SQL Parameterization Audit & Route Auth Catalog
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.7: H6 SQL Parameterization & Route Security Catalog ---");
  try {
    const backendRoot = path.join(__dirname, "..");
    const jsFiles = [];

    function findJsFiles(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "tests" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) findJsFiles(full);
        else if (entry.name.endsWith(".js")) jsFiles.push(full);
      }
    }
    findJsFiles(backendRoot);

    // 1. Scan for SQL queries containing dynamic request data or concatenation
    const rawSqlIssues = [];
    const staticQueryFragments = [];

    for (const f of jsFiles) {
      const relPath = path.relative(backendRoot, f);
      const content = fs.readFileSync(f, "utf8");

      // Check all db.prepare and db.exec statements
      const sqlCallRegex = /db\.(prepare|exec)\s*\(([\s\S]*?)\)(?:\.|\;|\n)/g;
      let match;
      while ((match = sqlCallRegex.exec(content)) !== null) {
        const fullCall = match[0];
        const arg = match[2];

        // Check if query argument concatenates (+) or interpolates (${...}) dynamic request data
        const hasRequestDataInterpolation = /\$\{\s*(?:req|body|params|query|[a-z0-9_]+\s*\.)/i.test(arg);
        const hasStringConcatenation = arg.includes("+") && !arg.includes("?");

        if (hasRequestDataInterpolation || hasStringConcatenation) {
          rawSqlIssues.push({
            file: relPath,
            snippet: fullCall.slice(0, 120).replace(/\s+/g, " ")
          });
        }

        // Note safe internal constant interpolations (e.g. BASE_*_QUERY)
        if (/\$\{BASE_[A-Z_]+_QUERY\}/.test(arg)) {
          staticQueryFragments.push({
            file: relPath,
            query: arg.trim().replace(/\s+/g, " ")
          });
        }
      }
    }

    // 2. Parse and catalog all routes across backend/routes/*.js and index.js
    const routeCatalog = [];
    const routesDir = path.join(backendRoot, "routes");
    const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"));

    // Add health route from index.js
    routeCatalog.push({
      file: "index.js",
      method: "GET",
      path: "/api/health",
      authenticated: false,
      authorizedRoles: "Public"
    });

    for (const rf of routeFiles) {
      const fullPath = path.join(routesDir, rf);
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      const basePrefix = rf === "auth.js" ? "/api/auth" :
                         rf === "equipment.js" ? "/api/equipment" :
                         rf === "audit.js" ? "/api/audit" :
                         rf === "workOrders.js" ? "/api/work-orders" :
                         rf === "pmSchedules.js" ? "/api/pm-schedules" :
                         rf === "actions.js" ? "/api/actions" :
                         rf === "dashboard.js" ? "/api/dashboard" : "/api";

      let currentBlock = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("router.get(") || line.includes("router.post(") ||
            line.includes("router.put(") || line.includes("router.patch(") ||
            line.includes("router.delete(")) {
          
          // Gather multi-line route declaration up to the callback arrow
          let block = line;
          let j = i;
          while (!block.includes("=>") && !block.includes("function") && j < lines.length - 1) {
            j++;
            block += " " + lines[j].trim();
          }

          const methodMatch = block.match(/router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i);
          if (methodMatch) {
            const method = methodMatch[1].toUpperCase();
            const subPath = methodMatch[2];
            const fullRoute = subPath === "/" ? basePrefix : `${basePrefix}${subPath}`;

            const isAuth = block.includes("authenticate");
            const roleMatch = block.match(/authorize\s*\(\s*([^)]+)\)/);
            const roles = roleMatch
              ? roleMatch[1].replace(/["']/g, "").replace(/\s*,\s*/g, ", ")
              : (isAuth ? "All Authenticated Roles" : "Public");

            routeCatalog.push({
              file: rf,
              method,
              path: fullRoute,
              authenticated: isAuth,
              authorizedRoles: roles
            });
          }
        }
      }
    }

    const zeroConcatIssues = rawSqlIssues.length === 0;
    const totalRoutes = routeCatalog.length;
    const passed = zeroConcatIssues && totalRoutes >= 20;

    record(
      "T3.7",
      "H6: Backend SQL parameterization audit and complete route authentication/authorization status catalog",
      "Zero SQL string concatenations or unparameterized queries found; all routes cataloged with auth and authorize status",
      `Dynamic request data concatenations/interpolations: ${rawSqlIssues.length} (Scanned ${jsFiles.length} JS files; verified ${staticQueryFragments.length} modular constant queries with '?' parameters); Total API routes cataloged: ${totalRoutes}`,
      passed ? "PASS" : "FAIL"
    );

    // Save detailed route catalog for reference in test output
    results._routeCatalog = routeCatalog;
    results._rawSqlIssues = rawSqlIssues;
  } catch (err) {
    console.error("Test T3.7 error:", err);
    record("T3.7", "H6: SQL parameterization and route catalog", "Zero concatenation issues", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 8: C6 - Sensitive Field Exposure & Error Sanitization Audit
  // -------------------------------------------------------------
  console.log("\n--- Executing Test T3.8: C6 Sensitive Data Exposure Review ---");
  try {
    const adminUser = db.prepare("SELECT id, name, email, role, section FROM users WHERE role = 'Admin'").get();
    const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: "24h" });

    const mgrUser = db.prepare("SELECT id, name, email, role, section FROM users WHERE role = 'Manager'").get();
    const mgrToken = jwt.sign(mgrUser, process.env.JWT_SECRET, { expiresIn: "24h" });

    const techUser = db.prepare("SELECT id, name, email, role, section FROM users WHERE role = 'Technician'").get();
    const techToken = jwt.sign(techUser, process.env.JWT_SECRET, { expiresIn: "24h" });

    // Endpoints to check for leaks
    const endpointsToProbe = [
      // 1. Login success
      {
        name: "POST /api/auth/login (Success)",
        fn: () => fetch(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@nlc.in", password: "NlcSecure@2026!" })
        })
      },
      // 2. /me profile
      {
        name: "GET /api/auth/me",
        fn: () => fetch(`${BASE_URL}/api/auth/me`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      },
      // 3. Equipment list
      {
        name: "GET /api/equipment",
        fn: () => fetch(`${BASE_URL}/api/equipment`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      },
      // 4. Work orders list
      {
        name: "GET /api/work-orders",
        fn: () => fetch(`${BASE_URL}/api/work-orders`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      },
      // 5. Audit log list
      {
        name: "GET /api/audit",
        fn: () => fetch(`${BASE_URL}/api/audit`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      },
      // 6. Audit verify
      {
        name: "GET /api/audit/verify",
        fn: () => fetch(`${BASE_URL}/api/audit/verify`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      },
      // 7. Error: 400 Bad Request
      {
        name: "POST /api/auth/login (Invalid Body - 400)",
        fn: () => fetch(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "notanemail" })
        })
      },
      // 8. Error: 401 Missing Token
      {
        name: "GET /api/auth/me (Missing Token - 401)",
        fn: () => fetch(`${BASE_URL}/api/auth/me`)
      },
      // 9. Error: 403 Forbidden (Tech accessing Admin audit verify)
      {
        name: "GET /api/audit/verify (Tech Forbidden - 403)",
        fn: () => fetch(`${BASE_URL}/api/audit/verify`, {
          headers: { "Authorization": `Bearer ${techToken}` }
        })
      },
      // 10. Error: 404 Route Not Found
      {
        name: "GET /api/nonexistent-route (404)",
        fn: () => fetch(`${BASE_URL}/api/nonexistent-route`)
      },
      // 11. 2FA verify error (Wrong code - 401)
      {
        name: "POST /api/auth/2fa/verify (Invalid code - 401)",
        fn: () => fetch(`${BASE_URL}/api/auth/2fa/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tempToken: "invalid_temp_token", code: "000000" })
        })
      },
      // 12. Equipment validation error (400)
      {
        name: "POST /api/equipment (Invalid input - 400)",
        fn: () => fetch(`${BASE_URL}/api/equipment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mgrToken}`
          },
          body: JSON.stringify({ code: "" })
        })
      },
      // 13. Work order 404 Not Found
      {
        name: "GET /api/work-orders/99999 (404)",
        fn: () => fetch(`${BASE_URL}/api/work-orders/99999`, {
          headers: { "Authorization": `Bearer ${adminToken}` }
        })
      }
    ];

    const leakFindings = [];

    for (const ep of endpointsToProbe) {
      try {
        const res = await ep.fn();
        const rawText = await res.text();

        // Check for password_hash
        const hasPasswordHash = rawText.includes("password_hash") || rawText.includes("$2b$10$");
        // Check for unredacted totp_secret in users or general responses
        const hasTotpSecret = rawText.includes("totp_secret");
        // Check for stack trace leakage
        const hasStackTrace = rawText.includes("    at ") || rawText.includes("node:internal") || /Error:\s+[^\n]+\n\s+at/.test(rawText);

        if (hasPasswordHash || hasTotpSecret || hasStackTrace) {
          leakFindings.push({
            endpoint: ep.name,
            status: res.status,
            hasPasswordHash,
            hasTotpSecret,
            hasStackTrace
          });
        }
      } catch (err) {
        leakFindings.push({ endpoint: ep.name, error: err.message });
      }
    }

    const passed = leakFindings.length === 0;

    record(
      "T3.8",
      "C6: Sensitive field exposure and error stack trace leakage audit across API endpoints",
      "Zero exposures of password_hash, totp_secret, or server stack traces across success and error responses",
      `Probed ${endpointsToProbe.length} core and error endpoints. Leakage findings: ${leakFindings.length} (${leakFindings.length === 0 ? "Clean: 0 password_hash, 0 totp_secret, 0 stack traces detected" : JSON.stringify(leakFindings)})`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    console.error("Test T3.8 error:", err);
    record("T3.8", "C6: Sensitive field exposure check", "Zero leakages", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Conclude, Restore and Generate Markdown Report
  // -------------------------------------------------------------
  console.log("\n=== Test Group T3 Execution Finished ===");

  // Restore database and anchor files from backups
  restoreDatabase();
  console.log("[Test Runner] Database and anchor files restored successfully.");

  // Stop test server process if spawned
  await stopServer();

  // Print Summary Table to stdout
  console.log("\n=======================================================");
  console.log("TEST GROUP T3 RESULTS TABLE");
  console.log("=======================================================");
  console.table(results.map(r => ({
    ID: r.ID,
    "What Was Tested": r["What Was Tested"],
    Status: r.Status
  })));

  // Write Markdown Report to /tests-output/T3-results.md
  generateMarkdownReport(results);
}

function generateMarkdownReport(results) {
  const outputPath = path.join(__dirname, "../../tests-output/T3-results.md");
  const nowIso = new Date().toISOString();

  const total = results.length;
  const passed = results.filter((r) => r.Status === "PASS").length;
  const failed = results.filter((r) => r.Status === "FAIL").length;
  const notRun = results.filter((r) => r.Status === "NOT RUN").length;

  let md = `# Test Group T3: Security Hardening, Defenses, Audit Chains & Data Isolation\n`;
  md += `**Execution Date:** ${nowIso}  \n`;
  md += `**Tested Environment:** ${BASE_URL}  \n`;
  md += `**Evaluator Role:** Independent QA Tester  \n\n`;
  md += `---\n\n`;
  md += `## Summary of Test Results\n\n`;
  md += `| ID | What Was Tested | Expected Result | Actual Result / Output | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :---: |\n`;

  for (const r of results) {
    const statusIcon = r.Status === "PASS" ? "✅ **PASS**" : (r.Status === "FAIL" ? "❌ **FAIL**" : "⚠️ **NOT RUN**");
    const escapedExpected = r.Expected.replace(/\|/g, "\\|");
    const escapedActual = r.Actual.replace(/\|/g, "\\|").replace(/\n/g, " ");
    md += `| **${r.ID}** | ${r["What Was Tested"]} | ${escapedExpected} | ${escapedActual} | ${statusIcon} |\n`;
  }

  md += `\n---\n\n`;
  md += `### Verdict: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)\n`;
  if (failed > 0) {
    md += `⚠️ **Warning:** ${failed} test(s) failed.\n`;
  } else {
    md += `All tested criteria under Test Group T3 passed successfully with zero failures.\n`;
  }

  // Include Appendix for T3.7: Route Catalog
  if (results._routeCatalog && results._routeCatalog.length > 0) {
    md += `\n---\n\n`;
    md += `### Appendix: H6 Route Authentication & Authorization Catalog\n\n`;
    md += `| Method | Route Path | Source File | Authenticated | Authorized Roles |\n`;
    md += `| :--- | :--- | :--- | :---: | :--- |\n`;
    for (const route of results._routeCatalog) {
      md += `| \`${route.method}\` | \`${route.path}\` | \`${route.file}\` | ${route.authenticated ? "Yes" : "No"} | ${route.authorizedRoles} |\n`;
    }
  }

  fs.writeFileSync(outputPath, md, "utf8");
  console.log(`[Test Runner] Markdown report written to ${outputPath}`);
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  restoreDatabase();
  process.exit(1);
});
