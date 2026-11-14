// Equipment Registry Page (/equipment)
// Displays equipment inventory with lifecycle status badges and add/edit capabilities for Admin/Manager

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const Equipment = () => {
  const { user } = useAuth();
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "Excavator",
    location: "",
    section: "Mining",
    running_hours: "",
    service_life_hours: "",
    last_service_date: ""
  });

  const canManage = user?.role === "Admin" || user?.role === "Manager";

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const res = await api.get("/equipment");
      setEquipmentList(res.data.equipment || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load equipment list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  const openAddModal = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({
      code: "",
      name: "",
      type: "Excavator",
      location: "",
      section: "Mining",
      running_hours: "",
      service_life_hours: "",
      last_service_date: ""
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setIsEditing(true);
    setEditId(item.id);
    setFormData({
      code: item.code,
      name: item.name,
      type: item.type,
      location: item.location,
      section: item.section,
      running_hours: item.running_hours,
      service_life_hours: item.service_life_hours,
      last_service_date: item.last_service_date || ""
    });
    setShowModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (isEditing) {
        await api.put(`/equipment/${editId}`, formData);
        setSuccess(`Equipment ${formData.code} updated successfully.`);
      } else {
        await api.post("/equipment", formData);
        setSuccess(`Equipment ${formData.code} created successfully.`);
      }
      setShowModal(false);
      fetchEquipment();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.response?.data?.errors) {
        setError(err.response.data.errors.map((e) => e.msg).join(", "));
      } else {
        setError("Failed to save equipment.");
      }
    }
  };

  const getLifeBadgeStyle = (status) => {
    switch (status) {
      case "Green":
        return { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac" };
      case "Amber":
        return { backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
      case "Red":
        return { backgroundColor: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#374151" };
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>Equipment Registry</h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Real-time equipment lifecycle metrics and operational running hours
          </p>
        </div>

        {canManage && (
          <button onClick={openAddModal} className="btn-primary" style={{ width: "auto", padding: "8px 18px" }}>
            + Add Equipment
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
        <p>Loading equipment assets...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 16px" }}>Code</th>
                <th style={{ padding: "12px 16px" }}>Name</th>
                <th style={{ padding: "12px 16px" }}>Type</th>
                <th style={{ padding: "12px 16px" }}>Location</th>
                <th style={{ padding: "12px 16px" }}>Section</th>
                <th style={{ padding: "12px 16px" }}>Running Hrs</th>
                <th style={{ padding: "12px 16px" }}>Service Life</th>
                <th style={{ padding: "12px 16px" }}>Life Status</th>
                {canManage && <th style={{ padding: "12px 16px", textAlign: "center" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {equipmentList.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 16px", fontWeight: "600", color: "#0a2540" }}>{item.code}</td>
                  <td style={{ padding: "12px 16px" }}>{item.name}</td>
                  <td style={{ padding: "12px 16px" }}>{item.type}</td>
                  <td style={{ padding: "12px 16px" }}>{item.location}</td>
                  <td style={{ padding: "12px 16px" }}>{item.section}</td>
                  <td style={{ padding: "12px 16px" }}>{item.running_hours.toLocaleString()} hrs</td>
                  <td style={{ padding: "12px 16px" }}>{item.service_life_hours.toLocaleString()} hrs</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "0.8rem",
                        fontWeight: "700",
                        display: "inline-block",
                        ...getLifeBadgeStyle(item.lifeStatus)
                      }}
                    >
                      {item.lifeStatus} ({Math.round((item.running_hours / item.service_life_hours) * 100)}%)
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <button
                        onClick={() => openEditModal(item)}
                        style={{
                          backgroundColor: "#f3f4f6",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: "0.8rem"
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Equipment Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "16px" }}>
              {isEditing ? `Edit Equipment (${formData.code})` : "Add New Equipment"}
            </h2>

            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label className="form-label">Equipment Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. BWE-03"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Equipment Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Bucket Wheel Excavator 1400L - Unit 3"
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    placeholder="e.g. Excavator"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Section</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    placeholder="e.g. Mining"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Mine-I / Face-C"
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Running Hours</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={formData.running_hours}
                    onChange={(e) => setFormData({ ...formData, running_hours: e.target.value })}
                    placeholder="e.g. 8500"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Service Life Hours</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.service_life_hours}
                    onChange={(e) => setFormData({ ...formData, service_life_hours: e.target.value })}
                    placeholder="e.g. 10000"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Last Service Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.last_service_date}
                  onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  {isEditing ? "Save Changes" : "Create Asset"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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

