// Preventive Maintenance Schedule Routes (/api/pm-schedules)
// Allows Managers and Admins to manage recurring equipment maintenance routines

require("dotenv").config();
const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { logAudit } = require("../audit");
const { calculateNextDue, isDemoMode } = require("../cron");

const router = express.Router();

/**
 * Base query for PM schedules
 */
const BASE_SCHEDULE_QUERY = `
  SELECT 
    s.id,
    s.equipment_id,
    e.code AS equipment_code,
    e.name AS equipment_name,
    e.location AS equipment_location,
    e.section AS equipment_section,
    s.task,
    s.interval_days,
    s.last_done,
    s.next_due
  FROM pm_schedules s
  JOIN equipment e ON s.equipment_id = e.id
`;

/**
 * GET /api/pm-schedules
 * Accessible by Manager and Admin
 * Returns all active PM schedules
 */
router.get("/", authenticate, authorize("Manager", "Admin"), (req, res) => {
  try {
    const schedules = db.prepare(`${BASE_SCHEDULE_QUERY} ORDER BY s.id DESC`).all();
    return res.status(200).json({
      demoMode: isDemoMode(),
      intervalUnit: isDemoMode() ? "minutes" : "days",
      count: schedules.length,
      schedules
    });
  } catch (error) {
    console.error("[PMSchedules] Error fetching schedules:", error);
    return res.status(500).json({ error: "Failed to fetch PM schedules." });
  }
});

/**
 * POST /api/pm-schedules
 * Accessible by Manager and Admin
 * Creates a new PM schedule.
 * Body: { equipment_id, task, interval_days, next_due }
 */
router.post(
  "/",
  authenticate,
  authorize("Manager", "Admin"),
  [
    body("equipment_id").isInt({ gt: 0 }).withMessage("Valid equipment_id is required."),
    body("task").trim().notEmpty().withMessage("Task description is required."),
    body("interval_days").isInt({ gt: 0 }).withMessage("interval_days must be a positive integer."),
    body("next_due").optional({ checkFalsy: true }).isISO8601().withMessage("next_due must be a valid ISO date.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { equipment_id, task, interval_days, next_due } = req.body;

      // Verify equipment exists
      const equipment = db.prepare("SELECT id, code, name FROM equipment WHERE id = ?").get(equipment_id);
      if (!equipment) {
        return res.status(404).json({ error: `Equipment with ID ${equipment_id} not found.` });
      }

      // If next_due is not specified by user, compute automatically
      const nextDueTimestamp = next_due || calculateNextDue(interval_days);

      const insertStmt = db.prepare(`
        INSERT INTO pm_schedules (equipment_id, task, interval_days, next_due)
        VALUES (?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        Number(equipment_id),
        task.trim(),
        Number(interval_days),
        nextDueTimestamp
      );

      const createdSchedule = db.prepare(`${BASE_SCHEDULE_QUERY} WHERE s.id = ?`).get(result.lastInsertRowid);

      // Audit log
      logAudit(req.user.id, "PM_SCHEDULE_CREATE", "pm_schedules", {
        id: createdSchedule.id,
        equipment_id: createdSchedule.equipment_id,
        task: createdSchedule.task,
        interval_days: createdSchedule.interval_days,
        next_due: createdSchedule.next_due
      });

      return res.status(201).json({
        message: "Preventive maintenance schedule created successfully.",
        schedule: createdSchedule
      });
    } catch (error) {
      console.error("[PMSchedules] Error creating schedule:", error);
      return res.status(500).json({ error: "Failed to create PM schedule." });
    }
  }
);

module.exports = router;
