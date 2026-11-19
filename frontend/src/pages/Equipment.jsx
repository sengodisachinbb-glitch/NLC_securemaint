// Equipment Registry Page (/equipment)
// Displays equipment inventory with lifecycle status badges and add/edit capabilities for Admin/Manager
// Styled with Apple storefront minimalist design: clean typography, pill badges, and refined modal panels

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
        return { backgroundColor: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" };
      case "Amber":
        return { backgroundColor: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" };
      case "Red":
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
            Equipment Registry
          </h1>
          <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
            Industrial asset registry, running hours tracking, and service life degradation status
          </p>
        </div>

        {canManage && (
          <button onClick={openAddModal} className="btn-primary">
            + Add Equipment
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {loading ? (
        <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading equipment assets...</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Location</th>
                <th>Section</th>
                <th>Running Hours</th>
                <th>Service Life</th>
                <th>Life Status</th>
                {canManage && <th style={{ textAlign: "center" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {equipmentList.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: "700", color: "#1D1D1F" }}>{item.code}</td>
                  <td style={{ fontWeight: "500", color: "#1D1D1F" }}>{item.name}</td>
                  <td style={{ color: "#6E6E73" }}>{item.type}</td>
                  <td style={{ color: "#1D1D1F" }}>{item.location}</td>
                  <td style={{ color: "#6E6E73" }}>{item.section}</td>
                  <td style={{ color: "#1D1D1F" }}>{item.running_hours.toLocaleString()} hrs</td>
                  <td style={{ color: "#6E6E73" }}>{item.service_life_hours.toLocaleString()} hrs</td>
                  <td>
                    <span
                      className="status-pill"
                      style={getLifeBadgeStyle(item.lifeStatus)}
                    >
                      {item.lifeStatus} ({Math.round((item.running_hours / item.service_life_hours) * 100)}%)
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => openEditModal(item)}
                        className="btn-quick-fill"
                        style={{ padding: "4px 12px" }}
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
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "20px" }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
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

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  {isEditing ? "Save Changes" : "Create Asset"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
