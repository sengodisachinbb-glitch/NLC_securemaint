// Preventive Maintenance Schedules Page (/pm-schedules)
// Accessible by Manager and Admin to configure automated recurring maintenance routines
// Styled with Apple storefront minimalist aesthetic: clean typography, pill badges, and refined modal panels

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const PmSchedules = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [intervalUnit, setIntervalUnit] = useState("days");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    equipment_id: "",
    task: "",
    trigger_type: "days",
    interval_days: 7,
    interval_hours: 500
  });

  const canManage = user?.role === "Manager" || user?.role === "Admin";

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await api.get("/pm-schedules");
      setSchedules(res.data.schedules || []);
      setDemoMode(res.data.demoMode || false);
      setIntervalUnit(res.data.intervalUnit || "days");
      setError("");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to load PM schedules.");
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
    fetchSchedules();
    fetchEquipment();
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const payload = {
        equipment_id: Number(formData.equipment_id),
        task: formData.task.trim(),
        trigger_type: formData.trigger_type
      };

      if (formData.trigger_type === "hours") {
        payload.interval_hours = Number(formData.interval_hours);
      } else {
        payload.interval_days = Number(formData.interval_days);
      }

      await api.post("/pm-schedules", payload);
      setSuccess("New preventive schedule created successfully.");
      setShowModal(false);
      setFormData({
        equipment_id: "",
        task: "",
        trigger_type: "days",
        interval_days: 7,
        interval_hours: 500
      });
      fetchSchedules();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to create schedule.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#2F2484" }}>
            Preventive Maintenance Schedules
          </h1>
          <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
            Automated background scheduler creates preventive work orders based on runtime cadence or equipment hours
          </p>
        </div>

        {canManage && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            + New PM Schedule
          </button>
        )}
      </div>

      {demoMode && (
        <div
          style={{
            backgroundColor: "#FEF3C7",
            border: "1px solid #FDE68A",
            color: "#B45309",
            padding: "12px 18px",
            borderRadius: "12px",
            marginBottom: "24px",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >
          <strong style={{ backgroundColor: "#B45309", color: "#FFFFFF", padding: "2px 8px", borderRadius: "9999px", fontSize: "0.75rem", letterSpacing: "0.02em" }}>
            DEMO MODE ACTIVE
          </strong>
          <span>Intervals are treated as <strong>minutes</strong> (node-cron automatically triggers live in ~60 seconds).</span>
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {loading ? (
        <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading schedules...</p>
      ) : schedules.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ color: "#6E6E73" }}>No preventive maintenance schedules configured.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Asset</th>
                <th>Routine Maintenance Task</th>
                <th>Trigger &amp; Interval</th>
                <th>Last Triggered</th>
                <th>Next Auto-Creation / Hours Remaining</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: "700", color: "#1D1D1F" }}>#{s.id}</td>
                  <td>
                    <span style={{ fontWeight: "700", color: "#1D1D1F" }}>{s.equipment_code}</span>
                    <div style={{ fontSize: "0.775rem", color: "#6E6E73" }}>{s.equipment_name}</div>
                  </td>
                  <td style={{ fontWeight: "500", color: "#1D1D1F" }}>{s.task}</td>
                  <td>
                    {s.trigger_type === "hours" ? (
                      <div>
                        <span className="status-pill" style={{ backgroundColor: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE", marginBottom: "4px" }}>
                          Running Hours
                        </span>
                        <div style={{ fontWeight: "600", color: "#1D1D1F", marginTop: "2px" }}>
                          Every {s.interval_hours} hrs
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="status-pill" style={{ backgroundColor: "#F5F5F7", color: "#1D1D1F", border: "1px solid #D2D2D7", marginBottom: "4px" }}>
                          Calendar Cadence
                        </span>
                        <div style={{ fontWeight: "600", color: "#1D1D1F", marginTop: "2px" }}>
                          Every {s.interval_days} {intervalUnit}
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: "0.825rem", color: "#6E6E73" }}>
                    {s.trigger_type === "hours" ? (
                      s.last_done_hours > 0 ? (
                        <div>
                          <span style={{ fontWeight: "600", color: "#1D1D1F" }}>{s.last_done_hours} hrs</span>
                          {s.last_done && (
                            <div style={{ fontSize: "0.75rem", color: "#86868B" }}>
                              {new Date(s.last_done).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        "Pending first run"
                      )
                    ) : (
                      s.last_done ? new Date(s.last_done).toLocaleString() : "Pending first run"
                    )}
                  </td>
                  <td style={{ fontSize: "0.825rem" }}>
                    {s.trigger_type === "hours" ? (
                      <div>
                        <span
                          style={{
                            fontWeight: "700",
                            color: s.hours_remaining === 0 ? "#B91C1C" : "#2F2484"
                          }}
                        >
                          {s.hours_remaining !== null && s.hours_remaining !== undefined
                            ? `${s.hours_remaining} hrs remaining`
                            : "Calculating..."}
                        </span>
                        <div style={{ fontSize: "0.75rem", color: "#6E6E73", marginTop: "2px" }}>
                          Due at {(s.last_done_hours || 0) + (s.interval_hours || 0)} hrs (Current: {s.equipment_running_hours || 0} hrs)
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontWeight: "600", color: "#2F2484" }}>
                        {s.next_due ? new Date(s.next_due).toLocaleString() : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add PM Schedule Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.35rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "20px" }}>
              Configure Preventive Routine
            </h2>

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label className="form-label">Equipment</label>
                <select
                  className="form-input"
                  value={formData.equipment_id}
                  onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                  required
                >
                  <option value="">Select equipment asset...</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.code} - {eq.name} ({eq.section})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Trigger Type</label>
                <select
                  className="form-input"
                  value={formData.trigger_type}
                  onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                  required
                >
                  <option value="days">Calendar Interval ({demoMode ? "Minutes - Demo Mode" : "Days"})</option>
                  <option value="hours">Equipment Running Hours (Hours Threshold)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Maintenance Task Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.task}
                  onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                  placeholder="e.g. Ultrasonic roller vibration analysis & bearing check"
                  required
                />
              </div>

              {formData.trigger_type === "hours" ? (
                <div className="form-group">
                  <label className="form-label">
                    Running Hours Interval (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.interval_hours}
                    onChange={(e) => setFormData({ ...formData, interval_hours: e.target.value })}
                    placeholder="e.g. 250"
                    required
                  />
                  <small style={{ color: "#6E6E73", marginTop: "6px", display: "block", fontSize: "0.8rem" }}>
                    A preventive order triggers automatically when equipment reaches (last done + interval) running hours.
                  </small>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">
                    Recurrence Interval ({demoMode ? "Minutes - Demo Mode" : "Days"})
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.interval_days}
                    onChange={(e) => setFormData({ ...formData, interval_days: e.target.value })}
                    required
                  />
                  <small style={{ color: "#6E6E73", marginTop: "6px", display: "block", fontSize: "0.8rem" }}>
                    {demoMode
                      ? "In DEMO_MODE, entering 2 will trigger a PM work order in 2 minutes."
                      : "Work orders will auto-generate automatically based on this cadence."}
                  </small>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Routine
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
