// Two-Factor Authentication Setup Page (/setup-2fa)
// Displays QR code and allows user to verify first TOTP code to activate 2FA
// Enforced for Admin and Manager roles

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
    <div style={{ maxWidth: "620px", margin: "0 auto", paddingBottom: "40px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--nlc-primary)" }}>
          Two-Factor Authentication (2FA) Setup
        </h1>
        <p style={{ color: "var(--nlc-text-muted)", marginTop: "4px" }}>
          Mandatory security enrollment for Administrative &amp; Operational Leadership accounts
        </p>
      </div>

      <div className="card">
        {/* Role Notice Banner */}
        <div
          style={{
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            padding: "12px 16px",
            borderRadius: "6px",
            fontSize: "0.875rem",
            marginBottom: "20px"
          }}
        >
          <strong>Security Policy Notice:</strong> As a <strong>{user?.role}</strong>, multi-factor authentication (TOTP) is required by NLCIL Cyber Security protocols to protect industrial assets and plant operations.
        </div>

        {error && <div className="alert-error">{error}</div>}

        {success && (
          <div
            style={{
              backgroundColor: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              padding: "12px 16px",
              borderRadius: "6px",
              fontSize: "0.9rem",
              marginBottom: "20px",
              fontWeight: "600"
            }}
          >
            &#10003; Two-factor authentication successfully enabled! Redirecting to Dashboard...
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--nlc-text-muted)" }}>
            Generating unique cryptographic TOTP credentials...
          </div>
        ) : (
          <div>
            {/* Step 1: Scan QR Code */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--nlc-primary)", marginBottom: "8px" }}>
                Step 1: Scan QR Code with Authenticator App
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--nlc-text-muted)", marginBottom: "16px" }}>
                Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your mobile device and scan the barcode below:
              </p>

              {qrCode && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid var(--nlc-border)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
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
                  background: "#f9fafb",
                  border: "1px solid var(--nlc-border)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  fontSize: "0.85rem"
                }}
              >
                <div style={{ fontWeight: "600", marginBottom: "4px", color: "#374151" }}>
                  Cannot scan? Enter setup key manually:
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontWeight: "700",
                      color: "var(--nlc-primary)",
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
                    style={{ padding: "4px 10px", flexShrink: 0 }}
                  >
                    {copied ? "Copied!" : "Copy Key"}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Verification Form */}
            <form onSubmit={handleEnable2fa}>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--nlc-primary)", marginBottom: "8px" }}>
                  Step 2: Enter 6-Digit Verification Code
                </h3>
                <p style={{ fontSize: "0.875rem", color: "var(--nlc-text-muted)", marginBottom: "12px" }}>
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
                      fontSize: "1.4rem",
                      letterSpacing: "6px",
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
                style={{ padding: "12px" }}
              >
                {submitting ? "Enabling 2FA..." : "Verify Code & Enable 2FA"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

