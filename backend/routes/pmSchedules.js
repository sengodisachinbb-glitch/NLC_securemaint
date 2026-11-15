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
    COALESCE(e.running_hours, 0) AS equipment_running_hours,
    s.task,
    COALESCE(s.trigger_type, 'days') AS trigger_type,
    s.interval_days,
    s.interval_hours,
    s.last_done,
    COALESCE(s.last_done_hours, 0) AS last_done_hours,
    s.next_due,
    s.created_at
  FROM pm_schedules s
  JOIN equipment e ON s.equipment_id = e.id
`;

/**
 * GET /api/pm-schedules
 * Accessible by Manager and Admin
 * Returns all active PM schedules with hours_remaining calculated for hours-based schedules
 */
router.get("/", authenticate, authorize("Manager", "Admin"), (req, res) => {
  try {
    const rawSchedules = db.prepare(`${BASE_SCHEDULE_QUERY} ORDER BY s.id DESC`).all();
    const schedules = rawSchedules.map((s) => {
      const triggerType = s.trigger_type || "days";
      let hoursRemaining = null;
      if (triggerType === "hours" && s.interval_hours) {
        const threshold = (s.last_done_hours || 0) + Number(s.interval_hours);
        hoursRemaining = Math.max(0, threshold - (s.equipment_running_hours || 0));
      }
      return {
        ...s,
        trigger_type: triggerType,
        hours_remaining: hoursRemaining
      };
    });

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
 * Body: { equipment_id, task, trigger_type, interval_days, interval_hours, last_done_hours, next_due }
 */
router.post(
  "/",
  authenticate,
  authorize("Manager", "Admin"),
  [
    body("equipment_id").isInt({ gt: 0 }).withMessage("Valid equipment_id is required."),
    body("task").trim().notEmpty().withMessage("Task description is required."),
    body("trigger_type")
      .optional()
      .isIn(["days", "hours"])
      .withMessage("trigger_type must be either 'days' or 'hours'."),
    body("interval_days")
      .if(body("trigger_type").not().equals("hours"))
      .isInt({ gt: 0 })
      .withMessage("For day schedules, interval_days must be a positive integer greater than 0."),
    body("interval_hours")
      .if(body("trigger_type").equals("hours"))
      .isInt({ gt: 0 })
      .withMessage("For hours schedules, interval_hours must be a positive integer greater than 0."),
    body("next_due")
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage("next_due must be a valid ISO date.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        equipment_id,
        task,
        trigger_type = "days",
        interval_days,
        interval_hours,
        last_done_hours,
        next_due
      } = req.body;

      // Verify equipment exists
      const equipment = db.prepare("SELECT id, code, name, COALESCE(running_hours, 0) as running_hours FROM equipment WHERE id = ?").get(equipment_id);
      if (!equipment) {
        return res.status(404).json({ error: `Equipment with ID ${equipment_id} not found.` });
      }

      let intervalDaysVal = null;
      let intervalHoursVal = null;
      let lastDoneHoursVal = 0;
      let nextDueTimestamp = null;

      if (trigger_type === "hours") {
        if (!interval_hours || Number(interval_hours) <= 0) {
          return res.status(400).json({ error: "For hours schedules, interval_hours must be a positive integer greater than 0." });
        }
        intervalHoursVal = Number(interval_hours);
        lastDoneHoursVal = last_done_hours !== undefined ? Number(last_done_hours) : (equipment.running_hours || 0);
      } else {
        if (!interval_days || Number(interval_days) <= 0) {
          return res.status(400).json({ error: "For day schedules, interval_days must be a positive integer greater than 0." });
        }
        intervalDaysVal = Number(interval_days);
        nextDueTimestamp = next_due || calculateNextDue(interval_days);
      }

      const insertStmt = db.prepare(`
        INSERT INTO pm_schedules (
          equipment_id,
          task,
          trigger_type,
          interval_days,
          interval_hours,
          last_done_hours,
          next_due
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        Number(equipment_id),
        task.trim(),
        trigger_type,
        intervalDaysVal,
        intervalHoursVal,
        lastDoneHoursVal,
        nextDueTimestamp
      );

      const createdSchedule = db.prepare(`${BASE_SCHEDULE_QUERY} WHERE s.id = ?`).get(result.lastInsertRowid);
      const hoursRemaining = createdSchedule.trigger_type === "hours" && createdSchedule.interval_hours
        ? Math.max(0, (createdSchedule.last_done_hours + createdSchedule.interval_hours) - createdSchedule.equipment_running_hours)
        : null;

      const scheduleResponse = {
        ...createdSchedule,
        hours_remaining: hoursRemaining
      };

      // Audit log
      logAudit(req.user.id, "PM_SCHEDULE_CREATE", "pm_schedules", {
        id: createdSchedule.id,
        equipment_id: createdSchedule.equipment_id,
        task: createdSchedule.task,
        trigger_type: createdSchedule.trigger_type,
        interval_days: createdSchedule.interval_days,
        interval_hours: createdSchedule.interval_hours,
        last_done_hours: createdSchedule.last_done_hours,
        next_due: createdSchedule.next_due
      });

      return res.status(201).json({
        message: "Preventive maintenance schedule created successfully.",
        schedule: scheduleResponse
      });
    } catch (error) {
      console.error("[PMSchedules] Error creating schedule:", error);
      return res.status(500).json({ error: "Failed to create PM schedule." });
    }
  }
);

module.exports = router;
