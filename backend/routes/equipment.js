// Equipment Management Routes (/api/equipment)
// Provides listing with lifecycle calculation, plus create and update operations

const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();

/**
 * Helper function to compute lifeStatus based on running vs service life hours:
 * - "Green": under 80% of service life
 * - "Amber": between 80% and 100% of service life
 * - "Red": above 100% of service life
 */
const computeLifeStatus = (runningHours, serviceLifeHours) => {
  if (!serviceLifeHours || serviceLifeHours <= 0) {
    return "Green";
  }
  const usageRatio = runningHours / serviceLifeHours;
  if (usageRatio > 1.0) {
    return "Red";
  } else if (usageRatio >= 0.8) {
    return "Amber";
  } else {
    return "Green";
  }
};

/**
 * Validation rules for creating and updating equipment
 */
const equipmentValidationRules = [
  body("code")
    .trim()
    .notEmpty()
    .withMessage("Equipment code is required."),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Equipment name is required."),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("Equipment type is required."),
  body("location")
    .trim()
    .notEmpty()
    .withMessage("Equipment location is required."),
  body("section")
    .trim()
    .notEmpty()
    .withMessage("Equipment section is required."),
  body("running_hours")
    .isFloat({ min: 0 })
    .withMessage("running_hours must be a non-negative number."),
  body("service_life_hours")
    .isFloat({ gt: 0 })
    .withMessage("service_life_hours must be a number greater than 0."),
  body("last_service_date")
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage("last_service_date must be a valid date in YYYY-MM-DD format.")
];

/**
 * Middleware to check validation results from express-validator
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * GET /api/equipment
 * Accessible by all authenticated roles (Admin, Manager, Supervisor, Technician, Requester)
 * Returns all equipment with computed 'lifeStatus' (Green, Amber, Red).
 */
router.get("/", authenticate, (req, res) => {
  try {
    // Parameterized query to fetch all equipment ordered by ID
    const rows = db.prepare("SELECT * FROM equipment ORDER BY id ASC").all();

    // Map each item and append the computed lifeStatus
    const equipmentWithStatus = rows.map((item) => ({
      ...item,
      lifeStatus: computeLifeStatus(item.running_hours, item.service_life_hours)
    }));

    return res.status(200).json({ equipment: equipmentWithStatus });
  } catch (error) {
    console.error("[Equipment] Error fetching equipment:", error);
    return res.status(500).json({ error: "Failed to retrieve equipment." });
  }
});

/**
 * POST /api/equipment
 * Accessible by Admin and Manager only
 * Creates a new equipment entry.
 */
router.post(
  "/",
  authenticate,
  authorize("Admin", "Manager"),
  equipmentValidationRules,
  handleValidationErrors,
  (req, res) => {
    try {
      const {
        code,
        name,
        type,
        location,
        section,
        running_hours,
        service_life_hours,
        last_service_date
      } = req.body;

      // Check if equipment code already exists
      const existing = db.prepare("SELECT id FROM equipment WHERE code = ?").get(code);
      if (existing) {
        return res.status(409).json({ error: `Equipment with code '${code}' already exists.` });
      }

      // Insert new equipment using parameterized query
      const stmt = db.prepare(`
        INSERT INTO equipment (code, name, type, location, section, running_hours, service_life_hours, last_service_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        code.trim(),
        name.trim(),
        type.trim(),
        location.trim(),
        section.trim(),
        Number(running_hours),
        Number(service_life_hours),
        last_service_date || null
      );

      // Fetch the newly created record
      const createdItem = db.prepare("SELECT * FROM equipment WHERE id = ?").get(result.lastInsertRowid);

      // Record audit log entry
      logAudit(req.user.id, "EQUIPMENT_CREATE", "equipment", {
        id: createdItem.id,
        code: createdItem.code,
        name: createdItem.name,
        section: createdItem.section
      });

      return res.status(201).json({
        message: "Equipment created successfully.",
        equipment: {
          ...createdItem,
          lifeStatus: computeLifeStatus(createdItem.running_hours, createdItem.service_life_hours)
        }
      });
    } catch (error) {
      console.error("[Equipment] Error creating equipment:", error);
      return res.status(500).json({ error: "Failed to create equipment." });
    }
  }
);

/**
 * PUT /api/equipment/:id and PUT /api/equipment
 * Accessible by Admin and Manager only
 * Updates existing equipment item by ID.
 */
const updateEquipmentHandler = (req, res) => {
  try {
    const equipmentId = req.params.id || req.body.id;

    if (!equipmentId) {
      return res.status(400).json({ error: "Equipment ID is required in URL parameter or body." });
    }

    // Check if equipment exists
    const current = db.prepare("SELECT * FROM equipment WHERE id = ?").get(equipmentId);
    if (!current) {
      return res.status(404).json({ error: `Equipment with ID ${equipmentId} not found.` });
    }

    const {
      code,
      name,
      type,
      location,
      section,
      running_hours,
      service_life_hours,
      last_service_date
    } = req.body;

    // Check if another equipment already uses the updated code
    const duplicateCode = db.prepare("SELECT id FROM equipment WHERE code = ? AND id != ?").get(code, equipmentId);
    if (duplicateCode) {
      return res.status(409).json({ error: `Equipment code '${code}' is already used by another item.` });
    }

    // Update equipment record using parameterized query
    db.prepare(`
      UPDATE equipment
      SET code = ?, name = ?, type = ?, location = ?, section = ?, running_hours = ?, service_life_hours = ?, last_service_date = ?
      WHERE id = ?
    `).run(
      code.trim(),
      name.trim(),
      type.trim(),
      location.trim(),
      section.trim(),
      Number(running_hours),
      Number(service_life_hours),
      last_service_date || null,
      equipmentId
    );

    // Fetch updated record
    const updatedItem = db.prepare("SELECT * FROM equipment WHERE id = ?").get(equipmentId);

    // Record audit log entry
    logAudit(req.user.id, "EQUIPMENT_UPDATE", "equipment", {
      id: equipmentId,
      code: updatedItem.code,
      name: updatedItem.name,
      running_hours: updatedItem.running_hours,
      service_life_hours: updatedItem.service_life_hours
    });

    return res.status(200).json({
      message: "Equipment updated successfully.",
      equipment: {
        ...updatedItem,
        lifeStatus: computeLifeStatus(updatedItem.running_hours, updatedItem.service_life_hours)
      }
    });
  } catch (error) {
    console.error("[Equipment] Error updating equipment:", error);
    return res.status(500).json({ error: "Failed to update equipment." });
  }
};

router.put(
  "/:id",
  authenticate,
  authorize("Admin", "Manager"),
  equipmentValidationRules,
  handleValidationErrors,
  updateEquipmentHandler
);

router.put(
  "/",
  authenticate,
  authorize("Admin", "Manager"),
  equipmentValidationRules,
  handleValidationErrors,
  updateEquipmentHandler
);

module.exports = router;
