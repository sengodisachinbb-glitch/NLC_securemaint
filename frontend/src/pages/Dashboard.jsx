// Executive Plant Maintenance Dashboard (/dashboard)
// Visualizes operational KPIs, equipment life distribution, and work order bottlenecks using Recharts

import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

export const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canAccess = user?.role === "Manager" || user?.role === "Admin";

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get("/dashboard/stats");
      setStats(res.data);
      setError("");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.status === 403
          ? "Executive KPI Dashboard is restricted to Manager and Admin roles."
          : "Failed to load dashboard metrics."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!canAccess) {
    return (
      <div className="card" style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#0a2540", marginBottom: "8px" }}>
          Executive Plant Dashboard
        </h2>
        <p style={{ color: "#64748b", marginBottom: "16px" }}>
          The KPI analytics dashboard is reserved for <strong>Manager</strong> and <strong>Admin</strong> roles.
        </p>
        <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
          You are currently signed in as <strong>{user?.name}</strong> with role <strong>{user?.role}</strong>.
          You can manage your work orders and equipment in their respective navigation tabs.
        </p>
      </div>
    );
  }

  if (loading) return <p>Loading executive plant metrics...</p>;
  if (error) return <div className="alert-error">{error}</div>;
  if (!stats) return null;

  // Prepare data for Work Orders by Status Bar Chart
  const statusChartData = Object.entries(stats.workOrders.byStatus || {}).map(([status, count]) => ({
    status,
    count
  }));

  // Prepare data for Equipment Health Pie Chart
  const equipmentPieData = [
    { name: "Green (<80% Life)", value: stats.equipmentHealth.green, color: "#10b981" },
    { name: "Amber (80-100% Life)", value: stats.equipmentHealth.amber, color: "#f59e0b" },
    { name: "Red (>100% Critical)", value: stats.equipmentHealth.red, color: "#ef4444" }
  ].filter((item) => item.value > 0);

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#111827" }}>
          Executive Plant Operations &amp; Safety Dashboard
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Aggregated preventive maintenance, equipment degradation, and regulatory compliance metrics
        </p>
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}
      >
        {/* Card 1: Work Orders Total */}
        <div className="card" style={{ borderLeft: "4px solid #2563eb" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
            Total Work Orders
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#0f172a", margin: "4px 0" }}>
            {stats.workOrders.total}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
            {stats.workOrders.byStatus["In Progress"]} in progress &bull; {stats.workOrders.byStatus["Closed"]} closed
          </div>
        </div>

        {/* Card 2: Overdue & Escalated Work Orders */}
        <div className="card" style={{ borderLeft: "4px solid #ef4444" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
            SLA Breached / Escalated
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#dc2626", margin: "4px 0" }}>
            {stats.workOrders.escalated}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#b91c1c" }}>
            {stats.workOrders.overdue} overdue SLA orders
          </div>
        </div>

        {/* Card 3: PM Compliance Rate */}
        <div className="card" style={{ borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
            PM Compliance Rate
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: "#059669", margin: "4px 0" }}>
            {stats.preventiveMaintenance.compliancePercentage}%
          </div>
          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
            {stats.preventiveMaintenance.completedPreventiveOrders} of {stats.preventiveMaintenance.totalPreventiveOrders} routines closed
          </div>
        </div>

        {/* Card 4: Equipment Degradation */}
        <div className="card" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
            Equipment Life Status
          </div>
          <div style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
            <span style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "4px", fontSize: "0.9rem", fontWeight: "700" }}>
              {stats.equipmentHealth.green} Green
            </span>
            <span style={{ backgroundColor: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "4px", fontSize: "0.9rem", fontWeight: "700" }}>
              {stats.equipmentHealth.amber} Amber
            </span>
            <span style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontSize: "0.9rem", fontWeight: "700" }}>
              {stats.equipmentHealth.red} Red
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
            {stats.equipmentHealth.total} total plant assets
          </div>
        </div>

        {/* Card 5: Overdue Actions */}
        <div className="card" style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
            Compliance Actions
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "800", color: stats.complianceActions.overdue > 0 ? "#dc2626" : "#4338ca", margin: "4px 0" }}>
            {stats.complianceActions.overdue}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#475569" }}>
            Overdue out of {stats.complianceActions.total} total items
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        {/* Chart 1: Work Orders by Status */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "#1e293b" }}>
            Work Orders Lifecycle Distribution
          </h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={statusChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="status" angle={-25} textAnchor="end" interval={0} fontSize={11} stroke="#64748b" />
                <YAxis allowDecimals={false} fontSize={12} stroke="#64748b" />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" fill="#0a2540" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Equipment Life Degradation */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "#1e293b" }}>
            Asset Life Health Breakdown
          </h2>
          <div style={{ width: "100%", height: 300 }}>
            {equipmentPieData.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={equipmentPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    innerRadius={50}
                    dataKey="value"
                    label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                    fontSize={11}
                  >
                    {equipmentPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ textAlign: "center", color: "#64748b", marginTop: "100px" }}>
                No equipment data to display
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

