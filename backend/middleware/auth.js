// Authentication and Role-Based Authorization Middleware
// Protects routes using JSON Web Tokens (JWT) and checks user roles

const jwt = require("jsonwebtoken");

/**
 * authenticate Middleware
 * Verifies the JWT sent in the "Authorization: Bearer <token>" header.
 * Attaches decoded payload (user id, email, role, etc.) to req.user.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];

  // Check if header is present and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No authentication token provided." });
  }

  // Extract token string after 'Bearer '
  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject short-lived temporary 2FA tokens on fully authenticated endpoints
    if (decoded.type === "2fa_pending") {
      return res.status(401).json({
        error: "Two-factor authentication pending. Please complete 2FA verification to obtain full access."
      });
    }

    // Attach decoded user information to the request object
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

/**
 * authorize Middleware
 * Restricts access to users having one of the specified roles.
 * Example usage: authorize("Admin", "Manager")
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${req.user ? req.user.role : "Unknown"}' does not have permission to access this resource.`
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorize
};

