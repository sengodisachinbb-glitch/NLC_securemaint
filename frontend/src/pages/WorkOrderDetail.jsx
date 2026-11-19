// Work Order Detail & Lifecycle Actions Page (/work-orders/:id)
// Displays full work order history, SLA status, escalated alerts, and role-permitted lifecycle action buttons
// Styled with Apple storefront design system, pill buttons, and completely emoji-free

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
    setAssignData({ technician_id: "4", priority: "High" });
    setShowAssignModal(true);
  };

  if (loading) return <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading work order #{id}...</p>;
  if (error && !order) return <div className="alert-error">{error}</div>;
  if (!order) return <p style={{ color: "#6E6E73" }}>Work order not found.</p>;

  // Role permissions checks: Admin is removed from workflow actions
  const isSupervisor = user?.role === "Supervisor";
  const isManager = user?.role === "Manager";
  const isAssignedTech = user?.role === "Technician" && user?.id === order.technician_id;
  const isOriginalRequester = user?.role === "Requester" && user?.id === order.requester_id;

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "Submitted":
        return { backgroundColor: "#E0F2FE", color: "#0369A1", border: "1px solid #BAE6FD" };
      case "Approved":
        return { backgroundColor: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" };
      case "Assigned":
        return { backgroundColor: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" };
      case "In Progress":
        return { backgroundColor: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" };
      case "Completed":
        return { backgroundColor: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" };
      case "Closed":
        return { backgroundColor: "#F5F5F7", color: "#1D1D1F", border: "1px solid #D2D2D7" };
      case "Rejected":
        return { backgroundColor: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" };
      default:
        return { backgroundColor: "#F5F5F7", color: "#1D1D1F", border: "1px solid #D2D2D7" };
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <Link to="/work-orders" style={{ color: "#2F2484", fontSize: "0.875rem", fontWeight: "500" }}>
          &larr; Back to Work Orders List
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#1D1D1F" }}>
              Work Order #{order.id}: {order.title}
            </h1>

            <span
              className="status-pill"
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                ...getStatusBadgeStyle(order.status)
              }}
            >
              {order.status}
            </span>

            {/* Escalated Tag in Red */}
            {order.escalated === 1 && (
              <span
                className="status-pill"
                style={{
                  backgroundColor: "#FEE2E2",
                  color: "#B91C1C",
                  border: "1px solid #FCA5A5",
                  fontSize: "0.75rem",
                  letterSpacing: "0.03em"
                }}
              >
                ESCALATED (SLA BREACHED)
              </span>
            )}
          </div>
          <p style={{ color: "#6E6E73", marginTop: "6px", fontSize: "0.9rem" }}>
            Category: <strong style={{ textTransform: "capitalize", color: "#1D1D1F" }}>{order.type} Maintenance</strong> &bull; Created: {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {actionSuccess && (
        <div className="alert-success">
          {actionSuccess}
        </div>
      )}

      {/* Main Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px", marginBottom: "28px" }}>
        <div className="card">
          <h2 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "14px", color: "#2F2484" }}>
            Description &amp; Observations
          </h2>
          <p style={{ color: "#1D1D1F", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: "0.95rem" }}>
            {order.description || "No detailed description provided."}
          </p>

          <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #E5E5EA" }} />

          <h2 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "14px", color: "#2F2484" }}>
            Associated Asset Details
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", fontSize: "0.9rem" }}>
            <div><span style={{ color: "#5C5C6A" }}>Code:</span> <strong style={{ color: "#2F2484" }}>{order.equipment_code}</strong></div>
            <div><span style={{ color: "#5C5C6A" }}>Name:</span> <strong style={{ color: "#1D1D1F" }}>{order.equipment_name}</strong></div>
            <div><span style={{ color: "#5C5C6A" }}>Location:</span> <span style={{ color: "#1D1D1F" }}>{order.equipment_location}</span></div>
            <div><span style={{ color: "#5C5C6A" }}>Section:</span> <span style={{ color: "#1D1D1F" }}>{order.equipment_section}</span></div>
          </div>
        </div>

        {/* Sidebar Status Info Card */}
        <div className="card-secondary">
          <h2 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "16px", color: "#2F2484" }}>
            Assignment &amp; SLA
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "0.9rem" }}>
            <div>
              <div style={{ color: "#5C5C6A", fontSize: "0.775rem", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.03em" }}>Requester</div>
              <div style={{ fontWeight: "700", color: "#1D1D1F", marginTop: "2px" }}>{order.requester_name}</div>
              <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>{order.requester_email}</div>
            </div>

            <div>
              <div style={{ color: "#5C5C6A", fontSize: "0.775rem", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.03em" }}>Assigned Technician</div>
              <div style={{ fontWeight: "700", color: "#1D1D1F", marginTop: "2px" }}>{order.technician_name || "Not yet assigned"}</div>
              {order.technician_email && <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>{order.technician_email}</div>}
            </div>

            <div>
              <div style={{ color: "#5C5C6A", fontSize: "0.775rem", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.03em" }}>Priority Level</div>
              <div style={{ fontWeight: "700", color: "#2F2484", marginTop: "2px" }}>{order.priority || "Medium (Default)"}</div>
            </div>

            <div>
              <div style={{ color: "#5C5C6A", fontSize: "0.775rem", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.03em" }}>SLA Resolution Due At</div>
              <div style={{ fontWeight: "700", color: order.escalated ? "#B91C1C" : "#1D1D1F", marginTop: "2px" }}>
                {order.sla_due_at ? new Date(order.sla_due_at).toLocaleString() : "Pending assignment"}
              </div>
            </div>

            {order.closed_at && (
              <div>
                <div style={{ color: "#5C5C6A", fontSize: "0.775rem", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.03em" }}>Verified Closed At</div>
                <div style={{ fontWeight: "700", color: "#15803D", marginTop: "2px" }}>
                  {new Date(order.closed_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-Permitted Action Controls */}
      <div className="card" style={{ padding: "24px 32px", borderTop: "3px solid #2F2484" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "#2F2484" }}>
          Lifecycle Actions (Role: {user?.role})
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          {/* 1. Supervisor Actions on Submitted */}
          {order.status === "Submitted" && isSupervisor && (
            order.requester_id === user?.id ? (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: "#B91C1C",
                  backgroundColor: "#FEE2E2",
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  fontWeight: "500",
                  border: "1px solid #FCA5A5"
                }}
              >
                Blocked: You raised this work order. Approval and rejection require another supervisor (segregation of duties).
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleAction("approve")}
                  className="btn-primary"
                  style={{ backgroundColor: "#15803D" }}
                >
                  Approve Work Order
                </button>
                <button
                  onClick={() => handleAction("reject", { reason: "Rejected by plant supervisor" })}
                  className="btn-primary"
                  style={{ backgroundColor: "#B91C1C" }}
                >
                  Reject Work Order
                </button>
              </>
            )
          )}

          {/* 2. Manager Actions on Approved */}
          {order.status === "Approved" && isManager && (
            <button
              onClick={openAssignModal}
              className="btn-primary"
            >
              Assign Technician &amp; Set Priority
            </button>
          )}

          {/* 3. Technician Actions on Assigned */}
          {order.status === "Assigned" && isAssignedTech && (
            <button
              onClick={() => handleAction("start")}
              className="btn-primary"
            >
              Start Maintenance Work
            </button>
          )}

          {/* 4. Technician Actions on In Progress */}
          {order.status === "In Progress" && isAssignedTech && (
            <button
              onClick={() => handleAction("complete")}
              className="btn-primary"
              style={{ backgroundColor: "#15803D" }}
            >
              Complete Work Order
            </button>
          )}

          {/* 5. Requester Actions on Completed */}
          {order.status === "Completed" && isOriginalRequester && (
            <>
              <button
                onClick={() => handleAction("verify-close")}
                className="btn-primary"
                style={{ backgroundColor: "#1D1D1F" }}
              >
                Verify and Close
              </button>
              <button
                onClick={() => handleAction("reopen", { reason: "Requester requested rework on inspection" })}
                className="btn-secondary"
              >
                Reopen for Rework
              </button>
            </>
          )}

          {/* 6. Requester Action on Closed */}
          {order.status === "Closed" && isOriginalRequester && (
            <button
              onClick={() => handleAction("reopen", { reason: "Recurrence observed after closing" })}
              className="btn-secondary"
            >
              Reopen Closed Order
            </button>
          )}

          {/* If no action is currently valid for this role and status */}
          <span style={{ fontSize: "0.85rem", color: "#6E6E73" }}>
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "20px" }}>
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

              <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Confirm Assignment
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
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
