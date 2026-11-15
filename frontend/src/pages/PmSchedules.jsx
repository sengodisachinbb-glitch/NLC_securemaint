// Preventive Maintenance Schedules Page (/pm-schedules)
// Accessible by Manager and Admin to configure automated recurring maintenance routines

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>
            Preventive Maintenance Schedules
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Automated background scheduler creates preventive work orders every minute when due
          </p>
        </div>

        {canManage && (
          <button onClick={() => setShowModal(true)} className="btn-primary" style={{ width: "auto", padding: "8px 18px" }}>
            + New PM Schedule
          </button>
        )}
      </div>

      {demoMode && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fef3c7",
            color: "#92400e",
            padding: "10px 14px",
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <strong style={{ backgroundColor: "#f59e0b", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "0.75rem" }}>
            DEMO MODE ACTIVE
          </strong>
          <span>Intervals are treated as <strong>minutes</strong> (node-cron automatically triggers live in ~60 seconds).</span>
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", border: "1px solid #86efac" }}>
          {success}
        </div>
      )}

      {loading ? (
        <p>Loading schedules...</p>
      ) : schedules.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "#6b7280" }}>No preventive maintenance schedules configured.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 16px" }}>ID</th>
                <th style={{ padding: "12px 16px" }}>Asset</th>
                <th style={{ padding: "12px 16px" }}>Routine Maintenance Task</th>
                <th style={{ padding: "12px 16px" }}>Trigger &amp; Interval</th>
                <th style={{ padding: "12px 16px" }}>Last Triggered</th>
                <th style={{ padding: "12px 16px" }}>Next Auto-Creation / Hours Remaining</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 16px", fontWeight: "600" }}>#{s.id}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontWeight: "700", color: "#0a2540" }}>{s.equipment_code}</span>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{s.equipment_name}</div>
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: "500", color: "#1f2937" }}>{s.task}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {s.trigger_type === "hours" ? (
                      <div>
                        <span style={{ backgroundColor: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", display: "inline-block", marginBottom: "4px" }}>
                          Running Hours
                        </span>
                        <div style={{ fontWeight: "600", color: "#1f2937" }}>
                          Every {s.interval_hours} hrs
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span style={{ backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", display: "inline-block", marginBottom: "4px" }}>
                          Calendar Cadence
                        </span>
                        <div style={{ fontWeight: "600", color: "#1f2937" }}>
                          Every {s.interval_days} {intervalUnit}
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "#6b7280" }}>
                    {s.trigger_type === "hours" ? (
                      s.last_done_hours > 0 ? (
                        <div>
                          <span style={{ fontWeight: "600", color: "#374151" }}>{s.last_done_hours} hrs</span>
                          {s.last_done && (
                            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
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
                  <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>
                    {s.trigger_type === "hours" ? (
                      <div>
                        <span
                          style={{
                            fontWeight: "700",
                            color: s.hours_remaining === 0 ? "#dc2626" : "#0284c7"
                          }}
                        >
                          {s.hours_remaining !== null && s.hours_remaining !== undefined
                            ? `${s.hours_remaining} hrs remaining`
                            : "Calculating..."}
                        </span>
                        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                          Due at {(s.last_done_hours || 0) + (s.interval_hours || 0)} hrs (Current: {s.equipment_running_hours || 0} hrs)
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontWeight: "600", color: "#0284c7" }}>
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
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "16px" }}>
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
                  <small style={{ color: "#6b7280", marginTop: "4px", display: "block" }}>
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
                  <small style={{ color: "#6b7280", marginTop: "4px", display: "block" }}>
                    {demoMode
                      ? "In DEMO_MODE, entering 2 will trigger a PM work order in 2 minutes."
                      : "Work orders will auto-generate automatically based on this cadence."}
                  </small>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, marginTop: 0 }}>
                  Save Routine
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

