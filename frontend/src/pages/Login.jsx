// Login Page (/login)
// Authenticates users against POST /api/auth/login and POST /api/auth/2fa/verify
// Features official NLC India logo and brand palette: Deep Royal Blue (#2F2484) & Pure White (#FFFFFF)

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA step state: "credentials" -> "2fa"
  // Note: tempToken is stored ONLY in component memory state per security policy
  const [step, setStep] = useState("credentials");
  const [tempToken, setTempToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  // Step 1: Initial password authentication
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", { email, password });

      // Check if 2FA challenge is required for this account
      if (response.data.requires2fa) {
        setTempToken(response.data.tempToken);
        setStep("2fa");
        setError("");
        return;
      }

      const { token, user, needs2faSetup } = response.data;

      // Store in memory state & sessionStorage
      login(token, user);

      // If mandatory 2FA enrollment is needed, redirect to setup page
      if (needs2faSetup) {
        navigate("/setup-2fa");
      } else {
        navigate("/");
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Unable to connect to the backend server. Ensure it is running on port 5000.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verification of 6-digit TOTP code
  const handleVerify2fa = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/2fa/verify", {
        tempToken,
        code: twoFactorCode.trim()
      });

      const { token, user } = response.data;

      // Full login completed: store JWT and user profile
      login(token, user);

      // Clean up local component state
      setTempToken("");
      setTwoFactorCode("");

      // Redirect to protected home page
      navigate("/");
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to verify authentication code. Please check your app and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel2fa = () => {
    setStep("credentials");
    setTempToken("");
    setTwoFactorCode("");
    setError("");
  };

  const fillCredentials = (demoEmail) => {
    setEmail(demoEmail);
    setPassword("NlcSecure@2026!");
    setStep("credentials");
    setTempToken("");
    setTwoFactorCode("");
    setError("");
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {step === "credentials" ? (
          <>
            <div className="login-header">
              <img
                src="/nlc-logo.png"
                alt="NLC India Limited"
                style={{
                  width: "72px",
                  height: "72px",
                  objectFit: "contain",
                  margin: "0 auto 14px auto",
                  display: "block"
                }}
              />
              <div className="login-logo-title">NLCIL SecureMaint</div>
              <div className="login-logo-subtitle">Industrial Asset &amp; Lifecycle Management Portal</div>
            </div>

            {error && <div className="alert-error">{error}</div>}

            <form onSubmit={handleCredentialsSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Official Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. admin@nlc.in"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "8px" }} disabled={loading}>
                {loading ? "Authenticating..." : "Sign In"}
              </button>
            </form>

            {/* Quick Demo Credentials Helper */}
            <div className="quick-demo-accounts">
              <strong style={{ color: "var(--nlc-royal-blue)", display: "block", marginBottom: "8px" }}>
                NLCIL Authorized Demo Profiles:
              </strong>
              <div className="quick-btn-group">
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => fillCredentials("admin@nlc.in")}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => fillCredentials("manager@nlc.in")}
                >
                  Manager
                </button>
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => fillCredentials("supervisor@nlc.in")}
                >
                  Supervisor
                </button>
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => fillCredentials("technician@nlc.in")}
                >
                  Technician
                </button>
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => fillCredentials("requester@nlc.in")}
                >
                  Requester
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Step 2: 2FA TOTP Code Entry */
          <>
            <div className="login-header">
              <img
                src="/nlc-logo.png"
                alt="NLC India Limited"
                style={{
                  width: "56px",
                  height: "56px",
                  objectFit: "contain",
                  margin: "0 auto 12px auto",
                  display: "block"
                }}
              />
              <div className="login-logo-title">Two-Factor Authentication</div>
              <div className="login-logo-subtitle">Enter the 6-digit code from Google Authenticator</div>
            </div>

            {error && <div className="alert-error">{error}</div>}

            <form onSubmit={handleVerify2fa}>
              <div className="form-group">
                <label className="form-label" htmlFor="twoFactorCode" style={{ textAlign: "center" }}>
                  Security Verification Code
                </label>
                <input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="form-input"
                  style={{
                    fontSize: "1.5rem",
                    letterSpacing: "8px",
                    textAlign: "center",
                    fontWeight: "700"
                  }}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoFocus
                  required
                />
                <small
                  style={{
                    display: "block",
                    marginTop: "8px",
                    color: "var(--text-secondary)",
                    textAlign: "center",
                    fontSize: "0.8rem"
                  }}
                >
                  Open your authenticator application to view the active 6-digit passcode.
                </small>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: "100%", marginTop: "12px" }}
                disabled={loading || twoFactorCode.length < 6}
              >
                {loading ? "Verifying Passcode..." : "Verify &amp; Sign In"}
              </button>

              <button
                type="button"
                className="btn-muted"
                style={{
                  width: "100%",
                  marginTop: "12px",
                  textAlign: "center"
                }}
                onClick={handleCancel2fa}
              >
                Cancel &amp; Back to Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
