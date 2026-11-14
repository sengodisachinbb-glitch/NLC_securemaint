// NLC-SecureMaint Password Policy Validator
// Enforces minimum length, character diversity (upper, lower, digit, symbol)

/**
 * Validates whether a password satisfies NLCIL security policy requirements:
 * - At least 10 characters in length
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one numerical digit (0-9)
 * - At least one special symbol / character (!@#$%^&*...)
 *
 * @param {string} password - Raw password to inspect
 * @returns {{ valid: boolean, error?: string }}
 */
const validatePasswordPolicy = (password) => {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required." };
  }

  if (password.length < 10) {
    return {
      valid: false,
      error: "Password must be at least 10 characters long."
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one uppercase letter (A-Z)."
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one lowercase letter (a-z)."
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one numerical digit (0-9)."
    };
  }

  // Symbol check: any ASCII or unicode punctuation / non-alphanumeric character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one special character / symbol (e.g. !@#$%^&*)."
    };
  }

  return { valid: true };
};

module.exports = {
  validatePasswordPolicy
};

