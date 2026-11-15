// Compliance & Audit Action Tracker Page (/actions)
// Tracks statutory, safety, and CAG recommendations with owner progress updates and management verification

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const Actions = () => {
  const { user } = useAuth();
  const [actionsList, setActionsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create Modal state (Admin/Manager)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState({
    source: "CAG Report 35 of 2025",
    description: "",
    owner_id: "3", // default to supervisor
    due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0]
  });

  // Progress Update Modal state (Owner only)
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [progressData, setProgressData] = useState({
    status: "In Progress",
    evidence_note: ""
  });

  const canCreate = user?.role === "Admin" || user?.role === "Manager";
  const isManager = user?.role === "Manager";

  const fetchActions = async () => {
    try {
      setLoading(true);
      const res = await api.get("/actions");
      setActionsList(res.data.actions || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load compliance action items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api.post("/actions", {
        ...createData,
        owner_id: Number(createData.owner_id)
      });
      setSuccess("New compliance action created and assigned.");
      setShowCreateModal(false);
      setCreateData({
        source: "CAG Report 35 of 2025",
        description: "",
        owner_id: "3",
        due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0]
      });
      fetchActions();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to create action.");
    }
  };

  const openProgressModal = (action) => {
    setActiveAction(action);
    setProgressData({
      status: action.status === "Open" ? "In Progress" : action.status,
      evidence_note: action.evidence_note || ""
    });
    setShowProgressModal(true);
  };

  const handleProgressSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api.patch(`/actions/${activeAction.id}/progress`, progressData);
      setSuccess(`Progress updated on action #${activeAction.id}.`);
      setShowProgressModal(false);
      fetchActions();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to update progress.");
    }
  };

  const handleVerify = async (actionId) => {
    setError("");
    setSuccess("");
    const note = window.prompt("Optional verification remark for audit trail:", "Physical inspection verified in field.");

    try {
      await api.patch(`/actions/${actionId}/verify`, { verification_note: note });
      setSuccess(`Action #${actionId} verified and closed.`);
      fetchActions();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Verification failed.");
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "Open":
        return { backgroundColor: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" };
      case "In Progress":
        return { backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
      case "Done":
        return { backgroundColor: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe" };
      case "Verified":
        return { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#374151" };
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>
            Compliance &amp; Safety Action Tracker
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Tracks recommendations from CAG Reports, Central Electricity Authority, and Safety Committees
          </p>
        </div>

        {canCreate && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary" style={{ width: "auto", padding: "8px 18px" }}>
            + Add Compliance Action
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", border: "1px solid #86efac" }}>
          {success}
        </div>
      )}

      {loading ? (
        <p>Loading action tracker items...</p>
      ) : actionsList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "#6b7280" }}>No compliance action items found.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 16px" }}>ID</th>
                <th style={{ padding: "12px 16px" }}>Source &amp; Finding</th>
                <th style={{ padding: "12px 16px" }}>Action Item Description</th>
                <th style={{ padding: "12px 16px" }}>Action Owner</th>
                <th style={{ padding: "12px 16px" }}>Due Date</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Evidence / Remarks</th>
                <th style={{ padding: "12px 16px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {actionsList.map((item) => {
                const isOwner = user?.id === item.owner_id;
                const isOwnerManager = isManager && user?.id === item.owner_id;
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "600" }}>#{item.id}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ backgroundColor: "#f1f5f9", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", color: "#0f172a" }}>
                        {item.source}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", maxWidth: "260px" }}>
                      <div style={{ fontWeight: "500", color: "#1e293b" }}>{item.description}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: "600" }}>{item.owner_name}</div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{item.owner_role}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div>{item.due_date}</div>
                      {item.isOverdue && (
                        <span
                          style={{
                            backgroundColor: "#ef4444",
                            color: "#ffffff",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.7rem",
                            fontWeight: "800",
                            display: "inline-block",
                            marginTop: "3px"
                          }}
                        >
                          OVERDUE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.8rem",
                          fontWeight: "700",
                          ...getStatusBadgeStyle(item.status)
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "#475569", maxWidth: "220px" }}>
                      {item.evidence_note || "None recorded"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                        {/* Owner update button */}
                        {isOwner && item.status !== "Verified" && (
                          <button
                            onClick={() => openProgressModal(item)}
                            style={{
                              backgroundColor: "#2563eb",
                              color: "#fff",
                              border: 0,
                              borderRadius: "4px",
                              padding: "4px 8px",
                              fontSize: "0.75rem",
                              fontWeight: "600",
                              cursor: "pointer"
                            }}
                          >
                            Update
                          </button>
                        )}

                        {/* Manager verify button */}
                        {isManager && item.status !== "Verified" && (
                          isOwnerManager ? (
                            <span
                              title="Blocked: You cannot verify closure of an action item you own (segregation of duties)."
                              style={{
                                fontSize: "0.7rem",
                                color: "#991b1b",
                                backgroundColor: "#fee2e2",
                                padding: "3px 6px",
                                borderRadius: "4px",
                                fontWeight: "600",
                                border: "1px solid #fca5a5"
                              }}
                            >
                              Owner (Cannot Verify)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleVerify(item.id)}
                              style={{
                                backgroundColor: "#16a34a",
                                color: "#fff",
                                border: 0,
                                borderRadius: "4px",
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                cursor: "pointer"
                              }}
                            >
                              Verify
                            </button>
                          )
                        )}

                        {item.status === "Verified" && (
                          <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: "600" }}>✓ Verified</span>
                        )}
                        {!isOwner && !isManager && item.status !== "Verified" && (
                          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Read Only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Action Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "500px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "16px" }}>
              Add Compliance Action Item
            </h2>

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label className="form-label">Audit / Regulatory Source</label>
                <select
                  className="form-input"
                  value={createData.source}
                  onChange={(e) => setCreateData({ ...createData, source: e.target.value })}
                  required
                >
                  <option value="CAG Report 35 of 2025">CAG Report 35 of 2025</option>
                  <option value="Incident review committee">Incident review committee</option>
                  <option value="Directorate General of Mines Safety (DGMS)">DGMS Safety Circular</option>
                  <option value="Internal Technical Audit">Internal Technical Audit</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Required Corrective Action</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={createData.description}
                  onChange={(e) => setCreateData({ ...createData, description: e.target.value })}
                  placeholder="Detail the mandatory technical or procedural compliance action..."
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Assigned Owner</label>
                  <select
                    className="form-input"
                    value={createData.owner_id}
                    onChange={(e) => setCreateData({ ...createData, owner_id: e.target.value })}
                    required
                  >
                    <option value="3">Suresh Murugan (Supervisor)</option>
                    <option value="4">Karthik Selvan (Technician)</option>
                    <option value="2">Ananya Sharma (Manager)</option>
                    <option value="1">Rajesh Kumar (Admin)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Statutory Due Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={createData.due_date}
                    onChange={(e) => setCreateData({ ...createData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  Assign Action
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    backgroundColor: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Progress Modal */}
      {showProgressModal && activeAction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "480px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "8px" }}>
              Update Action Progress (#{activeAction.id})
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "16px" }}>
              {activeAction.description}
            </p>

            <form onSubmit={handleProgressSubmit}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={progressData.status}
                  onChange={(e) => setProgressData({ ...progressData, status: e.target.value })}
                >
                  <option value="In Progress">In Progress (Work underway)</option>
                  <option value="Done">Done (Implemented, awaiting verification)</option>
                  <option value="Open">Open</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Evidence Note / Technical Remarks</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={progressData.evidence_note}
                  onChange={(e) => setProgressData({ ...progressData, evidence_note: e.target.value })}
                  placeholder="Record work order reference, sensor installation serials, or test results..."
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  Save Progress
                </button>
                <button
                  type="button"
                  onClick={() => setShowProgressModal(false)}
                  style={{
                    flex: 1,
                    backgroundColor: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

