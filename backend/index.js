// NLC-SecureMaint Backend
// Express server entry point

require("dotenv").config(); // Load environment variables from .env file

// Validate mandatory environment variables at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === "") {
  console.error("\n=======================================================");
  console.error("[FATAL ERROR] Missing required environment variable: JWT_SECRET");
  console.error("The NLC-SecureMaint backend server refuses to start without a valid JWT_SECRET configured in .env.");
  console.error("Please configure JWT_SECRET in your backend/.env file (see backend/.env.example).");
  console.error("=======================================================\n");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// Security HTTP headers
app.use(helmet());

// Tightened CORS configuration restricting access to designated frontend origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL
].filter(Boolean);

// CORS guard: rejects disallowed origins with clean HTTP 403 JSON (no CORS allow headers, no stack traces)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Access denied by CORS policy: Origin is not allowed." });
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman) or matching whitelist
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json()); // Parses incoming JSON payloads

// -------------------------------------------------------------
// Rate Limiting (express-rate-limit)
// -------------------------------------------------------------
// 1. General API rate limiter: max 200 requests per 15-minute window per IP
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP. Please try again after 15 minutes." }
});
app.use("/api/", generalApiLimiter);

// 2. Strict Authentication rate limiter: max 10 login attempts per 15-minute window per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this IP address. Please try again after 15 minutes." }
});
app.use("/api/auth/login", loginLimiter);

// Routes
const authRoutes = require("./routes/auth");
const equipmentRoutes = require("./routes/equipment");
const auditRoutes = require("./routes/audit");
const workOrderRoutes = require("./routes/workOrders");
const pmScheduleRoutes = require("./routes/pmSchedules");
const actionRoutes = require("./routes/actions");
const dashboardRoutes = require("./routes/dashboard");
const { initCronJobs } = require("./cron");

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Authentication routes (/api/auth/login, /api/auth/me)
app.use("/api/auth", authRoutes);

// Equipment routes (/api/equipment)
app.use("/api/equipment", equipmentRoutes);

// Audit trail and verification routes (/api/audit)
app.use("/api/audit", auditRoutes);

// Work order routes (/api/work-orders)
app.use("/api/work-orders", workOrderRoutes);

// Preventive maintenance schedule routes (/api/pm-schedules)
app.use("/api/pm-schedules", pmScheduleRoutes);

// Compliance & Audit action items routes (/api/actions)
app.use("/api/actions", actionRoutes);

// Executive dashboard stats (/api/dashboard/stats)
app.use("/api/dashboard", dashboardRoutes);

// Global error handler ensuring clean JSON and zero stack trace leakage
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: "Access denied by CORS policy: Origin is not allowed." });
  }
  console.error("[Server Error]", err.message || err);
  return res.status(500).json({ error: "Internal server error." });
});

// Configure server port
const PORT = process.env.PORT || 5000;

// Start listening for incoming requests and start background jobs
app.listen(PORT, () => {
  console.log(`[NLC-SecureMaint] Backend server running on http://localhost:${PORT}`);
  initCronJobs();
});

