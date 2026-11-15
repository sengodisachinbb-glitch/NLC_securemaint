// Work Order Detail & Lifecycle Actions Page (/work-orders/:id)
// Displays full work order history, SLA status, escalated alerts, and role-permitted lifecycle action buttons

import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const WorkOrderDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [assignData, setAssignData] = useState({
    technician_id: "",
    priority: "High"
  });

  const fetchOrderDetail = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/work-orders/${id}`);
      setOrder(res.data.workOrder);
      setError("");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to load work order details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id]);

  const handleAction = async (endpoint, payload = {}) => {
    setError("");
    setActionSuccess("");
    try {
      const res = await api.patch(`/work-orders/${id}/${endpoint}`, payload);
      setActionSuccess(res.data.message || "Action executed successfully.");
      setShowAssignModal(false);
      fetchOrderDetail();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Action failed.");
    }
  };

  const openAssignModal = async () => {
    // If we haven't loaded technicians yet, populate default
    setAssignData({ technician_id: "4", priority: "High" });
    setShowAssignModal(true);
  };

  if (loading) return <p>Loading work order #{id}...</p>;
  if (error && !order) return <div className="alert-error">{error}</div>;
  if (!order) return <p>Work order not found.</p>;

  // Role permissions checks: Admin is removed from workflow actions
  const isSupervisor = user?.role === "Supervisor";
  const isManager = user?.role === "Manager";
  const isAssignedTech = user?.role === "Technician" && user?.id === order.technician_id;
  const isOriginalRequester = user?.role === "Requester" && user?.id === order.requester_id;

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "Submitted":
        return { backgroundColor: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" };
      case "Approved":
        return { backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
      case "Assigned":
        return { backgroundColor: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe" };
      case "In Progress":
        return { backgroundColor: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" };
      case "Completed":
        return { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac" };
      case "Closed":
        return { backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" };
      case "Rejected":
        return { backgroundColor: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#374151" };
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <Link to="/work-orders" style={{ color: "#0369a1", textDecoration: "none", fontSize: "0.9rem" }}>
          &larr; Back to Work Orders List
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>
              Work Order #{order.id}: {order.title}
            </h1>

            <span
              style={{
                padding: "4px 12px",
                borderRadius: "9999px",
                fontSize: "0.85rem",
                fontWeight: "700",
                ...getStatusBadgeStyle(order.status)
              }}
            >
              {order.status}
            </span>

            {/* Escalated Tag in Red */}
            {order.escalated === 1 && (
              <span
                style={{
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  fontWeight: "800",
                  letterSpacing: "0.5px"
                }}
              >
                ESCALATED (SLA BREACHED)
              </span>
            )}
          </div>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "0.9rem" }}>
            Category: <strong style={{ textTransform: "capitalize" }}>{order.type} Maintenance</strong> &bull; Created: {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {actionSuccess && (
        <div style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", border: "1px solid #86efac" }}>
          {actionSuccess}
        </div>
      )}

      {/* Main Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px", marginBottom: "24px" }}>
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "12px", color: "#1f2937" }}>
            Description &amp; Observations
          </h2>
          <p style={{ color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {order.description || "No detailed description provided."}
          </p>

          <hr style={{ margin: "20px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

          <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "12px", color: "#1f2937" }}>
            Associated Asset Details
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.9rem" }}>
            <div><span style={{ color: "#6b7280" }}>Code:</span> <strong>{order.equipment_code}</strong></div>
            <div><span style={{ color: "#6b7280" }}>Name:</span> <strong>{order.equipment_name}</strong></div>
            <div><span style={{ color: "#6b7280" }}>Location:</span> {order.equipment_location}</div>
            <div><span style={{ color: "#6b7280" }}>Section:</span> {order.equipment_section}</div>
          </div>
        </div>

        {/* Sidebar Status Info Card */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "14px", color: "#1f2937" }}>
            Assignment &amp; SLA
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
            <div>
              <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>Requester</div>
              <div style={{ fontWeight: "600" }}>{order.requester_name}</div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{order.requester_email}</div>
            </div>

            <div>
              <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>Assigned Technician</div>
              <div style={{ fontWeight: "600" }}>{order.technician_name || "Not yet assigned"}</div>
              {order.technician_email && <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{order.technician_email}</div>}
            </div>

            <div>
              <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>Priority Level</div>
              <div style={{ fontWeight: "600" }}>{order.priority || "Medium (Default)"}</div>
            </div>

            <div>
              <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>SLA Resolution Due At</div>
              <div style={{ fontWeight: "600", color: order.escalated ? "#dc2626" : "#111827" }}>
                {order.sla_due_at ? new Date(order.sla_due_at).toLocaleString() : "Pending assignment"}
              </div>
            </div>

            {order.closed_at && (
              <div>
                <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>Verified Closed At</div>
                <div style={{ fontWeight: "600", color: "#059669" }}>
                  {new Date(order.closed_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-Permitted Action Controls */}
      <div className="card" style={{ backgroundColor: "#f8fafc", border: "1px solid #cbd5e1" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "12px", color: "#0f172a" }}>
          Lifecycle Actions (Available to your role: {user?.role})
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          {/* 1. Supervisor Actions on Submitted */}
          {order.status === "Submitted" && isSupervisor && (
            order.requester_id === user?.id ? (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: "#991b1b",
                  backgroundColor: "#fee2e2",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  fontWeight: "600",
                  border: "1px solid #fca5a5"
                }}
              >
                Blocked: You raised this work order. Approval and rejection require another supervisor (segregation of duties).
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleAction("approve")}
                  style={{
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    padding: "8px 18px",
                    border: 0,
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  ✓ Approve Work Order
                </button>
                <button
                  onClick={() => handleAction("reject", { reason: "Rejected by plant supervisor" })}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    padding: "8px 18px",
                    border: 0,
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  ✕ Reject Work Order
                </button>
              </>
            )
          )}

          {/* 2. Manager Actions on Approved */}
          {order.status === "Approved" && isManager && (
            <button
              onClick={openAssignModal}
              style={{
                backgroundColor: "#7c3aed",
                color: "#ffffff",
                padding: "8px 18px",
                border: 0,
                borderRadius: "6px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Assign Technician &amp; Set Priority (SLA)
            </button>
          )}

          {/* 3. Technician Actions on Assigned */}
          {order.status === "Assigned" && isAssignedTech && (
            <button
              onClick={() => handleAction("start")}
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
                padding: "8px 18px",
                border: 0,
                borderRadius: "6px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              ▶ Start Maintenance Work
            </button>
          )}

          {/* 4. Technician Actions on In Progress */}
          {order.status === "In Progress" && isAssignedTech && (
            <button
              onClick={() => handleAction("complete")}
              style={{
                backgroundColor: "#059669",
                color: "#ffffff",
                padding: "8px 18px",
                border: 0,
                borderRadius: "6px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              ✓ Mark Work Completed
            </button>
          )}

          {/* 5. Requester Actions on Completed */}
          {order.status === "Completed" && isOriginalRequester && (
            <>
              <button
                onClick={() => handleAction("verify-close")}
                style={{
                  backgroundColor: "#0f172a",
                  color: "#ffffff",
                  padding: "8px 18px",
                  border: 0,
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                ✓ Verify &amp; Close Work Order
              </button>
              <button
                onClick={() => handleAction("reopen", { reason: "Requester requested rework on inspection" })}
                style={{
                  backgroundColor: "#d97706",
                  color: "#ffffff",
                  padding: "8px 18px",
                  border: 0,
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                ↺ Reopen for Rework
              </button>
            </>
          )}

          {/* 6. Requester Action on Closed */}
          {order.status === "Closed" && isOriginalRequester && (
            <button
              onClick={() => handleAction("reopen", { reason: "Recurrence observed after closing" })}
              style={{
                backgroundColor: "#d97706",
                color: "#ffffff",
                padding: "8px 18px",
                border: 0,
                borderRadius: "6px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              ↺ Reopen Closed Order
            </button>
          )}

          {/* If no action is currently valid for this role and status */}
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            {order.status === "Closed"
              ? "This work order has been verified and closed. The Requester can reopen it if the fault recurs."
              : order.status === "Rejected"
              ? "This work order was rejected."
              : "No further action pending from your current role."}
          </span>
        </div>
      </div>

      {/* Assignment Modal for Manager */}
      {showAssignModal && (
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
          <div className="card" style={{ width: "100%", maxWidth: "460px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "16px" }}>
              Assign Technician &amp; Set SLA
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAction("assign", {
                  technician_id: Number(assignData.technician_id),
                  priority: assignData.priority
                });
              }}
            >
              <div className="form-group">
                <label className="form-label">Technician</label>
                <select
                  className="form-input"
                  value={assignData.technician_id}
                  onChange={(e) => setAssignData({ ...assignData, technician_id: e.target.value })}
                  required
                >
                  <option value="4">Karthik Selvan (Technician - Electrical &amp; Conveyors)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority &amp; SLA Commitment</label>
                <select
                  className="form-input"
                  value={assignData.priority}
                  onChange={(e) => setAssignData({ ...assignData, priority: e.target.value })}
                >
                  <option value="Critical">Critical (4 Hours SLA)</option>
                  <option value="High">High (24 Hours SLA)</option>
                  <option value="Medium">Medium (3 Days SLA)</option>
                  <option value="Low">Low (7 Days SLA)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  Confirm Assignment
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
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

