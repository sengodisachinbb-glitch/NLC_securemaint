// Two-Factor Authentication Setup Page (/setup-2fa)
// Displays QR code and allows user to verify first TOTP code to activate 2FA
// Enforced for Admin and Manager roles
// Styled with Apple storefront minimalist aesthetic: high whitespace, clean typography, pill buttons

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export const Setup2FA = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSetupCredentials();
  }, []);

  const fetchSetupCredentials = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/auth/2fa/setup");
      setSecret(response.data.secret);
      setQrCode(response.data.qrCode);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to generate 2FA setup credentials. Please ensure backend is active."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2fa = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await api.post("/auth/2fa/enable", { code: code.trim() });
      setSuccess(true);
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Invalid code. Please verify against Google Authenticator and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", paddingBottom: "48px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.85rem", fontWeight: "700", letterSpacing: "-0.03em", color: "#1D1D1F" }}>
          Two-Factor Authentication Setup
        </h1>
        <p style={{ color: "#6E6E73", fontSize: "0.925rem", marginTop: "4px" }}>
          Mandatory security enrollment for Administrative &amp; Operational Leadership accounts
        </p>
      </div>

      <div className="card">
        {/* Role Notice Banner */}
        <div
          style={{
            backgroundColor: "#F5F5F7",
            border: "1px solid #D2D2D7",
            color: "#1D1D1F",
            padding: "14px 18px",
            borderRadius: "12px",
            fontSize: "0.875rem",
            marginBottom: "24px",
            lineHeight: 1.5
          }}
        >
          <strong>Security Policy:</strong> Multi-factor authentication (TOTP) is required by NLCIL cyber security policy for <strong>{user?.role}</strong> accounts to safeguard industrial assets.
        </div>

        {error && <div className="alert-error">{error}</div>}

        {success && (
          <div className="alert-success">
            Two-factor authentication successfully enabled. Redirecting to Dashboard...
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#6E6E73" }}>
            Generating unique cryptographic TOTP credentials...
          </div>
        ) : (
          <div>
            {/* Step 1: Scan QR Code */}
            <div style={{ marginBottom: "28px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", color: "#1D1D1F", marginBottom: "8px" }}>
                Step 1: Scan QR Code with Authenticator App
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#6E6E73", marginBottom: "20px" }}>
                Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your mobile device and scan the barcode below:
              </p>

              {qrCode && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                  <div
                    style={{
                      background: "#FFFFFF",
                      padding: "16px",
                      borderRadius: "16px",
                      border: "1px solid #D2D2D7",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
                    }}
                  >
                    <img
                      src={qrCode}
                      alt="NLCIL 2FA QR Code"
                      style={{ width: "200px", height: "200px", display: "block" }}
                    />
                  </div>
                </div>
              )}

              {/* Manual Secret Key Fallback */}
              <div
                style={{
                  background: "#F5F5F7",
                  border: "1px solid #D2D2D7",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  fontSize: "0.85rem"
                }}
              >
                <div style={{ fontWeight: "600", marginBottom: "6px", color: "#1D1D1F" }}>
                  Cannot scan? Enter setup key manually:
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <code
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: "700",
                      color: "#2F2484",
                      letterSpacing: "1px",
                      wordBreak: "break-all"
                    }}
                  >
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="btn-quick-fill"
                  >
                    {copied ? "Copied" : "Copy Key"}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Verification Form */}
            <form onSubmit={handleEnable2fa}>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "600", color: "#1D1D1F", marginBottom: "8px" }}>
                  Step 2: Enter 6-Digit Verification Code
                </h3>
                <p style={{ fontSize: "0.875rem", color: "#6E6E73", marginBottom: "16px" }}>
                  Enter the live 6-digit confirmation code displayed in your authenticator app to confirm setup:
                </p>

                <div className="form-group">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="form-input"
                    style={{
                      fontSize: "1.5rem",
                      letterSpacing: "8px",
                      textAlign: "center",
                      fontWeight: "700",
                      maxWidth: "260px",
                      margin: "0 auto",
                      display: "block"
                    }}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || code.length < 6}
                style={{ width: "100%", padding: "12px" }}
              >
                {submitting ? "Enabling 2FA..." : "Verify Code &amp; Enable 2FA"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
