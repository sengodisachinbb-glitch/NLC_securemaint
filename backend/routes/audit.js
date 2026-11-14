// Audit Log Routes (/api/audit)
// Provides audit trail view and cryptographic chain integrity verification (Admin only)

const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");
const { verifyAuditChain, getAnchor } = require("../audit");

const router = express.Router();

/**
 * GET /api/audit/verify
 * Restricted to Admin role
 * Traverses and recomputes the entire SHA-256 hash chain to verify audit integrity.
 */
router.get("/verify", authenticate, authorize("Admin"), (req, res) => {
  try {
    const result = verifyAuditChain();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[Audit] Error during chain verification:", error);
    return res.status(500).json({ error: "Failed to verify audit log chain." });
  }
});

/**
 * GET /api/audit
 * Restricted to Admin role
 * Returns all audit log entries ordered newest first.
 */
router.get("/", authenticate, authorize("Admin"), (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT 
        a.id, 
        a.timestamp, 
        a.user_id, 
        u.email as user_email,
        u.name as user_name,
        a.action, 
        a.entity, 
        a.details, 
        a.prev_hash, 
        a.hash
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.id DESC
    `).all();

    // Parse JSON details string for cleaner frontend/client consumption
    const parsedLogs = logs.map((log) => {
      let parsedDetails = log.details;
      try {
        parsedDetails = JSON.parse(log.details);
      } catch (e) {
        // Leave as string if not valid JSON
      }
      return {
        ...log,
        details: parsedDetails
      };
    });

    return res.status(200).json({
      count: parsedLogs.length,
      anchor: getAnchor(),
      auditLogs: parsedLogs
    });
  } catch (error) {
    console.error("[Audit] Error fetching audit logs:", error);
    return res.status(500).json({ error: "Failed to fetch audit log entries." });
  }
});

module.exports = router;

