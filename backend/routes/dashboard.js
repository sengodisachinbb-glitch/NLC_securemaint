// Dashboard Metrics & KPI Routes (/api/dashboard)
// Aggregates operational KPIs for Managers and Admins

const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Accessible by Manager and Admin
 * Returns:
 * - Work orders count by status
 * - Overdue and escalated work orders
 * - PM compliance percentage
 * - Equipment lifecycle breakdown (Red / Amber / Green)
 * - Overdue compliance action items
 */
router.get("/stats", authenticate, authorize("Manager", "Admin"), (req, res) => {
  try {
    const nowIso = new Date().toISOString();

    // 1. Work Orders by Status
    const statusCountsRaw = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM work_orders
      GROUP BY status
    `).all();

    const workOrdersByStatus = {
      Submitted: 0,
      Approved: 0,
      Assigned: 0,
      "In Progress": 0,
      Completed: 0,
      Closed: 0,
      Rejected: 0
    };

    statusCountsRaw.forEach((row) => {
      if (workOrdersByStatus[row.status] !== undefined) {
        workOrdersByStatus[row.status] = row.count;
      }
    });

    const totalWorkOrders = db.prepare("SELECT COUNT(*) as count FROM work_orders").get().count;

    // 2. Overdue and Escalated Work Orders
    const overdueOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders
      WHERE sla_due_at IS NOT NULL
        AND sla_due_at < ?
        AND status NOT IN ('Completed', 'Closed', 'Rejected')
    `).get(nowIso).count;

    const escalatedOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders
      WHERE escalated = 1
        AND status NOT IN ('Completed', 'Closed', 'Rejected')
    `).get().count;

    // 3. Preventive Maintenance (PM) Compliance Percentage (counts both calendar-days and running-hours triggers)
    const totalPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders
      WHERE type = 'preventive'
    `).get().count;

    const completedPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders
      WHERE type = 'preventive'
        AND status IN ('Completed', 'Closed')
    `).get().count;

    // Breakdown for calendar-days vs running-hours triggers
    const daysPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders w
      LEFT JOIN pm_schedules s ON w.pm_schedule_id = s.id
      WHERE w.type = 'preventive' AND (s.trigger_type = 'days' OR s.trigger_type IS NULL)
    `).get().count;

    const hoursPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders w
      JOIN pm_schedules s ON w.pm_schedule_id = s.id
      WHERE w.type = 'preventive' AND s.trigger_type = 'hours'
    `).get().count;

    const completedDaysPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders w
      LEFT JOIN pm_schedules s ON w.pm_schedule_id = s.id
      WHERE w.type = 'preventive' AND (s.trigger_type = 'days' OR s.trigger_type IS NULL)
        AND w.status IN ('Completed', 'Closed')
    `).get().count;

    const completedHoursPMOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM work_orders w
      JOIN pm_schedules s ON w.pm_schedule_id = s.id
      WHERE w.type = 'preventive' AND s.trigger_type = 'hours'
        AND w.status IN ('Completed', 'Closed')
    `).get().count;

    // If no preventive orders have been created yet, compliance is considered 100% baseline
    const pmCompliancePercentage = totalPMOrders > 0
      ? Math.round((completedPMOrders / totalPMOrders) * 100)
      : 100;

    // 4. Equipment Life Status Breakdown (Red / Amber / Green)
    const equipmentRows = db.prepare("SELECT running_hours, service_life_hours FROM equipment").all();
    const equipmentHealth = {
      green: 0,
      amber: 0,
      red: 0,
      total: equipmentRows.length
    };

    equipmentRows.forEach((eq) => {
      const ratio = eq.service_life_hours > 0 ? eq.running_hours / eq.service_life_hours : 0;
      if (ratio > 1.0) {
        equipmentHealth.red++;
      } else if (ratio >= 0.8) {
        equipmentHealth.amber++;
      } else {
        equipmentHealth.green++;
      }
    });

    // 5. Overdue Compliance and Audit Actions
    const overdueActions = db.prepare(`
      SELECT COUNT(*) as count
      FROM actions
      WHERE due_date < ?
        AND status != 'Verified'
    `).get(nowIso).count;

    const totalActions = db.prepare("SELECT COUNT(*) as count FROM actions").get().count;

    return res.status(200).json({
      workOrders: {
        total: totalWorkOrders,
        byStatus: workOrdersByStatus,
        overdue: overdueOrders,
        escalated: escalatedOrders
      },
      preventiveMaintenance: {
        compliancePercentage: pmCompliancePercentage,
        totalPreventiveOrders: totalPMOrders,
        completedPreventiveOrders: completedPMOrders,
        daysOrders: {
          total: daysPMOrders,
          completed: completedDaysPMOrders
        },
        hoursOrders: {
          total: hoursPMOrders,
          completed: completedHoursPMOrders
        }
      },
      equipmentHealth: {
        green: equipmentHealth.green,
        amber: equipmentHealth.amber,
        red: equipmentHealth.red,
        total: equipmentHealth.total
      },
      complianceActions: {
        total: totalActions,
        overdue: overdueActions
      }
    });
  } catch (error) {
    console.error("[Dashboard] Error computing dashboard stats:", error);
    return res.status(500).json({ error: "Failed to load dashboard statistics." });
  }
});

module.exports = router;

