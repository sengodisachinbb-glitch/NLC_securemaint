// Compliance & Audit Action Tracker Page (/actions)
// Tracks statutory, safety, and CAG recommendations with owner progress updates and management verification
// Styled with Apple storefront minimalist aesthetic: clean typography, pill badges, and refined modal panels

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
        return { backgroundColor: "#E0F2FE", color: "#0369A1", border: "1px solid #BAE6FD" };
      case "In Progress":
        return { backgroundColor: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" };
      case "Done":
        return { backgroundColor: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" };
      case "Verified":
        return { backgroundColor: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" };
      default:
        return { backgroundColor: "#F5F5F7", color: "#1D1D1F", border: "1px solid #D2D2D7" };
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#2F2484" }}>
            Compliance &amp; Safety Action Tracker
          </h1>
          <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
            Tracks recommendations from CAG Reports, Central Electricity Authority, and Safety Committees
          </p>
        </div>

        {canCreate && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            + Add Compliance Action
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {loading ? (
        <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading action tracker items...</p>
      ) : actionsList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ color: "#6E6E73" }}>No compliance action items found.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Source &amp; Finding</th>
                <th>Action Item Description</th>
                <th>Action Owner</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Evidence / Remarks</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {actionsList.map((item) => {
                const isOwner = user?.id === item.owner_id;
                const isOwnerManager = isManager && user?.id === item.owner_id;
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: "700", color: "#1D1D1F" }}>#{item.id}</td>
                    <td>
                      <span className="status-pill" style={{ backgroundColor: "#F5F5F7", color: "#1D1D1F", border: "1px solid #D2D2D7" }}>
                        {item.source}
                      </span>
                    </td>
                    <td style={{ maxWidth: "280px" }}>
                      <div style={{ fontWeight: "500", color: "#1D1D1F", lineHeight: 1.4 }}>{item.description}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: "600", color: "#1D1D1F" }}>{item.owner_name}</div>
                      <div style={{ fontSize: "0.775rem", color: "#6E6E73" }}>{item.owner_role}</div>
                    </td>
                    <td>
                      <div style={{ color: "#1D1D1F" }}>{item.due_date}</div>
                      {item.isOverdue && (
                        <span
                          className="status-pill"
                          style={{
                            backgroundColor: "#FEE2E2",
                            color: "#B91C1C",
                            border: "1px solid #FCA5A5",
                            marginTop: "4px"
                          }}
                        >
                          OVERDUE
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={getStatusBadgeStyle(item.status)}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#6E6E73", maxWidth: "220px" }}>
                      {item.evidence_note || "None recorded"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                        {/* Owner update button */}
                        {isOwner && item.status !== "Verified" && (
                          <button
                            onClick={() => openProgressModal(item)}
                            className="btn-quick-fill"
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
                                fontSize: "0.725rem",
                                color: "#B91C1C",
                                backgroundColor: "#FEE2E2",
                                padding: "4px 8px",
                                borderRadius: "9999px",
                                fontWeight: "500",
                                border: "1px solid #FCA5A5"
                              }}
                            >
                              Owner (Cannot Verify)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleVerify(item.id)}
                              className="btn-quick-fill"
                              style={{ borderColor: "#15803D", color: "#15803D" }}
                            >
                              Verify
                            </button>
                          )
                        )}

                        {item.status === "Verified" && (
                          <span style={{ fontSize: "0.8rem", color: "#15803D", fontWeight: "600" }}>Verified</span>
                        )}
                        {!isOwner && !isManager && item.status !== "Verified" && (
                          <span style={{ fontSize: "0.775rem", color: "#86868B" }}>Read Only</span>
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "20px" }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Assign Action
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-muted"
                  style={{ flex: 1 }}
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "8px" }}>
              Update Action Progress (#{activeAction.id})
            </h2>
            <p style={{ color: "#6E6E73", fontSize: "0.875rem", marginBottom: "20px", lineHeight: 1.4 }}>
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

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Progress
                </button>
                <button
                  type="button"
                  onClick={() => setShowProgressModal(false)}
                  className="btn-muted"
                  style={{ flex: 1 }}
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
