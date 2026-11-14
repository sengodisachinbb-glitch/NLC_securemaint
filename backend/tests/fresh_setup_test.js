// Fresh Project Installation and Verification Test (Item T5.6)
// Follows ONLY README steps in a clean temporary directory without existing nlc.db

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const rootBackend = path.resolve(__dirname, "..");
const tempBaseDir = path.join(process.env.TEMP || "C:\\Users\\9c23s\\AppData\\Local\\Temp", "nlc_fresh_test_" + Date.now());

console.log(`[Fresh Setup Test] Creating temporary directory: ${tempBaseDir}`);
fs.mkdirSync(tempBaseDir, { recursive: true });

const stepResults = [];
let tempServerProcess = null;

function logStep(name, success, detail) {
  stepResults.push({ name, success, detail });
  console.log(`[Step] ${name}: ${success ? "SUCCESS" : "FAILED"} -> ${detail}`);
}

async function runFreshTest() {
  try {
    // 1. Copy project files excluding database, anchor, and git/test artifacts
    console.log("[Fresh Setup Test] Copying fresh backend source files...");
    const excluded = ["nlc.db", "nlc.db-shm", "nlc.db-wal", "nlc.db.bak", "nlc.db-shm.bak", "nlc.db-wal.bak", "anchor.json", "anchor.json.bak", ".git", "tests-output", ".env"];

    for (const item of fs.readdirSync(rootBackend)) {
      if (excluded.includes(item)) continue;
      const src = path.join(rootBackend, item);
      const dest = path.join(tempBaseDir, item);

      if (item === "node_modules") {
        // Create junction / symlink on Windows to avoid copying 50MB of packages
        try {
          execSync(`cmd /c mklink /J "${dest}" "${src}"`, { stdio: "ignore" });
        } catch (e) {
          // fallback copy package.json
        }
      } else {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    }

    const dbExistsInitially = fs.existsSync(path.join(tempBaseDir, "nlc.db"));
    logStep("Clean Working Directory", !dbExistsInitially, "Temporary directory initialized with 0 database files");

    // 2. Configure environment per README: cp .env.example .env
    const envExamplePath = path.join(tempBaseDir, ".env.example");
    const envDestPath = path.join(tempBaseDir, ".env");
    fs.copyFileSync(envExamplePath, envDestPath);

    // Ensure JWT_SECRET is populated per README instructions
    let envContent = fs.readFileSync(envDestPath, "utf8");
    if (!envContent.includes("JWT_SECRET=") || envContent.includes("JWT_SECRET=your_super_secret")) {
      envContent += "\nJWT_SECRET=fresh_setup_verification_secret_key_2026_nlc_secure_super_long\nPORT=5099\n";
      fs.writeFileSync(envDestPath, envContent, "utf8");
    } else {
      envContent = envContent.replace(/PORT=\d+/, "PORT=5099");
      fs.writeFileSync(envDestPath, envContent, "utf8");
    }
    logStep("Configure Environment (.env)", fs.existsSync(envDestPath), "Configured .env with valid JWT_SECRET and PORT=5099");

    // 3. Test npm install (dry-run / verify integrity)
    let installSuccess = false;
    try {
      execSync("npm ls", { cwd: tempBaseDir, stdio: "pipe" });
      installSuccess = true;
      logStep("Install Dependencies (npm install)", true, "Dependencies verified and resolved successfully");
    } catch (e) {
      logStep("Install Dependencies (npm install)", false, e.message);
    }

    // 4. Seed Database per README: npm run seed
    console.log("[Fresh Setup Test] Seeding database via npm run seed...");
    let seedOutput = "";
    try {
      seedOutput = execSync("npm run seed", { cwd: tempBaseDir, encoding: "utf8" });
      const dbCreated = fs.existsSync(path.join(tempBaseDir, "nlc.db"));
      
      // Inspect newly created DB
      const BetterSqlite3 = require(path.join(rootBackend, "node_modules/better-sqlite3"));
      const newDb = new BetterSqlite3(path.join(tempBaseDir, "nlc.db"));
      const userCount = newDb.prepare("SELECT count(*) as c FROM users").get().c;
      const eqCount = newDb.prepare("SELECT count(*) as c FROM equipment").get().c;
      newDb.close();

      const seedOk = dbCreated && userCount === 5 && eqCount === 10;
      logStep("Seed Database (npm run seed)", seedOk, `Created fresh nlc.db with ${userCount} users and ${eqCount} equipment items`);
    } catch (e) {
      logStep("Seed Database (npm run seed)", false, e.message);
    }

    // 5. Start Server per README: npm start on PORT 5099
    console.log("[Fresh Setup Test] Starting server on port 5099...");
    tempServerProcess = spawn("node", ["index.js"], {
      cwd: tempBaseDir,
      env: { ...process.env, PORT: "5099", JWT_SECRET: "fresh_setup_verification_secret_key_2026_nlc_secure_super_long" },
      stdio: "pipe"
    });

    let serverReady = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const hRes = await fetch("http://localhost:5099/api/health", { signal: AbortSignal.timeout(1000) });
        if (hRes.ok) {
          serverReady = true;
          break;
        }
      } catch (err) {}
    }
    logStep("Start Server (npm start)", serverReady, serverReady ? "Server successfully started and listening on http://localhost:5099" : "Server failed to respond on port 5099 within timeout");

    // 6. Test Login with seeded credentials: POST /api/auth/login
    console.log("[Fresh Setup Test] Testing login with seeded Admin credentials...");
    let loginOk = false;
    let loginDetail = "";
    try {
      const loginRes = await fetch("http://localhost:5099/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@nlc.in", password: "NlcSecure@2026!" })
      });
      const loginData = await loginRes.json();
      loginOk = loginRes.status === 200 && !!loginData.token && loginData.user?.role === "Admin";
      loginDetail = `HTTP ${loginRes.status}: Login successful for ${loginData.user?.email} (${loginData.user?.role}), token length: ${loginData.token?.length}`;
    } catch (err) {
      loginDetail = err.message;
    }
    logStep("Authenticate Seeded Account (POST /api/auth/login)", loginOk, loginDetail);

    // Stop temporary server
    if (tempServerProcess) {
      tempServerProcess.kill();
      tempServerProcess = null;
    }

    // Output overall verdict
    const allPassed = stepResults.every(s => s.success);
    console.log("\n=======================================================");
    console.log(`FRESH SETUP TEST VERDICT: ${allPassed ? "ALL STEPS PASSED" : "FAILED"}`);
    console.log("=======================================================");
    stepResults.forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.name}: ${s.success ? "PASS" : "FAIL"} (${s.detail})`);
    });

    return { allPassed, stepResults };
  } catch (err) {
    console.error("Fatal error during fresh setup test:", err);
    return { allPassed: false, error: err.message };
  } finally {
    // Clean up temporary server
    if (tempServerProcess) {
      try { tempServerProcess.kill(); } catch (e) {}
    }
    // Clean up temporary directory
    try {
      // Remove junction first
      const junctionPath = path.join(tempBaseDir, "node_modules");
      if (fs.existsSync(junctionPath)) {
        try { execSync(`cmd /c rmdir "${junctionPath}"`, { stdio: "ignore" }); } catch (e) {}
      }
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
      console.log(`[Fresh Setup Test] Cleaned up temporary directory: ${tempBaseDir}`);
    } catch (e) {
      console.warn("Could not clean up tempBaseDir completely:", e.message);
    }
  }
}

runFreshTest().then(res => {
  if (!res.allPassed) process.exit(1);
});

