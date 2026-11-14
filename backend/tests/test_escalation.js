const db = require("../db");
const { runPmScheduler } = require("../cron");

// 1. Create a test work order in Assigned status with sla_due_at 1 minute in the past
const pastSla = new Date(Date.now() - 60 * 1000).toISOString();
console.log("Setting sla_due_at to:", pastSla);

const insertRes = db.prepare(`
  INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
  VALUES ('Test SLA Escalation Order', 'Testing F1', 1, 1, 4, 'Critical', 'Assigned', 'corrective', ?, 0)
`).run(pastSla);

const testOrderId = insertRes.lastInsertRowid;
console.log("Created test order with ID:", testOrderId);

// Verify initial state
const initialOrder = db.prepare("SELECT id, status, sla_due_at, escalated FROM work_orders WHERE id = ?").get(testOrderId);
console.log("Initial order state:", initialOrder);

// Run scheduler
console.log("Running runPmScheduler()...");
runPmScheduler();

// Check if escalated
const updatedOrder = db.prepare("SELECT id, status, sla_due_at, escalated FROM work_orders WHERE id = ?").get(testOrderId);
console.log("Updated order state:", updatedOrder);

// Check audit log
const auditRow = db.prepare("SELECT * FROM audit_log WHERE action = 'WORK_ORDER_ESCALATED' ORDER BY id DESC LIMIT 1").get();
console.log("Audit row for WORK_ORDER_ESCALATED:", auditRow);
