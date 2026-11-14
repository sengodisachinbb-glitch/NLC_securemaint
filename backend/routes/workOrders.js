// Work Order Management Routes (/api/work-orders)
// Handles creation, role-based filtering, lifecycle status actions, and SLA assignment

const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { logAudit } = require("../audit");

const router = express.Router();

/**
 * Single source of truth for allowed lifecycle transitions.
 * Any state transition not explicitly listed here is rejected.
 */
const ALLOWED_TRANSITIONS = {
  Submitted: ["Approved", "Rejected"],
  Approved: ["Assigned"],
  Assigned: ["In Progress"],
  "In Progress": ["Completed"],
  Completed: ["Closed", "In Progress"], // Closed via verify-close; In Progress via reopen
  Closed: ["In Progress"],              // In Progress via reopen
  Rejected: []                          // Terminal state
};

/**
 * Priority-to-SLA configuration
 */
const SLA_DURATIONS_MS = {
  Critical: 4 * 60 * 60 * 1000,        // 4 hours
  High: 24 * 60 * 60 * 1000,           // 24 hours
  Medium: 3 * 24 * 60 * 60 * 1000,     // 3 days
  Low: 7 * 24 * 60 * 60 * 1000         // 7 days
};

/**
 * Base SELECT query for rich work order representation
 */
const BASE_WORK_ORDER_QUERY = `
  SELECT 
    w.id,
    w.title,
    w.description,
    w.equipment_id,
    e.code AS equipment_code,
    e.name AS equipment_name,
    e.location AS equipment_location,
    e.section AS equipment_section,
    w.requester_id,
    req_u.name AS requester_name,
    req_u.email AS requester_email,
    w.technician_id,
    tech_u.name AS technician_name,
    tech_u.email AS technician_email,
    w.priority,
    w.status,
    w.type,
    w.sla_due_at,
    w.escalated,
    w.created_at,
    w.updated_at,
    w.closed_at
  FROM work_orders w
  JOIN equipment e ON w.equipment_id = e.id
  JOIN users req_u ON w.requester_id = req_u.id
  LEFT JOIN users tech_u ON w.technician_id = tech_u.id
`;

/**
 * Helper to fetch a single work order by ID
 */
const getWorkOrderById = (id) => {
  return db.prepare(`${BASE_WORK_ORDER_QUERY} WHERE w.id = ?`).get(id);
};

/**
 * Helper to validate status transitions
 */
const validateTransition = (currentStatus, targetStatus) => {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
};

// ==========================================
// 1. POST /api/work-orders (Any role)
// ==========================================
router.post(
  "/",
  authenticate,
  [
    body("title").trim().notEmpty().withMessage("Title is required."),
    body("equipment_id").isInt({ gt: 0 }).withMessage("Valid equipment_id is required."),
    body("type")
      .optional()
      .isIn(["corrective", "preventive"])
      .withMessage("Type must be either 'corrective' or 'preventive'.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, equipment_id, type } = req.body;

      // Verify equipment exists
      const equipment = db.prepare("SELECT id FROM equipment WHERE id = ?").get(equipment_id);
      if (!equipment) {
        return res.status(404).json({ error: `Equipment with ID ${equipment_id} not found.` });
      }

      const workOrderType = type || "corrective";
      const initialStatus = "Submitted";
      const initialPriority = "Medium";

      const insertStmt = db.prepare(`
        INSERT INTO work_orders (title, description, equipment_id, requester_id, priority, status, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        title.trim(),
        description ? description.trim() : null,
        Number(equipment_id),
        req.user.id,
        initialPriority,
        initialStatus,
        workOrderType
      );

      const createdOrder = getWorkOrderById(result.lastInsertRowid);

      // Audit log
      logAudit(req.user.id, "WORK_ORDER_CREATE", "work_orders", {
        id: createdOrder.id,
        title: createdOrder.title,
        equipment_id: createdOrder.equipment_id,
        status: createdOrder.status,
        type: createdOrder.type
      });

      return res.status(201).json({
        message: "Work order created successfully.",
        workOrder: createdOrder
      });
    } catch (error) {
      console.error("[WorkOrders] Error creating work order:", error);
      return res.status(500).json({ error: "Failed to create work order." });
    }
  }
);

// ==========================================
// 2. GET /api/work-orders (Filtered by role)
// ==========================================
router.get("/", authenticate, (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let rows;

    if (role === "Requester") {
      // Requesters see only their own submitted orders
      rows = db.prepare(`${BASE_WORK_ORDER_QUERY} WHERE w.requester_id = ? ORDER BY w.id DESC`).all(userId);
    } else if (role === "Technician") {
      // Technicians see only orders assigned to them
      rows = db.prepare(`${BASE_WORK_ORDER_QUERY} WHERE w.technician_id = ? ORDER BY w.id DESC`).all(userId);
    } else {
      // Admin, Manager, Supervisor see all work orders
      rows = db.prepare(`${BASE_WORK_ORDER_QUERY} ORDER BY w.id DESC`).all();
    }

    return res.status(200).json({ count: rows.length, workOrders: rows });
  } catch (error) {
    console.error("[WorkOrders] Error fetching work orders:", error);
    return res.status(500).json({ error: "Failed to fetch work orders." });
  }
});

// ==========================================
// 3. GET /api/work-orders/:id
// ==========================================
router.get("/:id", authenticate, (req, res) => {
  try {
    const orderId = req.params.id;
    const order = getWorkOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: `Work order with ID ${orderId} not found.` });
    }

    // Role-based view authorization
    const { role, id: userId } = req.user;
    if (role === "Requester" && order.requester_id !== userId) {
      return res.status(403).json({ error: "Forbidden: You can only view work orders requested by you." });
    }
    if (role === "Technician" && order.technician_id !== userId) {
      return res.status(403).json({ error: "Forbidden: You can only view work orders assigned to you." });
    }

    return res.status(200).json({ workOrder: order });
  } catch (error) {
    console.error("[WorkOrders] Error fetching work order:", error);
    return res.status(500).json({ error: "Failed to fetch work order." });
  }
});

// ==========================================
// 4. Status Transition Actions (PATCH)
// ==========================================

/**
 * PATCH /api/work-orders/:id/approve (Supervisor & Admin)
 * Transition: Submitted -> Approved
 */
router.patch("/:id/approve", authenticate, authorize("Supervisor", "Admin"), (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    const targetStatus = "Approved";
    if (!validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
      });
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, now, order.id);

    logAudit(req.user.id, "WORK_ORDER_APPROVED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order approved successfully.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Approve error:", error);
    return res.status(500).json({ error: "Failed to approve work order." });
  }
});

/**
 * PATCH /api/work-orders/:id/reject (Supervisor & Admin)
 * Transition: Submitted -> Rejected
 */
router.patch("/:id/reject", authenticate, authorize("Supervisor", "Admin"), (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    const targetStatus = "Rejected";
    if (!validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
      });
    }

    const now = new Date().toISOString();
    const reason = req.body.reason || "Rejected by supervisor";

    db.prepare("UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, now, order.id);

    logAudit(req.user.id, "WORK_ORDER_REJECTED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus,
      reason
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order rejected.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Reject error:", error);
    return res.status(500).json({ error: "Failed to reject work order." });
  }
});

/**
 * PATCH /api/work-orders/:id/assign (Manager & Admin)
 * Transition: Approved -> Assigned
 * Body: { technician_id, priority: "Critical" | "High" | "Medium" | "Low" }
 * Computes SLA: Critical 4h, High 24h, Medium 3d, Low 7d.
 */
router.patch(
  "/:id/assign",
  authenticate,
  authorize("Manager", "Admin"),
  [
    body("technician_id").isInt({ gt: 0 }).withMessage("Valid technician_id is required."),
    body("priority")
      .isIn(["Critical", "High", "Medium", "Low"])
      .withMessage("Priority must be one of: Critical, High, Medium, Low.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const order = getWorkOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "Work order not found." });

      const targetStatus = "Assigned";
      if (!validateTransition(order.status, targetStatus)) {
        return res.status(400).json({
          error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
        });
      }

      const { technician_id, priority } = req.body;

      // Verify technician exists and has Technician role
      const technician = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(technician_id);
      if (!technician) {
        return res.status(404).json({ error: `User with ID ${technician_id} not found.` });
      }
      if (technician.role !== "Technician" && technician.role !== "Admin") {
        return res.status(400).json({ error: `User '${technician.name}' has role '${technician.role}', must be 'Technician'.` });
      }

      // Compute SLA due time
      const durationMs = SLA_DURATIONS_MS[priority];
      const slaDueAt = new Date(Date.now() + durationMs).toISOString();
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE work_orders 
        SET technician_id = ?, priority = ?, sla_due_at = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(Number(technician_id), priority, slaDueAt, targetStatus, now, order.id);

      logAudit(req.user.id, "WORK_ORDER_ASSIGNED", "work_orders", {
        id: order.id,
        technician_id,
        technician_name: technician.name,
        priority,
        sla_due_at: slaDueAt
      });

      const updated = getWorkOrderById(order.id);
      return res.status(200).json({ message: "Work order assigned successfully.", workOrder: updated });
    } catch (error) {
      console.error("[WorkOrders] Assign error:", error);
      return res.status(500).json({ error: "Failed to assign work order." });
    }
  }
);

/**
 * PATCH /api/work-orders/:id/start (Assigned Technician or Admin)
 * Transition: Assigned -> In Progress
 */
router.patch("/:id/start", authenticate, (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    // Must be assigned technician or Admin
    if (req.user.role !== "Admin" && order.technician_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden: Only the assigned technician can start this work order." });
    }

    const targetStatus = "In Progress";
    if (order.status !== "Assigned" || !validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. A work order can only be started when its status is 'Assigned'.`
      });
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, now, order.id);

    logAudit(req.user.id, "WORK_ORDER_STARTED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order started.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Start error:", error);
    return res.status(500).json({ error: "Failed to start work order." });
  }
});

/**
 * PATCH /api/work-orders/:id/complete (Assigned Technician or Admin)
 * Transition: In Progress -> Completed
 */
router.patch("/:id/complete", authenticate, (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    // Must be assigned technician or Admin
    if (req.user.role !== "Admin" && order.technician_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden: Only the assigned technician can complete this work order." });
    }

    const targetStatus = "Completed";
    if (!validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
      });
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?").run(targetStatus, now, order.id);

    logAudit(req.user.id, "WORK_ORDER_COMPLETED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order marked completed. Awaiting requester verification.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Complete error:", error);
    return res.status(500).json({ error: "Failed to complete work order." });
  }
});

/**
 * PATCH /api/work-orders/:id/verify-close (Requester or Admin)
 * Transition: Completed -> Closed
 */
router.patch("/:id/verify-close", authenticate, (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    // Must be original requester or Admin
    if (req.user.role !== "Admin" && order.requester_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden: Only the original requester can verify and close this work order." });
    }

    const targetStatus = "Closed";
    if (!validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
      });
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE work_orders SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?").run(
      targetStatus,
      now,
      now,
      order.id
    );

    logAudit(req.user.id, "WORK_ORDER_VERIFIED_CLOSED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus,
      closed_at: now
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order verified and closed.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Verify-close error:", error);
    return res.status(500).json({ error: "Failed to close work order." });
  }
});

/**
 * PATCH /api/work-orders/:id/reopen (Requester or Admin)
 * Transition: Completed -> In Progress (or Closed -> In Progress)
 */
router.patch("/:id/reopen", authenticate, (req, res) => {
  try {
    const order = getWorkOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Work order not found." });

    // Must be original requester or Admin
    if (req.user.role !== "Admin" && order.requester_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden: Only the original requester can reopen this work order." });
    }

    const targetStatus = "In Progress";
    if (!validateTransition(order.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal status transition from '${order.status}' to '${targetStatus}'. Allowed from '${order.status}': [${(ALLOWED_TRANSITIONS[order.status] || []).join(", ")}]`
      });
    }

    const now = new Date().toISOString();
    const reason = req.body.reason || "Requester requested rework";

    db.prepare("UPDATE work_orders SET status = ?, closed_at = NULL, updated_at = ? WHERE id = ?").run(
      targetStatus,
      now,
      order.id
    );

    logAudit(req.user.id, "WORK_ORDER_REOPENED", "work_orders", {
      id: order.id,
      from: order.status,
      to: targetStatus,
      reason
    });

    const updated = getWorkOrderById(order.id);
    return res.status(200).json({ message: "Work order reopened for rework.", workOrder: updated });
  } catch (error) {
    console.error("[WorkOrders] Reopen error:", error);
    return res.status(500).json({ error: "Failed to reopen work order." });
  }
});

module.exports = router;
