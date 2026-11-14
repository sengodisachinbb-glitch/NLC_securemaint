// NLC-SecureMaint 2FA Reset Utility
// Resets TOTP two-factor authentication for a given user email using a parameterized query

const path = require("path");
const db = require("./db");
const { logAudit } = require("./audit");

const args = process.argv.slice(2).filter((a) => a !== "--");
let email = null;

for (const arg of args) {
  if (arg.startsWith("--email=")) {
    email = arg.split("=")[1];
  } else if (!arg.startsWith("-")) {
    email = arg;
    break;
  }
}

if (!email) {
  console.error("Error: Please provide a user email to reset 2FA.");
  console.log("Usage:   npm run reset-2fa -- <email>");
  console.log("Example: npm run reset-2fa -- admin@nlc.in");
  process.exit(1);
}

email = email.trim();

try {
  // 1. Parameterized lookup to find user by email
  const user = db
    .prepare("SELECT id, name, email, role, totp_enabled FROM users WHERE LOWER(email) = LOWER(?)")
    .get(email);

  if (!user) {
    console.error(`[Error] User not found with email: '${email}'`);
    process.exit(1);
  }

  // 2. Parameterized update to clear totp_secret and totp_enabled
  const updateResult = db
    .prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?")
    .run(user.id);

  // 3. Record in audit ledger
  try {
    logAudit(user.id, "RESET_2FA", "users", {
      email: user.email,
      role: user.role,
      reset_by: "CLI_RESET_SCRIPT",
      previous_totp_enabled: user.totp_enabled
    });
  } catch (auditErr) {
    console.warn("[Warning] Could not log audit event:", auditErr.message);
  }

  console.log("==================================================");
  console.log("  NLC-SecureMaint 2FA Reset Successful");
  console.log("==================================================");
  console.log(`User:         ${user.name} (${user.email})`);
  console.log(`Role:         ${user.role}`);
  console.log(`2FA Status:   Disabled (totp_secret = NULL, totp_enabled = 0)`);
  console.log(`Rows Updated: ${updateResult.changes}`);
  console.log("--------------------------------------------------");
  if (user.role === "Admin" || user.role === "Manager") {
    console.log("Note: This user has mandatory 2FA. On their next login,");
    console.log("they will be prompted to set up a new authenticator QR code.");
  } else {
    console.log("Note: 2FA is now deactivated for this account.");
  }
  console.log("==================================================");
} catch (err) {
  console.error("[Database Error]", err.message);
  process.exit(1);
}

