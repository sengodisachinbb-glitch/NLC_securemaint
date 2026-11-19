// Executive Plant Maintenance Dashboard (/dashboard)
// Visualizes operational KPIs, equipment life distribution, and work order bottlenecks using Recharts
// Styled with Apple storefront minimalist aesthetic: high whitespace, editorial typography, and pristine card surfaces

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
      <div className="card" style={{ maxWidth: "560px", margin: "48px auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.35rem", fontWeight: "700", color: "#1D1D1F", marginBottom: "8px" }}>
          Executive Plant Dashboard
        </h2>
        <p style={{ color: "#6E6E73", marginBottom: "16px" }}>
          The KPI analytics dashboard is reserved for <strong>Manager</strong> and <strong>Admin</strong> roles.
        </p>
        <p style={{ fontSize: "0.85rem", color: "#86868B" }}>
          You are currently signed in as <strong>{user?.name}</strong> with role <strong>{user?.role}</strong>.
          You can manage your work orders and equipment in their respective navigation tabs.
        </p>
      </div>
    );
  }

  if (loading) return <p style={{ color: "#6E6E73", padding: "20px 0" }}>Loading executive plant metrics...</p>;
  if (error) return <div className="alert-error">{error}</div>;
  if (!stats) return null;

  // Prepare data for Work Orders by Status Bar Chart
  const statusChartData = Object.entries(stats.workOrders.byStatus || {}).map(([status, count]) => ({
    status,
    count
  }));

  // Prepare data for Equipment Health Pie Chart
  const equipmentPieData = [
    { name: "Green (<80% Life)", value: stats.equipmentHealth.green, color: "#15803D" },
    { name: "Amber (80-100% Life)", value: stats.equipmentHealth.amber, color: "#B45309" },
    { name: "Red (>100% Critical)", value: stats.equipmentHealth.red, color: "#B91C1C" }
  ].filter((item) => item.value > 0);

  return (
    <div>
      {/* Duo-Color Executive Operations Banner */}
      <div className="card-hero-blue">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#FFFFFF", marginBottom: "6px" }}>
              NLCIL Operations &amp; Safety Executive Dashboard
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.88)", fontSize: "0.925rem", margin: 0, maxWidth: "680px" }}>
              Real-time monitoring of heavy equipment degradation, preventive servicing compliance, and statutory safety action items
            </p>
          </div>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <div style={{ textAlign: "right", borderRight: "1px solid rgba(255, 255, 255, 0.2)", paddingRight: "20px" }}>
              <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.75)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.03em" }}>Plant Assets</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#FFFFFF" }}>{stats.equipmentHealth.total}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.75)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.03em" }}>PM Compliance</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#FFFFFF" }}>{stats.preventiveMaintenance.compliancePercentage}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
          marginBottom: "28px"
        }}
      >
        {/* Card 1: Work Orders Total */}
        <div className="card" style={{ borderTop: "4px solid #2F2484" }}>
          <div style={{ fontSize: "0.775rem", color: "#2F2484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Total Work Orders
          </div>
          <div style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", color: "#1D1D1F", margin: "6px 0 4px 0" }}>
            {stats.workOrders.total}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>
            {stats.workOrders.byStatus["In Progress"]} in progress &bull; {stats.workOrders.byStatus["Closed"]} closed
          </div>
        </div>

        {/* Card 2: Overdue & Escalated Work Orders */}
        <div className="card" style={{ borderTop: stats.workOrders.escalated > 0 ? "4px solid #B91C1C" : "4px solid #2F2484" }}>
          <div style={{ fontSize: "0.775rem", color: stats.workOrders.escalated > 0 ? "#B91C1C" : "#2F2484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            SLA Breached / Escalated
          </div>
          <div style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", color: stats.workOrders.escalated > 0 ? "#B91C1C" : "#1D1D1F", margin: "6px 0 4px 0" }}>
            {stats.workOrders.escalated}
          </div>
          <div style={{ fontSize: "0.8rem", color: stats.workOrders.overdue > 0 ? "#B91C1C" : "#5C5C6A" }}>
            {stats.workOrders.overdue} overdue SLA orders
          </div>
        </div>

        {/* Card 3: PM Compliance Rate */}
        <div className="card" style={{ borderTop: "4px solid #2F2484" }}>
          <div style={{ fontSize: "0.775rem", color: "#2F2484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            PM Compliance Rate
          </div>
          <div style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", color: "#15803D", margin: "6px 0 4px 0" }}>
            {stats.preventiveMaintenance.compliancePercentage}%
          </div>
          <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>
            {stats.preventiveMaintenance.completedPreventiveOrders} of {stats.preventiveMaintenance.totalPreventiveOrders} routines closed
            <span style={{ display: "block", fontSize: "0.75rem", color: "#8A8A9E", marginTop: "2px" }}>
              (Calendar &amp; running-hours routines)
            </span>
          </div>
        </div>

        {/* Card 4: Equipment Degradation */}
        <div className="card" style={{ borderTop: "4px solid #2F2484" }}>
          <div style={{ fontSize: "0.775rem", color: "#2F2484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Equipment Life Status
          </div>
          <div style={{ display: "flex", gap: "8px", margin: "10px 0 8px 0" }}>
            <span className="status-pill" style={{ backgroundColor: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" }}>
              {stats.equipmentHealth.green} Green
            </span>
            <span className="status-pill" style={{ backgroundColor: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}>
              {stats.equipmentHealth.amber} Amber
            </span>
            <span className="status-pill" style={{ backgroundColor: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
              {stats.equipmentHealth.red} Red
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>
            {stats.equipmentHealth.total} total plant assets
          </div>
        </div>

        {/* Card 5: Overdue Actions */}
        <div className="card" style={{ borderTop: "4px solid #2F2484" }}>
          <div style={{ fontSize: "0.775rem", color: "#2F2484", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Compliance Actions
          </div>
          <div style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", color: stats.complianceActions.overdue > 0 ? "#B91C1C" : "#2F2484", margin: "6px 0 4px 0" }}>
            {stats.complianceActions.overdue}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#5C5C6A" }}>
            Overdue out of {stats.complianceActions.total} total items
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: "24px", marginBottom: "28px" }}>
        {/* Chart 1: Work Orders by Status */}
        <div className="card">
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px", color: "#1D1D1F" }}>
            Work Orders Lifecycle Distribution
          </h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={statusChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                <XAxis dataKey="status" angle={-25} textAnchor="end" interval={0} fontSize={11} stroke="#6E6E73" />
                <YAxis allowDecimals={false} fontSize={12} stroke="#6E6E73" />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={{ borderRadius: "10px", border: "1px solid #D2D2D7" }} />
                <Bar dataKey="count" fill="#2F2484" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Equipment Life Degradation */}
        <div className="card">
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px", color: "#1D1D1F" }}>
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
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #D2D2D7" }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ textAlign: "center", color: "#6E6E73", marginTop: "100px" }}>
                No equipment data to display
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
