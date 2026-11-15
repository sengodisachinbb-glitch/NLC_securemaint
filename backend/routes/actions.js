// Compliance and Audit Actions Routes (/api/actions)
// Handles creation (Admin/Manager), progress updates (Owner only), and closure verification (Manager only)

const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();

/**
 * Base query joining action items with owner details
 */
const BASE_ACTION_QUERY = `
  SELECT 
    a.id,
    a.source,
    a.description,
    a.owner_id,
    u.name AS owner_name,
    u.email AS owner_email,
    u.role AS owner_role,
    u.section AS owner_section,
    a.due_date,
    a.status,
    a.evidence_note,
    a.created_at
  FROM actions a
  JOIN users u ON a.owner_id = u.id
`;

/**
 * Helper to compute whether an action item is overdue:
 * An item past due_date and not Verified counts as overdue.
 */
const withOverdueFlag = (action) => {
  if (!action) return null;
  const now = new Date();
  const dueDate = new Date(action.due_date);
  const isOverdue = dueDate < now && action.status !== "Verified";

  return {
    ...action,
    isOverdue
  };
};

/**
 * Helper to fetch a single action item by ID with owner information
 */
const getActionById = (id) => {
  const row = db.prepare(`${BASE_ACTION_QUERY} WHERE a.id = ?`).get(id);
  return withOverdueFlag(row);
};

// ==========================================
// 1. GET /api/actions (All authenticated users)
// ==========================================
router.get("/", authenticate, (req, res) => {
  try {
    const rows = db.prepare(`${BASE_ACTION_QUERY} ORDER BY a.id DESC`).all();
    const actionsWithOverdue = rows.map(withOverdueFlag);

    return res.status(200).json({
      count: actionsWithOverdue.length,
      actions: actionsWithOverdue
    });
  } catch (error) {
    console.error("[Actions] Error fetching action items:", error);
    return res.status(500).json({ error: "Failed to retrieve action items." });
  }
});

// ==========================================
// 2. GET /api/actions/:id (All authenticated users)
// ==========================================
router.get("/:id", authenticate, (req, res) => {
  try {
    const action = getActionById(req.params.id);
    if (!action) {
      return res.status(404).json({ error: `Action item with ID ${req.params.id} not found.` });
    }
    return res.status(200).json({ action });
  } catch (error) {
    console.error("[Actions] Error fetching action item:", error);
    return res.status(500).json({ error: "Failed to retrieve action item." });
  }
});

// ==========================================
// 3. POST /api/actions (Admin and Manager only)
// ==========================================
router.post(
  "/",
  authenticate,
  authorize("Admin", "Manager"),
  [
    body("source").trim().notEmpty().withMessage("Source is required (e.g. 'CAG Report 35 of 2025')."),
    body("description").trim().notEmpty().withMessage("Description is required."),
    body("owner_id").isInt({ gt: 0 }).withMessage("Valid owner_id is required."),
    body("due_date").isISO8601().withMessage("due_date must be a valid date in ISO format (YYYY-MM-DD).")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { source, description, owner_id, due_date } = req.body;

      // Verify owner exists in users table
      const owner = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(owner_id);
      if (!owner) {
        return res.status(404).json({ error: `Owner user with ID ${owner_id} not found.` });
      }

      const insertStmt = db.prepare(`
        INSERT INTO actions (source, description, owner_id, due_date, status)
        VALUES (?, ?, ?, ?, 'Open')
      `);

      const result = insertStmt.run(
        source.trim(),
        description.trim(),
        Number(owner_id),
        due_date
      );

      const createdAction = getActionById(result.lastInsertRowid);

      // Log in cryptographic audit log
      logAudit(req.user.id, "ACTION_CREATED", "actions", {
        id: createdAction.id,
        source: createdAction.source,
        description: createdAction.description,
        owner_id: createdAction.owner_id,
        owner_name: createdAction.owner_name,
        due_date: createdAction.due_date,
        status: createdAction.status
      });

      return res.status(201).json({
        message: "Action item created successfully.",
        action: createdAction
      });
    } catch (error) {
      console.error("[Actions] Error creating action item:", error);
      return res.status(500).json({ error: "Failed to create action item." });
    }
  }
);

// ==========================================
// 4. PATCH /api/actions/:id/progress (Owner only)
// ==========================================
router.patch(
  "/:id/progress",
  authenticate,
  [
    body("status")
      .optional()
      .isIn(["Open", "In Progress", "Done"])
      .withMessage("Status must be one of: 'Open', 'In Progress', 'Done'. Verification is reserved for Managers."),
    body("evidence_note")
      .optional()
      .isString()
      .withMessage("evidence_note must be text.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const action = getActionById(req.params.id);
      if (!action) {
        return res.status(404).json({ error: `Action item with ID ${req.params.id} not found.` });
      }

      // Security Check: Only the assigned owner can update progress (Admin not allowed unless owner)
      if (req.user.id !== action.owner_id) {
        return res.status(403).json({
          error: `Forbidden: Only the assigned action owner (${action.owner_name}) can update progress on this item.`
        });
      }

      // Cannot update progress if already verified
      if (action.status === "Verified") {
        return res.status(400).json({
          error: "This action item has already been Verified and closed. It cannot be modified."
        });
      }

      const { status, evidence_note } = req.body;
      const newStatus = status || action.status;
      const newEvidenceNote = evidence_note !== undefined ? evidence_note.trim() : action.evidence_note;

      db.prepare(`
        UPDATE actions 
        SET status = ?, evidence_note = ?
        WHERE id = ?
      `).run(newStatus, newEvidenceNote, action.id);

      // Audit log
      logAudit(req.user.id, "ACTION_PROGRESS_UPDATED", "actions", {
        id: action.id,
        from_status: action.status,
        to_status: newStatus,
        evidence_note: newEvidenceNote
      });

      const updatedAction = getActionById(action.id);
      return res.status(200).json({
        message: "Action progress updated successfully.",
        action: updatedAction
      });
    } catch (error) {
      console.error("[Actions] Progress update error:", error);
      return res.status(500).json({ error: "Failed to update action progress." });
    }
  }
);

// ==========================================
// 5. PATCH /api/actions/:id/verify (Manager only)
// ==========================================
router.patch(
  "/:id/verify",
  authenticate,
  authorize("Manager"),
  (req, res) => {
    try {
      const action = getActionById(req.params.id);
      if (!action) {
        return res.status(404).json({ error: `Action item with ID ${req.params.id} not found.` });
      }

      // Segregation of duties: Verifier cannot be the action's assigned owner
      if (action.owner_id === req.user.id) {
        return res.status(403).json({
          error: "Forbidden: You cannot verify closure of an action item you own (segregation of duties enforced)."
        });
      }

      const verifiedStatus = "Verified";
      const now = new Date().toISOString();
      const verificationNote = req.body.verification_note
        ? ` [Verified by ${req.user.name} on ${now}: ${req.body.verification_note}]`
        : ` [Verified by ${req.user.name} on ${now}]`;

      const updatedEvidence = (action.evidence_note || "") + verificationNote;

      db.prepare(`
        UPDATE actions 
        SET status = ?, evidence_note = ?
        WHERE id = ?
      `).run(verifiedStatus, updatedEvidence.trim(), action.id);

      // Audit log
      logAudit(req.user.id, "ACTION_VERIFIED", "actions", {
        id: action.id,
        previous_status: action.status,
        status: verifiedStatus,
        verified_by: req.user.id,
        verifier_role: req.user.role
      });

      const verifiedAction = getActionById(action.id);
      return res.status(200).json({
        message: "Action item closure verified successfully.",
        action: verifiedAction
      });
    } catch (error) {
      console.error("[Actions] Verification error:", error);
      return res.status(500).json({ error: "Failed to verify action closure." });
    }
  }
);

module.exports = router;

