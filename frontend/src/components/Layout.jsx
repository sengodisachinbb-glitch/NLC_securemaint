// Main Application Layout
// Features a persistent corporate sidebar and top navigation header

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
          <div className="sidebar-title">NLCIL SecureMaint</div>
          <div className="sidebar-subtitle">Preventive Maintenance &amp; Safety</div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            📊 Executive Dashboard
          </NavLink>

          <NavLink
            to="/equipment"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            ⚙️ Equipment Registry
          </NavLink>

          <NavLink
            to="/work-orders"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            📋 Work Orders
          </NavLink>

          {isManagerOrAdmin && (
            <NavLink
              to="/pm-schedules"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              🔄 PM Schedules
            </NavLink>
          )}

          <NavLink
            to="/actions"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            🛡️ Compliance Actions
          </NavLink>

          {isManagerOrAdmin && (
            <NavLink
              to="/setup-2fa"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              🔐 2FA Security
            </NavLink>
          )}

          {isAdmin && (
            <NavLink
              to="/audit"
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              🔒 Audit Trail Ledger
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
          <div className="header-brand">
            NLC India Limited &bull; Secure Maintenance System
          </div>

          <div className="header-user-actions">
            {user && (
              <>
                <span className="user-badge">
                  {user.name} ({user.role})
                </span>
                <button onClick={handleLogout} className="btn-logout">
                  Logout
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


