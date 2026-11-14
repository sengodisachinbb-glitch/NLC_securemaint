// Home Page (Protected)
// Displays welcome information and the logged-in user's name and role

import React from "react";
import { useAuth } from "../context/AuthContext";

export const Home = () => {
  const { user } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#111827" }}>
          Welcome, {user?.name || "User"}!
        </h1>
        <p style={{ color: "#6b7280", marginTop: "4px" }}>
          You are authenticated with role: <strong style={{ color: "#0284c7" }}>{user?.role}</strong>
        </p>
      </div>

      <div className="card" style={{ maxWidth: "600px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "16px", color: "#1f2937" }}>
          Session Profile Information
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px", fontSize: "0.95rem" }}>
          <span style={{ color: "#6b7280" }}>User ID:</span>
          <span style={{ fontWeight: "500" }}>{user?.id}</span>

          <span style={{ color: "#6b7280" }}>Full Name:</span>
          <span style={{ fontWeight: "600" }}>{user?.name}</span>

          <span style={{ color: "#6b7280" }}>Official Email:</span>
          <span>{user?.email}</span>

          <span style={{ color: "#6b7280" }}>Assigned Role:</span>
          <span>
            <span
              style={{
                backgroundColor: "#e0f2fe",
                color: "#0369a1",
                padding: "2px 8px",
                borderRadius: "4px",
                fontWeight: "600",
                fontSize: "0.85rem"
              }}
            >
              {user?.role}
            </span>
          </span>

          <span style={{ color: "#6b7280" }}>Section / Plant:</span>
          <span>{user?.section || "Corporate"}</span>

          <span style={{ color: "#6b7280" }}>JWT Storage:</span>
          <span style={{ color: "#059669", fontWeight: "500" }}>
            Active in Memory &amp; sessionStorage
          </span>
        </div>
      </div>
    </div>
  );
};

