// Main Application Layout
// Features the official NLC India logo and brand palette: Deep Royal Blue (#2F2484) & Pure White (#FFFFFF)
// Completely free of emojis, utilizing pristine typography, single-line rhythm, and refined hairlines

import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, NavLink } from "react-router-dom";

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const isAdmin = user?.role === "Admin";

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                backgroundColor: "#FFFFFF",
                padding: "4px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
              }}
            >
              <img
                src="/nlc-logo.png"
                alt="NLC India Limited"
                style={{
                  width: "40px",
                  height: "40px",
                  objectFit: "contain",
                  display: "block"
                }}
              />
            </div>
            <div>
              <div className="sidebar-title">NLCIL SecureMaint</div>
              <div className="sidebar-subtitle">Industrial Asset &amp; Safety</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Executive Dashboard
          </NavLink>

          <NavLink
            to="/equipment"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Equipment Registry
          </NavLink>

          <NavLink
            to="/work-orders"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Work Orders
          </NavLink>

          {isManagerOrAdmin && (
            <NavLink
              to="/pm-schedules"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              PM Schedules
            </NavLink>
          )}

          <NavLink
            to="/actions"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Compliance Actions
          </NavLink>

          {isManagerOrAdmin && (
            <NavLink
              to="/setup-2fa"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              Two-Factor Security
            </NavLink>
          )}

          {isAdmin && (
            <NavLink
              to="/audit"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              Audit Trail Ledger
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          NLC India Limited &copy; 2026<br />
          Enterprise Asset Lifecycle
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        <header className="top-header">
          <div className="header-brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img
              src="/nlc-logo.png"
              alt="NLC India"
              style={{ width: "24px", height: "24px", objectFit: "contain" }}
            />
            <span>NLC India Limited &bull; Secure Maintenance System</span>
          </div>

          <div className="header-user-actions">
            {user && (
              <>
                <span className="user-badge">
                  {user.name} &bull; {user.role}
                </span>
                <button onClick={handleLogout} className="btn-logout">
                  Sign Out
                </button>
              </>
            )}
          </div>
        </header>

        <main className="content-body">{children}</main>
      </div>
    </div>
  );
};
