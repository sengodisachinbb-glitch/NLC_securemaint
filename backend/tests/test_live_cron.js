const db = require("../db");

async function waitForRealCron() {
  const pastSla = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Insert a second overdue order
  const insert = db.prepare(`
    INSERT INTO work_orders (title, description, equipment_id, requester_id, technician_id, priority, status, type, sla_due_at, escalated)
    VALUES (?, ?, 1, 1, 4, 'Critical', 'Assigned', 'corrective', ?, 0)
  `).run("Real Background Cron Escalation Live Order", "Overdue order waiting for background node-cron tick", pastSla);

  const orderId = insert.lastInsertRowid;
  console.log(`Inserted order #${orderId} with sla_due_at: ${pastSla}, escalated: 0`);
  console.log("Initial DB Row:", db.prepare("SELECT id, title, status, sla_due_at, escalated, updated_at FROM work_orders WHERE id = ?").get(orderId));
  console.log("Waiting for background node-cron to fire on minute rollover (polling every 2s, up to 120s)...");

  const startTime = Date.now();
  let escalatedRow = null;

  while (Date.now() - startTime < 120000) {
    const row = db.prepare("SELECT id, title, status, sla_due_at, escalated, updated_at FROM work_orders WHERE id = ?").get(orderId);
    if (row && row.escalated === 1) {
      escalatedRow = row;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

  if (escalatedRow) {
    console.log(`\n[SUCCESS] Background node-cron successfully escalated order #${orderId} after ${elapsedSeconds} seconds!`);
    console.log("Updated DB Row:", escalatedRow);
    const auditRow = db.prepare(`
      SELECT id, timestamp, action, entity, details 
      FROM audit_log 
      WHERE action = 'WORK_ORDER_ESCALATED' AND details LIKE ? 
      ORDER BY id DESC LIMIT 1
    `).get(`%"id":${orderId}%`);
    console.log("Audit Log Entry:", auditRow);
  } else {
    console.log("\n[TIMEOUT] Order was not escalated within 120 seconds.");
  }
}

waitForRealCron();

