// Admin Tamper-Evident Audit Trail Page (/audit)
// Provides audit trail inspection and on-demand cryptographic hash chain verification (Admin only)

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const Audit = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const isAdmin = user?.role === "Admin";

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get("/audit");
      setLogs(res.data.auditLogs || []);
      setAnchor(res.data.anchor || null);
      setError("");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.status === 403
          ? "Access denied. Audit logs and chain verification are restricted to Administrator role."
          : "Failed to load audit logs."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleVerifyIntegrity = async () => {
    try {
      setVerifying(true);
      setVerificationResult(null);
      const res = await api.get("/audit/verify");
      setVerificationResult(res.data);
      if (res.data.anchor) {
        setAnchor(res.data.anchor);
      }
    } catch (err) {
      console.error(err);
      setVerificationResult({
        valid: false,
        message: err.response?.data?.message || "Verification request failed."
      });
      if (err.response?.data?.anchor) {
        setAnchor(err.response.data.anchor);
      }
    } finally {
      setVerifying(false);
    }
  };

  const copyAnchorHash = () => {
    if (anchor?.hash) {
      navigator.clipboard.writeText(anchor.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#dc2626", marginBottom: "8px" }}>
          Restricted Security Zone
        </h2>
        <p style={{ color: "#64748b" }}>
          The cryptographic audit trail and hash chain verification are strictly restricted to <strong>Admin</strong> users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>
            Cryptographic Audit Trail
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Tamper-evident blockchain-style SHA-256 hash log of all critical system actions
          </p>
        </div>

        <button
          onClick={handleVerifyIntegrity}
          disabled={verifying}
          className="btn-primary"
          style={{
            width: "auto",
            padding: "9px 20px",
            backgroundColor: "#059669",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          {verifying ? "Recomputing SHA-256 Chain..." : "🔒 Verify Chain Integrity"}
        </button>
      </div>

      {/* Separate anchor file Status Card */}
      <div
        className="card"
        style={{
          marginBottom: "20px",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          padding: "18px 20px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.25rem" }}>⚓</span>
              <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--nlc-primary)", margin: 0 }}>
                Separate anchor file
              </h3>
              <code style={{ fontSize: "0.75rem", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px" }}>
                backend/anchor.json
              </code>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  backgroundColor: verificationResult
                    ? verificationResult.valid
                      ? "#dcfce7"
                      : "#fee2e2"
                    : "#e0f2fe",
                  color: verificationResult
                    ? verificationResult.valid
                      ? "#15803d"
                      : "#b91c1c"
                    : "#0369a1"
                }}
              >
                {verificationResult
                  ? verificationResult.valid
                    ? "✓ ANCHOR SYNCHRONIZED"
                    : "⚠ ANCHOR MISMATCH"
                  : "FILE-BACKED ANCHOR"}
              </span>
            </div>
            <p style={{ fontSize: "0.825rem", color: "#64748b", marginTop: "6px", maxWidth: "600px" }}>
              Independent state stored outside SQLite. Ensures deleted tail rows (truncation attacks) and row rewrites cannot be concealed by tampering with the database.
            </p>
          </div>

          <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: "600" }}>
                Anchor Row ID
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
                #{anchor?.row_id ?? (logs[0]?.id || 0)}
              </div>
            </div>

            <div style={{ textAlign: "right", borderLeft: "1px solid #cbd5e1", paddingLeft: "20px" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: "600" }}>
                Database Log Count
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
                {logs.length}
              </div>
            </div>
          </div>
        </div>

        {/* Highlighted Anchor Hash Display for Screenshotting & Note-Taking */}
        <div
          style={{
            marginTop: "14px",
            background: "#ffffff",
            padding: "12px 16px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "#475569", letterSpacing: "0.5px" }}>
              OFFICIAL ANCHOR SHA-256 HASH (FOR AUDITOR NOTEBOOK &amp; SCREENSHOTS):
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Last Anchored: {anchor?.timestamp ? new Date(anchor.timestamp).toLocaleString() : "-"}
              </span>
              <button
                type="button"
                onClick={copyAnchorHash}
                className="btn-quick-fill"
                style={{ fontSize: "0.7rem", padding: "3px 8px" }}
              >
                {copied ? "Copied!" : "Copy Hash"}
              </button>
            </div>
          </div>

          <div
            style={{
              fontFamily: "monospace",
              fontSize: "0.875rem",
              fontWeight: "700",
              color: "#0a2540",
              wordBreak: "break-all",
              backgroundColor: "#f8fafc",
              padding: "8px 12px",
              borderRadius: "4px",
              border: "1px solid #e2e8f0",
              userSelect: "all"
            }}
          >
            {anchor?.hash || logs[0]?.hash || "No anchor recorded yet"}
          </div>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "20px",
            border: verificationResult.valid ? "1px solid #86efac" : "2px solid #ef4444",
            backgroundColor: verificationResult.valid ? "#ecfdf5" : "#fef2f2",
            color: verificationResult.valid ? "#065f46" : "#991b1b"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "1rem" }}>
            <span>{verificationResult.valid ? "✓ INTEGRITY VERIFIED" : "⚠ TAMPERING DETECTED"}</span>
          </div>
          <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>{verificationResult.message}</p>
          {verificationResult.brokenRowId && (
            <p style={{ marginTop: "4px", fontSize: "0.85rem", fontWeight: "600" }}>
              Broken Chain Anchor Row ID: #{verificationResult.brokenRowId} &bull; Reason: {verificationResult.reason}
            </p>
          )}
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <p>Loading audit ledger...</p>
      ) : logs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "#6b7280" }}>Audit log ledger is empty.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 14px" }}>ID</th>
                <th style={{ padding: "10px 14px" }}>Timestamp</th>
                <th style={{ padding: "10px 14px" }}>Action</th>
                <th style={{ padding: "10px 14px" }}>User</th>
                <th style={{ padding: "10px 14px" }}>Entity</th>
                <th style={{ padding: "10px 14px" }}>Details</th>
                <th style={{ padding: "10px 14px" }}>Previous Hash</th>
                <th style={{ padding: "10px 14px" }}>Row SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: "700" }}>#{log.id}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#64748b" }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        backgroundColor: log.action.includes("FAILED") || log.action.includes("ESCALATED")
                          ? "#fee2e2"
                          : log.action.includes("SUCCESS") || log.action.includes("APPROVED") || log.action.includes("VERIFIED")
                          ? "#dcfce7"
                          : "#f1f5f9",
                        color: log.action.includes("FAILED") || log.action.includes("ESCALATED")
                          ? "#b91c1c"
                          : log.action.includes("SUCCESS") || log.action.includes("APPROVED") || log.action.includes("VERIFIED")
                          ? "#15803d"
                          : "#0f172a",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: "700",
                        fontSize: "0.75rem"
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {log.user_name ? (
                      <div>
                        <div style={{ fontWeight: "600" }}>{log.user_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{log.user_email}</div>
                      </div>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>System / Anonymous</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>{log.entity}</td>
                  <td style={{ padding: "10px 14px", maxWidth: "200px", fontFamily: "monospace", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {typeof log.details === "object" ? JSON.stringify(log.details) : log.details}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "0.7rem", color: "#64748b" }}>
                    {log.prev_hash === "GENESIS" ? (
                      <strong style={{ color: "#2563eb" }}>GENESIS</strong>
                    ) : (
                      `${log.prev_hash.slice(0, 8)}...${log.prev_hash.slice(-6)}`
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "0.7rem", color: "#0f172a", fontWeight: "600" }}>
                    {log.hash ? `${log.hash.slice(0, 8)}...${log.hash.slice(-6)}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

