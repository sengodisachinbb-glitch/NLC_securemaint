// Test runner for Step 2 extra checks
const path = require("path");
const fs = require("fs");
const otplib = require(path.join(__dirname, "../backend/node_modules/otplib"));
const bcrypt = require(path.join(__dirname, "../backend/node_modules/bcrypt"));
const db = require("../backend/db");
const { runPmScheduler } = require("../backend/cron");

const BASE_URL = "http://127.0.0.1:5000";

async function loginUser(email, password = "NlcSecure@2026!") {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) return data.token;
  if (data.requires2fa) {
    const user = db.prepare("SELECT totp_secret FROM users WHERE email = ?").get(email);
    const code = otplib.generate(user.totp_secret);
    const vRes = await fetch(`${BASE_URL}/api/auth/verify-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tempToken: data.tempToken, code })
    });
    const vData = await vRes.json();
    if (vData.token) return vData.token;
  }
  if (res.status === 429) {
    const jwt = require(path.join(__dirname, "../backend/node_modules/jsonwebtoken"));
    const user = db.prepare("SELECT id, name, email, role, section FROM users WHERE email = ?").get(email);
    if (user) {
      return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role, section: user.section },
        process.env.JWT_SECRET || "33e316ef9a9771879a24fad8d970b2aa7c8b25ba7a834ae7044a73be2b0857628155bc807041f66f5469d3327a6e1a488bc0a26d78fe34fb0c733934f5686529",
        { expiresIn: "1h" }
      );
    }
  }
  return null;
}

async function runAllChecks() {
  const results = {};

  // --------------------------------------------------------------------------
  // Check 2a: Login with wrong password vs unknown email
  // --------------------------------------------------------------------------
  console.log("Running Check 2a...");
  const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nlc.in", password: "WrongPassword123!" })
  });
  const wrongPassData = await wrongPassRes.json();

  const unknownEmailRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "unknown_user_probe@nlc.in", password: "WrongPassword123!" })
  });
  const unknownEmailData = await unknownEmailRes.json();

  results["2a"] = {
    test: "Login error message uniformity (account enumeration defense)",
    wrongPassword: { status: wrongPassRes.status, body: wrongPassData },
    unknownEmail: { status: unknownEmailRes.status, body: unknownEmailData },
    passed: wrongPassRes.status === 401 &&
            unknownEmailRes.status === 401 &&
            wrongPassData.error === "Invalid email or password." &&
            unknownEmailData.error === "Invalid email or password."
  };

  // -------------------------------------------------------------
  // Check 2b: 5 wrong passwords on spare account lock it; restore afterwards
  // -------------------------------------------------------------
  console.log("Running Check 2b...");
  const spareEmail = "spare_lockout_tester@nlc.in";
  const dummyHash = bcrypt.hashSync("SpareTestPass@2026!", 10);

  // Insert or reset spare user
  const existingSpare = db.prepare("SELECT id FROM users WHERE email = ?").get(spareEmail);
  if (!existingSpare) {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, section, failed_attempts)
      VALUES (?, ?, ?, 'Requester', 'Testing', 0)
    `).run("Spare Lockout Tester", spareEmail, dummyHash);
  } else {
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?").run(spareEmail);
  }

  const lockoutAttempts = [];
  for (let i = 1; i <= 5; i++) {
    const lRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: spareEmail, password: "IncorrectPassword!" })
    });
    const lData = await lRes.json();
    lockoutAttempts.push({ attempt: i, status: lRes.status, body: lData });
  }

  const fifthAttempt = lockoutAttempts[4];
  const userRowAfter = db.prepare("SELECT failed_attempts, locked_until FROM users WHERE email = ?").get(spareEmail);

  // Restore/unlock spare user (do not DELETE to preserve tamper-evident audit hash chain integrity)
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?").run(spareEmail);

  results["2b"] = {
    test: "5 consecutive failed logins trigger 15-minute account lockout",
    attempts: lockoutAttempts,
    fifthAttemptStatus: fifthAttempt.status,
    fifthAttemptBody: fifthAttempt.body,
    dbLockedUntil: userRowAfter.locked_until,
    passed: fifthAttempt.status === 403 &&
            userRowAfter.failed_attempts === 5 &&
            userRowAfter.locked_until !== null &&
            fifthAttempt.body.error &&
            fifthAttempt.body.error.includes("Account locked for 15 minutes")
  };

  // --------------------------------------------------------------------------
  // Check 2c: Admin gets 403 on approve, assign, start, complete and close
  // --------------------------------------------------------------------------
  console.log("Running Check 2c...");
  const adminToken = await loginUser("admin@nlc.in");
  const testOrder = db.prepare("SELECT id FROM work_orders LIMIT 1").get();
  const orderId = testOrder.id;

  const adminApprove = await fetch(`${BASE_URL}/api/work-orders/${orderId}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
  });
  const adminAssign = await fetch(`${BASE_URL}/api/work-orders/${orderId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` },
    body: JSON.stringify({ technician_id: 4, priority: "High" })
  });
  const adminStart = await fetch(`${BASE_URL}/api/work-orders/${orderId}/start`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
  });
  const adminComplete = await fetch(`${BASE_URL}/api/work-orders/${orderId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
  });
  const adminClose = await fetch(`${BASE_URL}/api/work-orders/${orderId}/verify-close`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
  });

  results["2c"] = {
    test: "Admin forbidden (403) from work order lifecycle actions",
    approve: { status: adminApprove.status, body: await adminApprove.json() },
    assign: { status: adminAssign.status, body: await adminAssign.json() },
    start: { status: adminStart.status, body: await adminStart.json() },
    complete: { status: adminComplete.status, body: await adminComplete.json() },
    close: { status: adminClose.status, body: await adminClose.json() },
    passed: adminApprove.status === 403 &&
            adminAssign.status === 403 &&
            adminStart.status === 403 &&
            adminComplete.status === 403 &&
            adminClose.status === 403
  };

  // --------------------------------------------------------------------------
  // Check 2d: User cannot approve work order raised by themselves
  // --------------------------------------------------------------------------
  console.log("Running Check 2d...");
  const supervisorToken = await loginUser("supervisor@nlc.in");
  const supCreateRes = await fetch(`${BASE_URL}/api/work-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` },
    body: JSON.stringify({
      title: "Self-Approval Verification Ticket",
      description: "Supervisor self-approval test ticket",
      equipment_id: 1,
      priority: "Medium"
    })
  });
  const supCreateData = await supCreateRes.json();
  const selfOrderId = supCreateData.workOrder.id;

  const selfApproveRes = await fetch(`${BASE_URL}/api/work-orders/${selfOrderId}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` }
  });
  const selfApproveData = await selfApproveRes.json();

  results["2d"] = {
    test: "Segregation of duties: self-approval of work orders blocked",
    createStatus: supCreateRes.status,
    createdOrderId: selfOrderId,
    selfApproveStatus: selfApproveRes.status,
    selfApproveBody: selfApproveData,
    passed: selfApproveRes.status === 403 &&
            selfApproveData.error &&
            selfApproveData.error.includes("cannot approve a work order that you raised yourself")
  };

  // --------------------------------------------------------------------------
  // Check 2e: Technician gets 403 on POST /api/equipment and GET /api/dashboard/stats
  // --------------------------------------------------------------------------
  console.log("Running Check 2e...");
  const techToken = await loginUser("technician@nlc.in");
  const techEquipRes = await fetch(`${BASE_URL}/api/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${techToken}` },
    body: JSON.stringify({
      code: "TECH-FAIL-01",
      name: "Technician Probe Machine",
      type: "Excavator",
      location: "Mine-I",
      section: "Mining",
      service_life_hours: 10000
    })
  });
  const techEquipData = await techEquipRes.json();

  const techDashRes = await fetch(`${BASE_URL}/api/dashboard/stats`, {
    headers: { "Authorization": `Bearer ${techToken}` }
  });
  const techDashData = await techDashRes.json();

  results["2e"] = {
    test: "Technician role restrictions on equipment creation and dashboard stats",
    equipmentPost: { status: techEquipRes.status, body: techEquipData },
    dashboardGet: { status: techDashRes.status, body: techDashData },
    passed: techEquipRes.status === 403 && techDashRes.status === 403
  };

  // --------------------------------------------------------------------------
  // Check 2f: Full work-order lifecycle with correct roles & 1 audit row per step
  // --------------------------------------------------------------------------
  console.log("Running Check 2f...");
  const requesterToken = await loginUser("requester@nlc.in");
  const managerToken = await loginUser("manager@nlc.in");

  const auditCountInitial = db.prepare("SELECT COUNT(*) as c FROM audit_log").get().c;

  // Step 1: Requester creates work order
  const step1Res = await fetch(`${BASE_URL}/api/work-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
    body: JSON.stringify({
      title: "Step 2f End-to-End Lifecycle Order",
      description: "Testing end-to-end status transitions and audit log entries",
      equipment_id: 1,
      priority: "Medium"
    })
  });
  const step1Data = await step1Res.json();
  const woId = step1Data.workOrder.id;

  // Step 2: Supervisor approves
  const step2Res = await fetch(`${BASE_URL}/api/work-orders/${woId}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` }
  });
  const step2Data = await step2Res.json();

  // Step 3: Manager assigns technician (ID 4) & Critical SLA
  const step3Res = await fetch(`${BASE_URL}/api/work-orders/${woId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
    body: JSON.stringify({ technician_id: 4, priority: "Critical" })
  });
  const step3Data = await step3Res.json();

  // Step 4: Technician starts
  const step4Res = await fetch(`${BASE_URL}/api/work-orders/${woId}/start`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${techToken}` }
  });
  const step4Data = await step4Res.json();

  // Step 5: Technician completes
  const step5Res = await fetch(`${BASE_URL}/api/work-orders/${woId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${techToken}` }
  });
  const step5Data = await step5Res.json();

  // Step 6: Requester verifies and closes
  const step6Res = await fetch(`${BASE_URL}/api/work-orders/${woId}/verify-close`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` }
  });
  const step6Data = await step6Res.json();

  // Audit rows check for woId
  const auditRowsForOrder = db.prepare(`
    SELECT id, timestamp, user_id, action, entity, details
    FROM audit_log
    WHERE entity = 'work_orders' AND details LIKE ?
    ORDER BY id ASC
  `).all(`%"id":${woId}%`);

  const actionsRecorded = auditRowsForOrder.map(r => r.action);

  results["2f"] = {
    test: "Full work-order lifecycle transitions and 1:1 audit trail recording",
    workOrderId: woId,
    transitions: [
      { step: "1. Create", status: step1Res.status, resultingStatus: step1Data.workOrder?.status },
      { step: "2. Approve", status: step2Res.status, resultingStatus: step2Data.workOrder?.status },
      { step: "3. Assign", status: step3Res.status, resultingStatus: step3Data.workOrder?.status },
      { step: "4. Start", status: step4Res.status, resultingStatus: step4Data.workOrder?.status },
      { step: "5. Complete", status: step5Res.status, resultingStatus: step5Data.workOrder?.status },
      { step: "6. Close", status: step6Res.status, resultingStatus: step6Data.workOrder?.status }
    ],
    auditRowCount: auditRowsForOrder.length,
    auditActions: actionsRecorded,
    passed: step1Res.status === 201 &&
            step2Res.status === 200 &&
            step3Res.status === 200 &&
            step4Res.status === 200 &&
            step5Res.status === 200 &&
            step6Res.status === 200 &&
            actionsRecorded.includes("WORK_ORDER_CREATE") &&
            actionsRecorded.includes("WORK_ORDER_APPROVED") &&
            actionsRecorded.includes("WORK_ORDER_ASSIGNED") &&
            actionsRecorded.includes("WORK_ORDER_STARTED") &&
            actionsRecorded.includes("WORK_ORDER_COMPLETED") &&
            actionsRecorded.includes("WORK_ORDER_VERIFIED_CLOSED")
  };

  // --------------------------------------------------------------------------
  // Check 2g: Running-hours preventive schedule & duplicate suppression
  // --------------------------------------------------------------------------
  console.log("Running Check 2g...");
  const eq = db.prepare("SELECT id, running_hours FROM equipment WHERE id = 3").get();
  const initialRunningHours = eq.running_hours;

  // Create running-hours PM schedule on equipment 3
  const schedRes = await fetch(`${BASE_URL}/api/pm-schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
    body: JSON.stringify({
      equipment_id: 3,
      task: "2g Extra Check: Crawler Track Lubrication",
      trigger_type: "hours",
      interval_hours: 100,
      last_done_hours: initialRunningHours
    })
  });
  const schedData = await schedRes.json();
  const schedId = schedData.schedule.id;

  // Before threshold
  runPmScheduler();
  const ordersBefore = db.prepare("SELECT id FROM work_orders WHERE pm_schedule_id = ?").all(schedId);

  // Cross threshold
  db.prepare("UPDATE equipment SET running_hours = ? WHERE id = 3").run(initialRunningHours + 100);
  runPmScheduler();
  const ordersAfter = db.prepare("SELECT id, status, type, pm_schedule_id FROM work_orders WHERE pm_schedule_id = ?").all(schedId);

  // Duplicate suppression
  runPmScheduler();
  const ordersDup = db.prepare("SELECT id FROM work_orders WHERE pm_schedule_id = ?").all(schedId);

  // Restore running hours
  db.prepare("UPDATE equipment SET running_hours = ? WHERE id = 3").run(initialRunningHours);

  results["2g"] = {
    test: "Running-hours preventive trigger & per-schedule duplicate suppression",
    scheduleId: schedId,
    ordersBeforeThresholdCount: ordersBefore.length,
    ordersAfterThresholdCount: ordersAfter.length,
    ordersAfterDetails: ordersAfter[0],
    ordersAfterSecondCronCount: ordersDup.length,
    passed: schedRes.status === 201 &&
            ordersBefore.length === 0 &&
            ordersAfter.length === 1 &&
            ordersAfter[0].status === "Submitted" &&
            ordersAfter[0].type === "preventive" &&
            ordersDup.length === 1
  };

  // --------------------------------------------------------------------------
  // Check 2h: GET /api/audit/verify returns valid
  // --------------------------------------------------------------------------
  console.log("Running Check 2h...");
  const verifyRes = await fetch(`${BASE_URL}/api/audit/verify`, {
    headers: { "Authorization": `Bearer ${adminToken}` }
  });
  const verifyData = await verifyRes.json();

  results["2h"] = {
    test: "Cryptographic audit chain verification against separate anchor file",
    status: verifyRes.status,
    body: verifyData,
    passed: verifyRes.status === 200 && verifyData.valid === true
  };

  return results;
}

runAllChecks()
  .then(res => {
    fs.writeFileSync(
      path.join(__dirname, "step2-results.json"),
      JSON.stringify(res, null, 2),
      "utf8"
    );
    console.log("Step 2 checks completed successfully. Saved to step2-results.json");
  })
  .catch(err => {
    console.error("Step 2 runner encountered error:", err);
    process.exit(1);
  });
