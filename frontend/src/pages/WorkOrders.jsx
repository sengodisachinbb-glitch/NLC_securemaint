// Work Orders Listing & Create Page (/work-orders)
// Filtered by role automatically by backend, shows status badges, escalated tags, and create modal
// Styled with Apple storefront minimalist aesthetic: clean typography, refined pill badges, high whitespace

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const WorkOrders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    equipment_id: "",
    type: "corrective"
  });

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get("/work-orders");
      setOrders(res.data.workOrders || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load work orders.");
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipment = async () => {
    try {
      const res = await api.get("/equipment");
      setEquipmentList(res.data.equipment || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
    fetchEquipment();
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await api.post("/work-orders", formData);
      setSuccess("Work order submitted successfully.");
      setShowCreateModal(false);
      setFormData({ title: "", description: "", equipment_id: "", type: "corrective" });
      fetchWorkOrders();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.response?.data?.errors) {
        setError(err.response.data.errors.map((e) => e.msg).join(", "));
      } else {
        setError("Failed to submit work order.");
      }
    }
  };

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#2F2484" }}>
            Work Orders
          </h1>
          <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
            {user?.role === "Requester"
              ? "Showing work orders submitted by you"
              : user?.role === "Technician"
              ? "Showing work orders assigned to you"
              : "Showing all active maintenance work orders across plants"}
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          + New Work Order
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {loading ? (
        <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading work orders...</p>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ color: "#6E6E73" }}>No work orders found matching your role profile.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Technician</th>
                <th>SLA Due</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: "700", color: "#1D1D1F" }}>#{order.id}</td>
                  <td>
                    <div style={{ fontWeight: "600", color: "#1D1D1F" }}>{order.title}</div>
                    <div style={{ fontSize: "0.775rem", color: "#6E6E73" }}>Req by: {order.requester_name}</div>
                  </td>
                  <td>
                    <span style={{ fontWeight: "600", color: "#1D1D1F" }}>{order.equipment_code}</span>
                    <div style={{ fontSize: "0.775rem", color: "#6E6E73" }}>{order.equipment_name}</div>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>
                    <span
                      className="status-pill"
                      style={{
                        backgroundColor: order.type === "preventive" ? "#FEF3C7" : "#F5F5F7",
                        color: order.type === "preventive" ? "#B45309" : "#1D1D1F",
                        border: `1px solid ${order.type === "preventive" ? "#FDE68A" : "#D2D2D7"}`
                      }}
                    >
                      {order.type}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span
                        className="status-pill"
                        style={getStatusBadgeStyle(order.status)}
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
                            letterSpacing: "0.02em"
                          }}
                          title="SLA Breached - Escalated to plant management"
                        >
                          ESCALATED
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontWeight: "600", color: "#1D1D1F" }}>{order.priority || "-"}</td>
                  <td style={{ color: "#1D1D1F" }}>{order.technician_name || "Unassigned"}</td>
                  <td style={{ fontSize: "0.8rem", color: "#6E6E73" }}>
                    {order.sla_due_at ? new Date(order.sla_due_at).toLocaleString() : "-"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <Link
                      to={`/work-orders/${order.id}`}
                      className="btn-quick-fill"
                      style={{ textDecoration: "none", display: "inline-block" }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "20px" }}>
              Submit Work Order
            </h2>

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label className="form-label">Title / Defect Summary</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Hydraulic pressure drop in main drive"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Equipment</label>
                <select
                  className="form-input"
                  value={formData.equipment_id}
                  onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                  required
                >
                  <option value="">Select affected equipment...</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.code} - {eq.name} ({eq.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Order Type</label>
                <select
                  className="form-input"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="corrective">Corrective Maintenance (Breakdown/Fault)</option>
                  <option value="preventive">Preventive Maintenance (Routine inspection)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description &amp; Observed Symptoms</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe abnormal vibration, leakage, noise or operating condition..."
                />
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Submit Order
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
    </div>
  );
};
