// Home Page (Protected)
// Displays welcome information and the logged-in user's name and role
// Styled with Apple storefront minimalist aesthetic

import React from "react";
import { useAuth } from "../context/AuthContext";

export const Home = () => {
  const { user } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#1D1D1F" }}>
          Welcome, {user?.name || "User"}
        </h1>
        <p style={{ color: "#6E6E73", marginTop: "4px", fontSize: "0.925rem" }}>
          Authenticated Session Profile &bull; Role: <strong style={{ color: "#2F2484" }}>{user?.role}</strong>
        </p>
      </div>

      <div className="card" style={{ maxWidth: "640px" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px", color: "#1D1D1F" }}>
          Session Identity &amp; Access Details
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "16px", fontSize: "0.925rem", alignItems: "center" }}>
          <span style={{ color: "#6E6E73" }}>User ID:</span>
          <span style={{ fontWeight: "600", color: "#1D1D1F" }}>#{user?.id}</span>

          <span style={{ color: "#6E6E73" }}>Full Name:</span>
          <span style={{ fontWeight: "600", color: "#1D1D1F" }}>{user?.name}</span>

          <span style={{ color: "#6E6E73" }}>Official Email:</span>
          <span style={{ color: "#1D1D1F" }}>{user?.email}</span>

          <span style={{ color: "#6E6E73" }}>Assigned Role:</span>
          <span>
            <span
              className="status-pill"
              style={{
                backgroundColor: "#E0F2FE",
                color: "#0369A1",
                border: "1px solid #BAE6FD"
              }}
            >
              {user?.role}
            </span>
          </span>

          <span style={{ color: "#6E6E73" }}>Section / Plant:</span>
          <span style={{ color: "#1D1D1F" }}>{user?.section || "Corporate"}</span>

          <span style={{ color: "#6E6E73" }}>JWT Storage:</span>
          <span style={{ color: "#15803D", fontWeight: "500" }}>
            Active in Memory &amp; sessionStorage
          </span>
        </div>
      </div>
    </div>
  );
};
