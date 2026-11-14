// Test Suite for Task F1: SLA Escalation Engine Verification
// Tests direct execution of exported escalation function, state eligibility,
// audit trail logging, and idempotence.

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const db = require("../db");
const cronModule = require("../cron");

test("Task F1: SLA Escalation Engine Tests", async (t) => {
  // 1. Requirement 4 Check: Escalation function must be exported from cron.js
  await t.test("1. cron.js exports escalateOverdueOrders function", () => {
    assert.strictEqual(
      typeof cronModule.escalateOverdueOrders,
      "function",
      "cron.js must export escalateOverdueOrders function so it can be called directly"
    );
  });

  // If escalateOverdueOrders is not a function, the remaining tests cannot proceed
  if (typeof cronModule.escalateOverdueOrders !== "function") {
    return;
  }

  const { escalateOverdueOrders } = cronModule;

  // 2. Requirement 5 Check: Create assigned work order with sla_due_at 1 min in past, call escalation, verify escalated=1 and audit row
  await t.test("2. Escalates assigned work order with past sla_due_at and records audit row", () => {
    const pastSla = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute in the past, exact ISO format
    
    // Insert fresh test order in 'Assigned' status
    const insert = db.prepare(`
      INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
      VALUES (?, ?, 1, 1, 4, 'Critical', 'Assigned', 'corrective', ?, 0)
    `).run("F1 Test Assigned Work Order", "Test description", pastSla);
    const orderId = insert.lastInsertRowid;

    // Call escalation function directly
    const escalatedList = escalateOverdueOrders();

    // Verify order in database
    const order = db.prepare("SELECT id, status, sla_due_at, escalated FROM work_orders WHERE id = ?").get(orderId);
    assert.strictEqual(order.escalated, 1, `Order #${orderId} escalated flag should be 1`);

    // Verify audit log
    const auditRows = db.prepare(`
      SELECT * FROM audit_log 
      WHERE action = 'WORK_ORDER_ESCALATED' 
      ORDER BY id DESC
    `).all();

    const matchingAudit = auditRows.find(a => {
      try {
        const details = JSON.parse(a.details);
        return details.id === orderId;
      } catch {
        return false;
      }
    });

    assert.ok(matchingAudit, `Audit log must contain WORK_ORDER_ESCALATED row for order #${orderId}`);
    const details = JSON.parse(matchingAudit.details);
    assert.strictEqual(details.id, orderId);
    assert.strictEqual(details.status, "Assigned");
    assert.strictEqual(details.sla_due_at, pastSla);
  });

  // 3. Requirement 5 Check: Completed and Closed orders must NOT be escalated
  await t.test("3. Completed and Closed work orders with past sla_due_at are NOT escalated", () => {
    const pastSla = new Date(Date.now() - 60 * 1000).toISOString();

    // Completed order
    const insertCompleted = db.prepare(`
      INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
      VALUES (?, ?, 1, 1, 4, 'Critical', 'Completed', 'corrective', ?, 0)
    `).run("F1 Test Completed Order", "Should not escalate", pastSla);
    const completedId = insertCompleted.lastInsertRowid;

    // Closed order
    const insertClosed = db.prepare(`
      INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
      VALUES (?, ?, 1, 1, 4, 'Critical', 'Closed', 'corrective', ?, 0)
    `).run("F1 Test Closed Order", "Should not escalate", pastSla);
    const closedId = insertClosed.lastInsertRowid;

    // Call escalation
    escalateOverdueOrders();

    // Verify both orders remain escalated = 0
    const completedOrder = db.prepare("SELECT escalated FROM work_orders WHERE id = ?").get(completedId);
    assert.strictEqual(completedOrder.escalated, 0, "Completed order must NOT be escalated");

    const closedOrder = db.prepare("SELECT escalated FROM work_orders WHERE id = ?").get(closedId);
    assert.strictEqual(closedOrder.escalated, 0, "Closed order must NOT be escalated");
  });

  // 4. Requirement 5 Check: Order is NOT escalated twice (idempotence)
  await t.test("4. Already escalated order is not escalated twice (idempotent)", () => {
    const pastSla = new Date(Date.now() - 60 * 1000).toISOString();

    const insert = db.prepare(`
      INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
      VALUES (?, ?, 1, 1, 4, 'Critical', 'Assigned', 'corrective', ?, 0)
    `).run("F1 Test Idempotent Order", "Idempotence test", pastSla);
    const orderId = insert.lastInsertRowid;

    // First call: should escalate
    escalateOverdueOrders();
    const orderAfterFirst = db.prepare("SELECT escalated FROM work_orders WHERE id = ?").get(orderId);
    assert.strictEqual(orderAfterFirst.escalated, 1);

    const auditCount1 = db.prepare(`
      SELECT count(*) as c FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' AND details LIKE ?
    `).get(`%"id":${orderId}%`).c;
    assert.strictEqual(auditCount1, 1, "Should have exactly 1 audit row after first escalation");

    // Second call: should NOT escalate again
    escalateOverdueOrders();
    const auditCount2 = db.prepare(`
      SELECT count(*) as c FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' AND details LIKE ?
    `).get(`%"id":${orderId}%`).c;
    assert.strictEqual(auditCount2, 1, "Should still have exactly 1 audit row after second call (no duplicate audit)");
  });
});

