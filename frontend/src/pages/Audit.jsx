// Admin Tamper-Evident Audit Trail Page (/audit)
// Provides audit trail inspection and on-demand cryptographic hash chain verification (Admin only)
// Free of emojis, using clean typographic hierarchy and Apple-style visual cards

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
      <div className="card" style={{ maxWidth: "560px", margin: "48px auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#B91C1C", marginBottom: "8px" }}>
          Restricted Security Zone
        </h2>
        <p style={{ color: "#6E6E73" }}>
          The cryptographic audit trail and hash chain verification are strictly restricted to <strong>Admin</strong> users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#2F2484" }}>
            Cryptographic Audit Trail
          </h1>
          <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
            Tamper-evident SHA-256 hash ledger verifying end-to-end event sequence integrity
          </p>
        </div>

        <button
          onClick={handleVerifyIntegrity}
          disabled={verifying}
          className="btn-primary"
          style={{
            backgroundColor: "#2F2484",
            padding: "10px 22px"
          }}
        >
          {verifying ? "Recomputing SHA-256 Chain..." : "Verify Chain Integrity"}
        </button>
      </div>

      {/* Separate anchor file Status Card */}
      <div
        className="card-secondary"
        style={{
          marginBottom: "24px",
          padding: "24px 28px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#2F2484", margin: 0 }}>
                Cryptographic Anchor State
              </h3>
              <code style={{ fontSize: "0.75rem", background: "#FFFFFF", border: "1px solid #D1CCED", padding: "2px 8px", borderRadius: "4px", color: "#2F2484", fontWeight: "600" }}>
                backend/anchor.json
              </code>
              <span
                className="status-pill"
                style={{
                  backgroundColor: verificationResult
                    ? verificationResult.valid
                      ? "#DCFCE7"
                      : "#FEE2E2"
                    : "#EDEAF8",
                  color: verificationResult
                    ? verificationResult.valid
                      ? "#15803D"
                      : "#B91C1C"
                    : "#2F2484",
                  border: `1px solid ${
                    verificationResult
                      ? verificationResult.valid
                        ? "#86EFAC"
                        : "#FCA5A5"
                      : "#D1CCED"
                  }`
                }}
              >
                {verificationResult
                  ? verificationResult.valid
                    ? "ANCHOR SYNCHRONIZED"
                    : "ANCHOR MISMATCH"
                  : "FILE-BACKED ANCHOR"}
              </span>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#5C5C6A", marginTop: "8px", maxWidth: "620px" }}>
              Independent state stored outside SQLite. Ensures deleted tail rows (truncation attacks) and row rewrites cannot be concealed by tampering with the database.
            </p>
          </div>

          <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#5C5C6A", fontWeight: "700", letterSpacing: "0.03em" }}>
                Anchor Row ID
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#2F2484", letterSpacing: "-0.02em" }}>
                #{anchor?.row_id ?? (logs[0]?.id || 0)}
              </div>
            </div>

            <div style={{ textAlign: "right", borderLeft: "1px solid #DCDCE6", paddingLeft: "24px" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#5C5C6A", fontWeight: "700", letterSpacing: "0.03em" }}>
                Ledger Record Count
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#2F2484", letterSpacing: "-0.02em" }}>
                {logs.length}
              </div>
            </div>
          </div>
        </div>

        {/* Highlighted Anchor Hash Display for Screenshotting & Note-Taking */}
        <div
          style={{
            marginTop: "18px",
            background: "#FFFFFF",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid #D2D2D7"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "#6E6E73", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Official Anchor SHA-256 Hash (Auditor Reference):
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.775rem", color: "#86868B" }}>
                Last Anchored: {anchor?.timestamp ? new Date(anchor.timestamp).toLocaleString() : "-"}
              </span>
              <button
                type="button"
                onClick={copyAnchorHash}
                className="btn-quick-fill"
              >
                {copied ? "Copied" : "Copy Hash"}
              </button>
            </div>
          </div>

          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "0.85rem",
              fontWeight: "600",
              color: "#1D1D1F",
              wordBreak: "break-all",
              backgroundColor: "#F5F5F7",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #E5E5EA",
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
            padding: "18px 24px",
            borderRadius: "14px",
            marginBottom: "24px",
            border: verificationResult.valid ? "1px solid #86EFAC" : "1px solid #FCA5A5",
            backgroundColor: verificationResult.valid ? "#DCFCE7" : "#FEE2E2",
            color: verificationResult.valid ? "#15803D" : "#B91C1C"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "0.95rem", letterSpacing: "0.02em" }}>
            <span>{verificationResult.valid ? "INTEGRITY VERIFIED" : "TAMPERING DETECTED"}</span>
          </div>
          <p style={{ marginTop: "4px", fontSize: "0.875rem", color: "inherit" }}>{verificationResult.message}</p>
          {verificationResult.brokenRowId && (
            <p style={{ marginTop: "6px", fontSize: "0.825rem", fontWeight: "600" }}>
              Broken Chain Anchor Row ID: #{verificationResult.brokenRowId} &bull; Reason: {verificationResult.reason}
            </p>
          )}
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading audit ledger...</p>
      ) : logs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ color: "#6E6E73" }}>Audit log ledger is empty.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User</th>
                <th>Entity</th>
                <th>Details</th>
                <th>Previous Hash</th>
                <th>Row SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontWeight: "700", color: "#1D1D1F" }}>#{log.id}</td>
                  <td style={{ whiteSpace: "nowrap", color: "#6E6E73" }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span
                      className="status-pill"
                      style={{
                        backgroundColor: log.action.includes("FAILED") || log.action.includes("ESCALATED")
                          ? "#FEE2E2"
                          : log.action.includes("SUCCESS") || log.action.includes("APPROVED") || log.action.includes("VERIFIED")
                          ? "#DCFCE7"
                          : "#F5F5F7",
                        color: log.action.includes("FAILED") || log.action.includes("ESCALATED")
                          ? "#B91C1C"
                          : log.action.includes("SUCCESS") || log.action.includes("APPROVED") || log.action.includes("VERIFIED")
                          ? "#15803D"
                          : "#1D1D1F",
                        border: `1px solid ${
                          log.action.includes("FAILED") || log.action.includes("ESCALATED")
                            ? "#FCA5A5"
                            : log.action.includes("SUCCESS") || log.action.includes("APPROVED") || log.action.includes("VERIFIED")
                            ? "#86EFAC"
                            : "#D2D2D7"
                        }`
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    {log.user_name ? (
                      <div>
                        <div style={{ fontWeight: "600", color: "#1D1D1F" }}>{log.user_name}</div>
                        <div style={{ fontSize: "0.775rem", color: "#6E6E73" }}>{log.user_email}</div>
                      </div>
                    ) : (
                      <span style={{ color: "#86868B" }}>System / Anonymous</span>
                    )}
                  </td>
                  <td style={{ textTransform: "capitalize", color: "#1D1D1F" }}>{log.entity}</td>
                  <td style={{ maxWidth: "220px", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", color: "#6E6E73" }}>
                    {typeof log.details === "object" ? JSON.stringify(log.details) : log.details}
                  </td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#6E6E73" }}>
                    {log.prev_hash === "GENESIS" ? (
                      <strong style={{ color: "#2F2484" }}>GENESIS</strong>
                    ) : (
                      `${log.prev_hash.slice(0, 8)}...${log.prev_hash.slice(-6)}`
                    )}
                  </td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#1D1D1F", fontWeight: "600" }}>
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
