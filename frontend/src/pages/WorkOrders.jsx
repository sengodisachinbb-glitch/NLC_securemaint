// Work Orders Listing & Create Page (/work-orders)
// Filtered by role automatically by backend, shows status badges, escalated tags, and create modal

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>Work Orders</h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
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
          style={{ width: "auto", padding: "8px 18px" }}
        >
          + New Work Order
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", border: "1px solid #86efac" }}>
          {success}
        </div>
      )}

      {loading ? (
        <p>Loading work orders...</p>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "#6b7280" }}>No work orders found matching your role profile.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 16px" }}>ID</th>
                <th style={{ padding: "12px 16px" }}>Title</th>
                <th style={{ padding: "12px 16px" }}>Equipment</th>
                <th style={{ padding: "12px 16px" }}>Type</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Priority</th>
                <th style={{ padding: "12px 16px" }}>Technician</th>
                <th style={{ padding: "12px 16px" }}>SLA Due</th>
                <th style={{ padding: "12px 16px", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 16px", fontWeight: "600" }}>#{order.id}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: "600", color: "#111827" }}>{order.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Req by: {order.requester_name}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontWeight: "600", color: "#0a2540" }}>{order.equipment_code}</span>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{order.equipment_name}</div>
                  </td>
                  <td style={{ padding: "12px 16px", textTransform: "capitalize" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        backgroundColor: order.type === "preventive" ? "#fef3c7" : "#f3f4f6",
                        color: order.type === "preventive" ? "#b45309" : "#374151"
                      }}
                    >
                      {order.type}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.8rem",
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
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.7rem",
                            fontWeight: "800",
                            letterSpacing: "0.5px"
                          }}
                          title="SLA Breached - Escalated to plant management"
                        >
                          ESCALATED
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: "600" }}>{order.priority || "-"}</td>
                  <td style={{ padding: "12px 16px" }}>{order.technician_name || "Unassigned"}</td>
                  <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "#4b5563" }}>
                    {order.sla_due_at ? new Date(order.sla_due_at).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <Link
                      to={`/work-orders/${order.id}`}
                      style={{
                        backgroundColor: "#0a2540",
                        color: "#ffffff",
                        padding: "5px 12px",
                        borderRadius: "4px",
                        textDecoration: "none",
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        display: "inline-block"
                      }}
                    >
                      View &rarr;
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
          <div className="card" style={{ width: "100%", maxWidth: "520px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "16px" }}>Submit Work Order</h2>

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

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  Submit Order
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
    </div>
  );
};

