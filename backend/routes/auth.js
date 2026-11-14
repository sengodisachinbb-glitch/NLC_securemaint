// Authentication Routes (/api/auth)
// Handles login, account lockout logic, and JWT issuance

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { generateSecret, generateURI, verifySync } = require("otplib");
const qrcode = require("qrcode");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { logAudit } = require("../audit");
const { validatePasswordPolicy } = require("../utils/passwordPolicy");

const router = express.Router();

// Strict rate limiter for 2FA code verification attempts (5 attempts per 5 minutes per IP)
const twoFactorVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many 2FA verification attempts from this IP address. Please wait 5 minutes before trying again." }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Validates credentials, manages 5-attempt / 15-minute lockout, and issues 1h JWT.
 */
router.post(
  "/login",
  [
    body("email").trim().isEmail().normalizeEmail().withMessage("A valid official email is required."),
    body("password").notEmpty().withMessage("Password is required.")
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // 2. Fetch user by email using parameterized query
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());

    if (!user) {
      // Log failed login attempt with unknown user
      logAudit(null, "LOGIN_FAILED", "users", { email, reason: "User not found" });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const now = new Date();

    // 3. Check if account is currently locked out
    if (user.locked_until) {
      const lockUntilDate = new Date(user.locked_until);

      if (lockUntilDate > now) {
        const remainingMinutes = Math.ceil((lockUntilDate.getTime() - now.getTime()) / (60 * 1000));
        logAudit(user.id, "LOGIN_BLOCKED", "users", { email: user.email, reason: "Account locked" });
        return res.status(403).json({
          error: `Account is temporarily locked due to 5 failed attempts. Please try again in ${remainingMinutes} minute(s).`,
          locked_until: user.locked_until
        });
      } else {
        // Lockout period has elapsed; reset failed attempts and unlock
        db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);
        user.failed_attempts = 0;
        user.locked_until = null;
      }
    }

    // 4. Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      const newAttempts = (user.failed_attempts || 0) + 1;

      if (newAttempts >= 5) {
        // Lock account for 15 minutes (15 * 60 * 1000 ms)
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
          .run(newAttempts, lockedUntil, user.id);

        logAudit(user.id, "ACCOUNT_LOCKED", "users", {
          email: user.email,
          failed_attempts: newAttempts,
          locked_until: lockedUntil
        });

        return res.status(403).json({
          error: "Account locked for 15 minutes due to 5 consecutive failed login attempts.",
          locked_until: lockedUntil
        });
      } else {
        // Increment failed attempts counter
        db.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?")
          .run(newAttempts, user.id);

        logAudit(user.id, "LOGIN_FAILED", "users", {
          email: user.email,
          attempts: newAttempts,
          reason: "Incorrect password"
        });

        // Return identical generic error response to prevent user account enumeration
        return res.status(401).json({
          error: "Invalid email or password."
        });
      }
    }

    // 5. Successful password verification: reset failed attempts counter and clear lockout
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);

    // If user has 2FA enabled, issue a short-lived (5 minute) pending 2FA token
    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { id: user.id, type: "2fa_pending" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );

      logAudit(user.id, "LOGIN_PASSWORD_VERIFIED", "users", {
        email: user.email,
        two_factor_required: true
      });

      return res.status(200).json({
        requires2fa: true,
        tempToken,
        message: "Password verified. Please enter the 6-digit code from your authenticator app."
      });
    }

    // Mandatory 2FA check for Admin and Manager roles:
    // If not yet enabled, login succeeds with full JWT but flags needs2faSetup = true
    const isMandatoryRole = user.role === "Admin" || user.role === "Manager";
    const needs2faSetup = isMandatoryRole && !user.totp_enabled;

    // Record audit event for successful password login
    logAudit(user.id, "LOGIN_SUCCESS", "users", {
      email: user.email,
      role: user.role,
      needs2faSetup: !!needs2faSetup
    });

    // 6. Sign 1-hour JWT token with user payload
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      section: user.section
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: payload,
      needs2faSetup: !!needs2faSetup
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /api/auth/2fa/setup
 * Protected route (requires valid JWT).
 * Generates a base32 TOTP secret, otpauth URI, and QR code Data URL.
 * Saves pending secret to users.totp_secret and logs event in audit log.
 */
router.post("/2fa/setup", authenticate, async (req, res) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Generate fresh base32 TOTP secret
    const secret = generateSecret();

    // Create otpauth URI for Google Authenticator / standard authenticator apps
    const otpauthUrl = generateURI({
      issuer: "NLCIL SecureMaint",
      label: user.email,
      secret
    });

    // Generate high-resolution QR Code data URL (PNG)
    const qrCode = await qrcode.toDataURL(otpauthUrl);

    // Save secret to database (totp_enabled remains 0 until explicitly enabled with a valid code)
    db.prepare("UPDATE users SET totp_secret = ? WHERE id = ?").run(secret, user.id);

    // Audit log entry for 2FA setup initiation
    logAudit(user.id, "2FA_SETUP_INIT", "users", {
      email: user.email,
      action: "Initiated 2FA configuration"
    });

    return res.status(200).json({
      message: "2FA setup initiated. Scan the QR code or enter the secret manually, then verify with /api/auth/2fa/enable.",
      secret,
      qrCode,
      otpauthUrl
    });
  } catch (error) {
    console.error("[Auth] 2FA setup error:", error);
    return res.status(500).json({ error: "Failed to generate 2FA setup credentials." });
  }
});

/**
 * POST /api/auth/2fa/enable
 * Protected route (requires valid JWT).
 * Verifies the first 6-digit TOTP code against the stored secret and enables 2FA (totp_enabled = 1).
 */
router.post(
  "/2fa/enable",
  authenticate,
  [
    body("code").trim().notEmpty().withMessage("Verification code is required.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { code } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

      if (!user || !user.totp_secret) {
        return res.status(400).json({
          error: "2FA setup has not been initiated. Please call /api/auth/2fa/setup first."
        });
      }

      // Verify TOTP code against secret
      const verification = verifySync({ token: String(code).trim(), secret: user.totp_secret });
      const isValid = verification && verification.valid === true;

      if (!isValid) {
        logAudit(user.id, "2FA_ENABLE_FAILED", "users", {
          email: user.email,
          reason: "Invalid verification code provided during 2FA enablement"
        });

        return res.status(400).json({
          error: "Invalid 6-digit verification code. Please check your authenticator app and try again."
        });
      }

      // Code is valid: mark 2FA as fully enabled
      db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(user.id);

      logAudit(user.id, "2FA_ENABLED", "users", {
        email: user.email,
        role: user.role
      });

      return res.status(200).json({
        message: "Two-factor authentication successfully enabled.",
        totp_enabled: true
      });
    } catch (error) {
      console.error("[Auth] 2FA enable error:", error);
      return res.status(500).json({ error: "Failed to enable two-factor authentication." });
    }
  }
);

/**
 * POST /api/auth/2fa/verify
 * Public rate-limited route.
 * Body: { tempToken, code }
 * Exchanges a 5-minute pending 2FA token plus valid 6-digit TOTP code for the full 1-hour JWT.
 */
router.post(
  "/2fa/verify",
  twoFactorVerifyLimiter,
  [
    body("tempToken").notEmpty().withMessage("Temporary 2FA token is required."),
    body("code").trim().notEmpty().withMessage("6-digit TOTP verification code is required.")
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { tempToken, code } = req.body;

      // Verify and decode the short-lived pending 2FA token
      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      } catch (err) {
        return res.status(401).json({
          error: "Invalid or expired 2FA session token. Please log in again with your email and password."
        });
      }

      if (!decoded || decoded.type !== "2fa_pending" || !decoded.id) {
        return res.status(401).json({
          error: "Invalid 2FA token type."
        });
      }

      // Fetch user from database
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id);

      if (!user || !user.totp_enabled || !user.totp_secret) {
        return res.status(400).json({
          error: "Two-factor authentication is not configured or enabled for this user account."
        });
      }

      // Verify TOTP code against user's secret
      const verification = verifySync({ token: String(code).trim(), secret: user.totp_secret });
      const isValid = verification && verification.valid === true;

      if (!isValid) {
        logAudit(user.id, "2FA_VERIFY_FAILED", "users", {
          email: user.email,
          reason: "Invalid 2FA code provided during login verification"
        });

        return res.status(401).json({
          error: "Invalid two-factor authentication code."
        });
      }

      // Log successful 2FA verification
      logAudit(user.id, "2FA_VERIFY_SUCCESS", "users", {
        email: user.email,
        role: user.role
      });

      // Issue full 1-hour JWT token
      const payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        section: user.section
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

      return res.status(200).json({
        message: "Two-factor verification successful. Login complete.",
        token,
        user: payload
      });
    } catch (error) {
      console.error("[Auth] 2FA verify error:", error);
      return res.status(500).json({ error: "Internal server error during 2FA verification." });
    }
  }
);

/**
 * GET /api/auth/me
 * Protected route: verifies JWT via 'authenticate' middleware and returns current user info.
 */
router.get("/me", authenticate, (req, res) => {
  try {
    // Parameterized query to fetch fresh user data (omitting password_hash and totp_secret)
    const user = db.prepare(
      "SELECT id, name, email, role, section, failed_attempts, locked_until, totp_enabled, created_at FROM users WHERE id = ?"
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.status(200).json({
      user: {
        ...user,
        totp_enabled: Boolean(user.totp_enabled)
      }
    });
  } catch (error) {
    console.error("[Auth] /me error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;

