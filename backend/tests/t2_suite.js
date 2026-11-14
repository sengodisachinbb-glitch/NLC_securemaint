// Test Group T2 Runner
// Validates Work Order lifecycle, RBAC enforcement, state machine guards,
// reopen rules, IDOR scoping, background scheduler, SLA escalation,
// action tracker statutory workflow, and dashboard analytics metrics.

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

// Deep check for any null or NaN values in an object
function hasNullOrNaN(obj) {
  if (obj === null || obj === undefined || Number.isNaN(obj)) return true;
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (hasNullOrNaN(obj[key])) return true;
    }
  }
  return false;
}

async function runTests() {
  console.log("=== Starting Test Group T2 Execution ===");

  // 1. Ensure backend server is reachable; if not, spin up a child instance
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

  // Generate tokens for all 5 roles (24h validity for resilient test execution)
  const requesterToken = jwt.sign(
    { id: 5, name: "Pooja Nair (Requester)", email: "requester@nlc.in", role: "Requester", section: "Mine Operations" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  const supervisorToken = jwt.sign(
    { id: 3, name: "Suresh Murugan (Supervisor)", email: "supervisor@nlc.in", role: "Supervisor", section: "Mechanical Maintenance" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  const managerToken = jwt.sign(
    { id: 2, name: "Ananya Sharma (Manager)", email: "manager@nlc.in", role: "Manager", section: "Maintenance Planning" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  const technicianToken = jwt.sign(
    { id: 4, name: "Karthik Selvan (Technician)", email: "technician@nlc.in", role: "Technician", section: "Electrical & Conveyors" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  const adminToken = jwt.sign(
    { id: 1, name: "Rajesh Kumar (Admin)", email: "admin@nlc.in", role: "Admin", section: "Systems & Security" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  let testOrderId = null;

  // -------------------------------------------------------------
  // Test 1: Full work order lifecycle with correct roles & SLA check & audit rows
  // -------------------------------------------------------------
  try {
    const auditActionsBefore = db.prepare("SELECT action FROM audit_log").all().map(a => a.action);

    // Step A: Create (Requester)
    const rCreate = await fetch(`${BASE_URL}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({
        title: "T2 Lifecycle Bucket Wheel Bearing Check",
        equipment_id: 1,
        type: "corrective",
        description: "Bearing temperature fluctuation observed"
      })
    });
    const dCreate = await rCreate.json();
    testOrderId = dCreate.workOrder?.id;

    // Step B: Approve (Supervisor)
    const rApprove = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/approve`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });
    const dApprove = await rApprove.json();

    // Step C: Assign with Critical priority (Manager)
    const assignTime = Date.now();
    const rAssign = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        technician_id: 4,
        priority: "Critical"
      })
    });
    const dAssign = await rAssign.json();
    const slaDueAt = new Date(dAssign.workOrder?.sla_due_at).getTime();
    const diffHours = (slaDueAt - assignTime) / (3600 * 1000);

    // Step D: Start (Technician)
    const rStart = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/start`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dStart = await rStart.json();

    // Step E: Complete (Technician)
    const rComplete = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/complete`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dComplete = await rComplete.json();

    // Step F: Verify-close (Requester)
    const rClose = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/verify-close`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${requesterToken}` }
    });
    const dClose = await rClose.json();

    // Verify Audit rows created for all steps
    const auditActionsAfter = db.prepare("SELECT action, details FROM audit_log WHERE entity = 'work_orders'").all();
    const orderAuditActions = auditActionsAfter
      .filter(a => {
        try { return JSON.parse(a.details).id === testOrderId; } catch { return false; }
      })
      .map(a => a.action);

    const hasCreate = orderAuditActions.includes("WORK_ORDER_CREATE");
    const hasApprove = orderAuditActions.includes("WORK_ORDER_APPROVED");
    const hasAssign = orderAuditActions.includes("WORK_ORDER_ASSIGNED");
    const hasStart = orderAuditActions.includes("WORK_ORDER_STARTED");
    const hasComplete = orderAuditActions.includes("WORK_ORDER_COMPLETED");
    const hasClose = orderAuditActions.includes("WORK_ORDER_VERIFIED_CLOSED");
    const allAuditStepsWritten = hasCreate && hasApprove && hasAssign && hasStart && hasComplete && hasClose;

    const slaIs4Hours = diffHours >= 3.8 && diffHours <= 4.2;
    const passed = rCreate.status === 201 && dCreate.workOrder?.status === "Submitted" &&
                   rApprove.status === 200 && dApprove.workOrder?.status === "Approved" &&
                   rAssign.status === 200 && dAssign.workOrder?.status === "Assigned" && slaIs4Hours &&
                   rStart.status === 200 && dStart.workOrder?.status === "In Progress" &&
                   rComplete.status === 200 && dComplete.workOrder?.status === "Completed" &&
                   rClose.status === 200 && dClose.workOrder?.status === "Closed" &&
                   allAuditStepsWritten;

    record(
      "T2.1",
      "Full work order lifecycle across permitted roles & SLA calculation",
      "Submitted (Req) -> Approved (Sup) -> Assigned (Mgr) with Critical 4h SLA -> In Progress (Tech) -> Completed (Tech) -> Closed (Req); audit logged at every step",
      `Order #${testOrderId}: Create: ${rCreate.status} (${dCreate.workOrder?.status}), Approve: ${rApprove.status} (${dApprove.workOrder?.status}), Assign: ${rAssign.status} (${dAssign.workOrder?.status}, SLA +${diffHours.toFixed(2)}h), Start: ${rStart.status} (${dStart.workOrder?.status}), Complete: ${rComplete.status} (${dComplete.workOrder?.status}), Close: ${rClose.status} (${dClose.workOrder?.status}), Audit rows: [${orderAuditActions.join(", ")}]`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.1", "Full work order lifecycle", "All stages succeed with proper roles and 4h SLA", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 2: Wrong role at each step is rejected (403 Forbidden)
  // -------------------------------------------------------------
  try {
    // A. Create new order as Requester
    const rNew = await fetch(`${BASE_URL}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ title: "Role Guard Test Order", equipment_id: 1 })
    });
    const dNew = await rNew.json();
    const guardOrderId = dNew.workOrder?.id;

    // B. Technician trying to approve (Requires Supervisor/Admin)
    const rTechApprove = await fetch(`${BASE_URL}/api/work-orders/${guardOrderId}/approve`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });

    // C. Supervisor trying to assign technician (Requires Manager/Admin)
    const rSupAssign = await fetch(`${BASE_URL}/api/work-orders/${guardOrderId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` },
      body: JSON.stringify({ technician_id: 4, priority: "High" })
    });

    // D. Supervisor trying to start order (Requires assigned Technician/Admin)
    const rSupStart = await fetch(`${BASE_URL}/api/work-orders/${guardOrderId}/start`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });

    // E. Supervisor trying to complete order (Requires assigned Technician/Admin)
    const rSupComplete = await fetch(`${BASE_URL}/api/work-orders/${guardOrderId}/complete`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });

    // F. Technician trying to verify-close (Requires Requester/Admin)
    const rTechClose = await fetch(`${BASE_URL}/api/work-orders/${guardOrderId}/verify-close`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });

    const passed = rTechApprove.status === 403 &&
                   rSupAssign.status === 403 &&
                   rSupStart.status === 403 &&
                   rSupComplete.status === 403 &&
                   rTechClose.status === 403;

    record(
      "T2.2",
      "Work order role enforcement guards at every state transition",
      "Tech approve -> 403, Sup assign -> 403, Sup start -> 403, Sup complete -> 403, Tech close -> 403",
      `Tech approve: HTTP ${rTechApprove.status}, Sup assign: HTTP ${rSupAssign.status}, Sup start: HTTP ${rSupStart.status}, Sup complete: HTTP ${rSupComplete.status}, Tech close: HTTP ${rTechClose.status}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.2", "Role guard rejection tests", "All unauthorized transitions return HTTP 403", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 3: Illegal moves are rejected (start on Closed, assign on Submitted, complete before start)
  // -------------------------------------------------------------
  try {
    // A. Start on a Closed order (testOrderId was Closed in T2.1)
    const rStartOnClosed = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/start`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const dStartOnClosed = await rStartOnClosed.json();

    // B. Create a new Submitted order
    const rSub = await fetch(`${BASE_URL}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ title: "State Machine Illegal Move Check", equipment_id: 1 })
    });
    const dSub = await rSub.json();
    const subOrderId = dSub.workOrder?.id;

    // C. Assign on a Submitted order (must be Approved first)
    const rAssignOnSubmitted = await fetch(`${BASE_URL}/api/work-orders/${subOrderId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({ technician_id: 4, priority: "Medium" })
    });
    const dAssignOnSubmitted = await rAssignOnSubmitted.json();

    // D. Complete before start on an Assigned order
    // First approve and assign subOrderId properly
    await fetch(`${BASE_URL}/api/work-orders/${subOrderId}/approve`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });
    await fetch(`${BASE_URL}/api/work-orders/${subOrderId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({ technician_id: 4, priority: "Medium" })
    });

    // Now order is in 'Assigned' state; attempt to complete directly without starting
    const rCompleteBeforeStart = await fetch(`${BASE_URL}/api/work-orders/${subOrderId}/complete`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dCompleteBeforeStart = await rCompleteBeforeStart.json();

    const passed = rStartOnClosed.status === 400 && dStartOnClosed.error.includes("Illegal status transition") &&
                   rAssignOnSubmitted.status === 400 && dAssignOnSubmitted.error.includes("Illegal status transition") &&
                   rCompleteBeforeStart.status === 400 && dCompleteBeforeStart.error.includes("Illegal status transition");

    record(
      "T2.3",
      "Work order state machine invalid move rejection",
      "Start on Closed -> HTTP 400, Assign on Submitted -> HTTP 400, Complete before start -> HTTP 400",
      `Start on Closed: HTTP ${rStartOnClosed.status} ('${dStartOnClosed.error}'), Assign on Submitted: HTTP ${rAssignOnSubmitted.status} ('${dAssignOnSubmitted.error}'), Complete before start: HTTP ${rCompleteBeforeStart.status} ('${dCompleteBeforeStart.error}')`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.3", "Illegal state moves", "All return HTTP 400 Illegal status transition", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 4: Reopen works only from Completed or Closed and only for the Requester
  // -------------------------------------------------------------
  try {
    // testOrderId is in 'Closed' status and was created by Requester (ID 5)
    
    // A. Reopen by Technician (non-requester) -> 403 Forbidden
    const rTechReopen = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/reopen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${technicianToken}` },
      body: JSON.stringify({ reason: "Technician unauthorized reopen" })
    });
    const dTechReopen = await rTechReopen.json();

    // B. Reopen on a Submitted order by Requester -> 400 Illegal status transition
    const rNewSub = await fetch(`${BASE_URL}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ title: "Reopen Guard Test", equipment_id: 1 })
    });
    const dNewSub = await rNewSub.json();
    const rReopenSubmitted = await fetch(`${BASE_URL}/api/work-orders/${dNewSub.workOrder?.id}/reopen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` }
    });
    const dReopenSubmitted = await rReopenSubmitted.json();

    // C. Reopen from Closed by Requester -> 200 OK (status becomes 'In Progress')
    const rReopenClosed = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/reopen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ reason: "Inspection failed, additional lubrication needed" })
    });
    const dReopenClosed = await rReopenClosed.json();

    // D. Complete it again, then reopen from Completed by Requester -> 200 OK
    await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/complete`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const rReopenCompleted = await fetch(`${BASE_URL}/api/work-orders/${testOrderId}/reopen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ reason: "Reopened from Completed status for verification rework" })
    });
    const dReopenCompleted = await rReopenCompleted.json();

    const passed = rTechReopen.status === 403 &&
                   rReopenSubmitted.status === 400 &&
                   rReopenClosed.status === 200 && dReopenClosed.workOrder?.status === "In Progress" &&
                   rReopenCompleted.status === 200 && dReopenCompleted.workOrder?.status === "In Progress";

    record(
      "T2.4",
      "Work order reopen constraints (Completed/Closed only, Requester only)",
      "Non-requester -> 403; Submitted -> 400; Closed by Requester -> 200 ('In Progress'); Completed by Requester -> 200 ('In Progress')",
      `Tech reopen: HTTP ${rTechReopen.status} ('${dTechReopen.error}'), Reopen Submitted: HTTP ${rReopenSubmitted.status} ('${dReopenSubmitted.error}'), Reopen Closed: HTTP ${rReopenClosed.status} (status: '${dReopenClosed.workOrder?.status}'), Reopen Completed: HTTP ${rReopenCompleted.status} (status: '${dReopenCompleted.workOrder?.status}')`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.4", "Work order reopen constraints", "403 for non-requester, 400 for Submitted, 200 for Closed/Completed", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 5: A Requester only sees their own orders; a Technician only sees assigned orders
  // -------------------------------------------------------------
  try {
    // Fetch list as Requester
    const rReqList = await fetch(`${BASE_URL}/api/work-orders`, {
      headers: { "Authorization": `Bearer ${requesterToken}` }
    });
    const dReqList = await rReqList.json();
    const reqOrders = dReqList.workOrders || [];
    const allBelongToRequester = reqOrders.length > 0 && reqOrders.every(o => o.requester_id === 5);

    // Fetch list as Technician
    const rTechList = await fetch(`${BASE_URL}/api/work-orders`, {
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const dTechList = await rTechList.json();
    const techOrders = dTechList.workOrders || [];
    const allAssignedToTech = techOrders.length > 0 && techOrders.every(o => o.technician_id === 4);

    // Check single-order IDOR protection
    // Find an order NOT requested by Requester (e.g. requester_id !== 5)
    const foreignOrderForReq = db.prepare("SELECT id FROM work_orders WHERE requester_id != 5 LIMIT 1").get();
    let reqIdorBlocked = false;
    if (foreignOrderForReq) {
      const rReqIdor = await fetch(`${BASE_URL}/api/work-orders/${foreignOrderForReq.id}`, {
        headers: { "Authorization": `Bearer ${requesterToken}` }
      });
      reqIdorBlocked = rReqIdor.status === 403;
    } else {
      reqIdorBlocked = true;
    }

    // Find an order NOT assigned to Technician (e.g. technician_id != 4 or NULL)
    const unassignedOrder = db.prepare("SELECT id FROM work_orders WHERE technician_id IS NULL OR technician_id != 4 LIMIT 1").get();
    let techIdorBlocked = false;
    if (unassignedOrder) {
      const rTechIdor = await fetch(`${BASE_URL}/api/work-orders/${unassignedOrder.id}`, {
        headers: { "Authorization": `Bearer ${technicianToken}` }
      });
      techIdorBlocked = rTechIdor.status === 403;
    } else {
      techIdorBlocked = true;
    }

    const passed = allBelongToRequester && allAssignedToTech && reqIdorBlocked && techIdorBlocked;

    record(
      "T2.5",
      "Role-based work order scoping & IDOR enforcement",
      "Requester only sees own submitted orders (IDOR: 403); Technician only sees assigned orders (IDOR: 403)",
      `Requester list (${reqOrders.length} items): all requester_id=5 is ${allBelongToRequester}, Requester IDOR blocked: ${reqIdorBlocked}; Technician list (${techOrders.length} items): all technician_id=4 is ${allAssignedToTech}, Technician IDOR blocked: ${techIdorBlocked}`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.5", "Role scoping and IDOR check", "Only own/assigned orders visible, 403 on IDOR", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 6: Scheduler with DEMO_MODE: create 1m PM schedule, confirm creation & duplicate prevention
  // -------------------------------------------------------------
  try {
    // 1. Pick an equipment item with NO current open PM work orders (e.g. Equipment 9)
    const eqTarget = 9;
    db.prepare("DELETE FROM work_orders WHERE equipment_id = ? AND type = 'preventive'").run(eqTarget);

    // 2. Create a PM schedule via API with interval_days = 1 and next_due due immediately
    const immediateDue = new Date(Date.now() - 5000).toISOString();
    const rPmCreate = await fetch(`${BASE_URL}/api/pm-schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        equipment_id: eqTarget,
        task: "Vibration frequency spectrum scan on conveyor gearbox",
        interval_days: 1,
        next_due: immediateDue
      })
    });
    const dPmCreate = await rPmCreate.json();
    const scheduleId = dPmCreate.schedule?.id;

    console.log(`[Test T2.6] Created PM schedule #${scheduleId}. Polling for automated PM work order generation...`);

    // Poll up to 75 seconds for the cron scheduler to generate the order
    let generatedOrder = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 75000) {
      generatedOrder = db.prepare(`
        SELECT id, title, type, status, equipment_id, created_at 
        FROM work_orders 
        WHERE equipment_id = ? AND type = 'preventive' AND status = 'Submitted'
      `).get(eqTarget);

      if (generatedOrder) break;
      await new Promise(r => setTimeout(r, 3000));
    }

    const orderFound = Boolean(generatedOrder);

    // Now verify duplicate prevention: while this generated order is open, wait another 30 seconds or trigger check
    // Confirm count of open preventive orders remains exactly 1
    const orderCountBefore = db.prepare("SELECT COUNT(*) as c FROM work_orders WHERE equipment_id = ? AND type = 'preventive' AND status NOT IN ('Closed', 'Rejected')").get(eqTarget).c;

    // Manually set schedule next_due into the past to see if scheduler generates duplicate
    db.prepare("UPDATE pm_schedules SET next_due = ? WHERE id = ?").run(new Date(Date.now() - 10000).toISOString(), scheduleId);
    
    // Wait 10 seconds and check again
    await new Promise(r => setTimeout(r, 10000));
    const orderCountAfter = db.prepare("SELECT COUNT(*) as c FROM work_orders WHERE equipment_id = ? AND type = 'preventive' AND status NOT IN ('Closed', 'Rejected')").get(eqTarget).c;

    const noDuplicatesCreated = orderCountBefore === 1 && orderCountAfter === 1;
    const passed = orderFound && noDuplicatesCreated;

    record(
      "T2.6",
      "Automated PM Scheduler auto-generation & duplicate suppression",
      "Generates 1 preventive work order for due schedule; suppresses duplicates while order is open",
      `PM Order generated: Order #${generatedOrder?.id} ('${generatedOrder?.title}'), Open PM count before: ${orderCountBefore}, Open PM count after duplicate probe: ${orderCountAfter} (No duplicates: ${noDuplicatesCreated})`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.6", "PM scheduler auto-generation", "One order generated, no duplicate", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 7: Escalation: make an assigned order past its sla_due_at and confirm escalated=1
  // -------------------------------------------------------------
  try {
    // Create and assign an order
    const rEscOrder = await fetch(`${BASE_URL}/api/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${requesterToken}` },
      body: JSON.stringify({ title: "SLA Escalation Validation Order", equipment_id: 2 })
    });
    const dEscOrder = await rEscOrder.json();
    const escOrderId = dEscOrder.workOrder?.id;

    await fetch(`${BASE_URL}/api/work-orders/${escOrderId}/approve`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${supervisorToken}` }
    });

    await fetch(`${BASE_URL}/api/work-orders/${escOrderId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({ technician_id: 4, priority: "Critical" })
    });

    // Artificially set sla_due_at to 10 minutes in the past and escalated = 0
    const pastSla = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    db.prepare("UPDATE work_orders SET sla_due_at = ?, escalated = 0 WHERE id = ?").run(pastSla, escOrderId);

    console.log(`[Test T2.7] Set order #${escOrderId} SLA to past (${pastSla}). Waiting for background SLA escalation...`);

    // Poll up to 75 seconds for cron to escalate
    let isEscalated = false;
    const startEscTime = Date.now();
    while (Date.now() - startEscTime < 75000) {
      const orderState = db.prepare("SELECT escalated, status FROM work_orders WHERE id = ?").get(escOrderId);
      if (orderState && orderState.escalated === 1) {
        isEscalated = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    // Verify audit log has WORK_ORDER_ESCALATED
    const escalationAudit = db.prepare("SELECT action, details FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED'").all();
    const hasAuditEscalation = escalationAudit.some(a => {
      try { return JSON.parse(a.details).id === escOrderId; } catch { return false; }
    });

    const passed = isEscalated && hasAuditEscalation;

    record(
      "T2.7",
      "Automated background SLA escalation monitoring",
      "Overdue order past sla_due_at automatically marked escalated=1 by background cron within 2 minutes",
      `Order #${escOrderId} escalated: ${isEscalated}, Audit WORK_ORDER_ESCALATED logged: ${hasAuditEscalation} (${Math.round((Date.now() - startEscTime)/1000)}s elapsed)`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.7", "SLA escalation check", "escalated=1 within 2 minutes", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 8: Actions: overdue status, owner-only progress, manager verification, overdue cleared
  // -------------------------------------------------------------
  try {
    // 1. Manager creates action item with past due date (e.g. 2023-01-01) assigned to Supervisor (ID 3)
    const rAction = await fetch(`${BASE_URL}/api/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({
        source: "CAG Report 35 of 2025 (Test)",
        description: "Overdue safety valve recalibration on high-pressure boiler",
        owner_id: 3,
        due_date: "2023-01-01"
      })
    });
    const dAction = await rAction.json();
    const actionId = dAction.action?.id;
    const initialOverdue = dAction.action?.isOverdue;

    // 2. Non-owner (Technician, ID 4) tries to update progress -> 403 Forbidden
    const rTechProgress = await fetch(`${BASE_URL}/api/actions/${actionId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${technicianToken}` },
      body: JSON.stringify({ status: "In Progress", evidence_note: "Technician unauthorized edit" })
    });
    const dTechProgress = await rTechProgress.json();

    // 3. Assigned owner (Supervisor, ID 3) updates progress -> 200 OK
    const rOwnerProgress = await fetch(`${BASE_URL}/api/actions/${actionId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` },
      body: JSON.stringify({ status: "Done", evidence_note: "Recalibration verified with calibrated test gauge" })
    });
    const dOwnerProgress = await rOwnerProgress.json();

    // 4. Non-manager (Supervisor, ID 3) tries to verify -> 403 Forbidden
    const rSupVerify = await fetch(`${BASE_URL}/api/actions/${actionId}/verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supervisorToken}` },
      body: JSON.stringify({ verification_note: "Supervisor unauthorized verify" })
    });

    // 5. Manager verifies closure -> 200 OK
    const rMgrVerify = await fetch(`${BASE_URL}/api/actions/${actionId}/verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${managerToken}` },
      body: JSON.stringify({ verification_note: "Statutory calibration certificate inspected and approved" })
    });
    const dMgrVerify = await rMgrVerify.json();
    const finalOverdue = dMgrVerify.action?.isOverdue;
    const finalStatus = dMgrVerify.action?.status;

    const passed = rAction.status === 201 && initialOverdue === true &&
                   rTechProgress.status === 403 &&
                   rOwnerProgress.status === 200 && dOwnerProgress.action?.status === "Done" &&
                   rSupVerify.status === 403 &&
                   rMgrVerify.status === 200 && finalStatus === "Verified" && finalOverdue === false;

    record(
      "T2.8",
      "Statutory Action Tracker lifecycle, RBAC, and overdue state calculation",
      "Past due date -> isOverdue=true; non-owner progress -> 403; owner progress -> 200; non-manager verify -> 403; manager verify -> 200, status='Verified', isOverdue=false",
      `Create: HTTP ${rAction.status} (isOverdue=${initialOverdue}), Non-owner progress: HTTP ${rTechProgress.status} ('${dTechProgress.error}'), Owner progress: HTTP ${rOwnerProgress.status} (status: '${dOwnerProgress.action?.status}'), Non-mgr verify: HTTP ${rSupVerify.status}, Mgr verify: HTTP ${rMgrVerify.status} (status: '${finalStatus}', isOverdue=${finalOverdue})`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.8", "Action tracker lifecycle and permissions", "Overdue, owner only progress, manager only verify, not overdue when verified", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Test 9: Dashboard stats permissions & null/NaN absence on seeded & freshly seeded DB
  // -------------------------------------------------------------
  try {
    // 1. Check Technician get 403 Forbidden
    const rDashTech = await fetch(`${BASE_URL}/api/dashboard/stats`, {
      headers: { "Authorization": `Bearer ${technicianToken}` }
    });
    const techBlocked = rDashTech.status === 403;

    // 2. Check Manager get 200 OK
    const rDashMgr = await fetch(`${BASE_URL}/api/dashboard/stats`, {
      headers: { "Authorization": `Bearer ${managerToken}` }
    });
    const dDashMgr = await rDashMgr.json();
    const mgrOk = rDashMgr.status === 200;
    const mgrHasNullOrNaN = hasNullOrNaN(dDashMgr);

    // 3. Check Admin get 200 OK
    const rDashAdmin = await fetch(`${BASE_URL}/api/dashboard/stats`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const dDashAdmin = await rDashAdmin.json();
    const adminOk = rDashAdmin.status === 200;
    const adminHasNullOrNaN = hasNullOrNaN(dDashAdmin);

    // 4. Test on a freshly seeded database
    execSync("npm run seed", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    const rDashFresh = await fetch(`${BASE_URL}/api/dashboard/stats`, {
      headers: { "Authorization": `Bearer ${managerToken}` }
    });
    const dDashFresh = await rDashFresh.json();
    const freshOk = rDashFresh.status === 200;
    const freshHasNullOrNaN = hasNullOrNaN(dDashFresh);

    const passed = techBlocked && mgrOk && !mgrHasNullOrNaN && adminOk && !adminHasNullOrNaN && freshOk && !freshHasNullOrNaN;

    record(
      "T2.9",
      "Executive Dashboard analytics permissions & complete numeric integrity",
      "Manager/Admin get HTTP 200; Technician gets HTTP 403; zero NaN/null values on existing and freshly seeded DB",
      `Technician: HTTP ${rDashTech.status} (Blocked: ${techBlocked}), Manager: HTTP ${rDashMgr.status} (Null/NaN: ${mgrHasNullOrNaN}), Admin: HTTP ${rDashAdmin.status} (Null/NaN: ${adminHasNullOrNaN}), Fresh seed: HTTP ${rDashFresh.status} (Null/NaN: ${freshHasNullOrNaN}, PM Compliance: ${dDashFresh.preventiveMaintenance?.compliancePercentage}%)`,
      passed ? "PASS" : "FAIL"
    );
  } catch (err) {
    record("T2.9", "Dashboard statistics verification", "200 for Manager/Admin, 403 for Tech, no null/NaN", err.message, "FAIL");
  }

  // -------------------------------------------------------------
  // Generate Markdown Report
  // -------------------------------------------------------------
  const mdLines = [
    "# Test Group T2: Work Orders, State Machine, Scheduler, Actions & Dashboard",
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
    mdLines.push("All tested criteria under Test Group T2 passed successfully with zero failures.");
  } else {
    mdLines.push(`Warning: ${totalFail} test(s) failed.`);
  }

  const outputPath = path.resolve(__dirname, "../../tests-output/T2-results.md");
  fs.writeFileSync(outputPath, mdLines.join("\n"), "utf8");
  console.log(`\nResults written successfully to: ${outputPath}`);

  if (serverProcess) {
    serverProcess.kill();
    console.log("[Test Runner] Cleaned up temporary backend server instance.");
  }

  console.log("\n==========================================================================================");
  console.log("                                 TEST GROUP T2 RESULTS TABLE                              ");
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
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});

