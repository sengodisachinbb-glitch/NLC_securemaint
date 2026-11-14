# NLC-SecureMaint

> **A Secure Preventive Maintenance, Equipment Life-Cycle & Compliance Tracking Web Application**  
> Developed as a 14-Day Internship Prototype for **NLC India Limited (NLCIL)**.

---

## 📌 Project Overview

**NLC-SecureMaint** is a full-stack, local web application engineered for mining and thermal power plant environments (such as Mine-I, Mine-IA, Mine-II, and Thermal Power Stations). It eliminates maintenance bottlenecks, enforces statutory safety compliance via the Action Tracker (e.g., DGMS and CAG audit recommendations), automates preventive routines via the Preventive Maintenance Scheduler, and detects tampering through the tamper-evident Audit Log.

### Key Architectural Pillars:
- **Backend**: Node.js & Express with security middleware (`helmet`, `cors`, `express-rate-limit`, `express-validator`).
- **Database**: SQLite via `better-sqlite3` with WAL mode and foreign key constraints (`backend/nlc.db`).
- **Frontend**: React 18 + Vite, `react-router-dom`, `axios`, and `recharts` for interactive executive analytics.
- **Security Hardening**: Role-based access control (RBAC) across 5 distinct roles, bcrypt password hashing, 1-hour signed JWTs, account lockout (5 failed attempts $\rightarrow$ 15-minute lock), and all reviewed queries use prepared statements.
- **Audit Log**: Every security, equipment, work order, and compliance event is linked via a SHA-256 hash chain (`prev_hash` $\rightarrow$ `hash`) capable of detecting manual database tampering.
- **Preventive Maintenance Scheduler**: Automated background maintenance work order generator (`* * * * *`) and SLA escalation monitor with a live presentation `DEMO_MODE`.

---

## 📁 Repository Layout

```text
project NLC/
├── backend/
│   ├── routes/
│   │   ├── auth.js          # Authentication, lockout, and session routes
│   │   ├── equipment.js     # Equipment Register and Green/Amber/Red lifecycle calculation
│   │   ├── workOrders.js    # Work Orders CRUD and state transition engine
│   │   ├── pmSchedules.js   # Preventive Maintenance Scheduler management
│   │   ├── actions.js       # Action Tracker for statutory & safety compliance
│   │   ├── dashboard.js     # Dashboard aggregated KPI and executive analytics
│   │   └── audit.js         # Audit Log retrieval and cryptographic verification
│   ├── middleware/
│   │   └── auth.js          # JWT authentication & RBAC authorization middleware
│   ├── db.js                # SQLite schema initialization (6 core tables)
│   ├── audit.js             # Audit Log SHA-256 cryptographic hash-chaining engine
│   ├── cron.js              # node-cron runner for PM generation & SLA escalation
│   ├── seed.js              # Database seeder with sample NLCIL assets and users
│   ├── index.js             # Express server entry point with rate limiters & CORS
│   ├── .env                 # Environment variables (PORT, JWT_SECRET, DEMO_MODE)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js     # Axios helper with JWT interceptor & 401 handler
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Session state synchronized in memory & sessionStorage
│   │   ├── components/
│   │   │   ├── Layout.jsx   # NLCIL corporate layout with responsive sidebar
│   │   │   └── ProtectedRoute.jsx # Client-side route protection
│   │   ├── pages/
│   │   │   ├── Login.jsx    # Login portal with quick-fill demo accounts
│   │   │   ├── Home.jsx     # User session profile page
│   │   │   ├── Dashboard.jsx# Dashboard KPI cards & Recharts graphs
│   │   │   ├── Equipment.jsx# Equipment Register with life status badges
│   │   │   ├── WorkOrders.jsx # Work Orders list with SLA escalation tags
│   │   │   ├── WorkOrderDetail.jsx # Work Orders lifecycle actions permitted by role
│   │   │   ├── PmSchedules.jsx # Preventive Maintenance Scheduler routine cadence manager
│   │   │   ├── Actions.jsx  # Action Tracker for CAG & Safety items
│   │   │   └── Audit.jsx    # Audit Log tamper-evident ledger & chain verification
│   │   ├── App.jsx          # Route declarations
│   │   ├── index.css        # Clean corporate CSS design
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## 🚀 Setup & Installation Steps

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

---

### Step 1: Backend Setup
Open a terminal in the project directory:

```bash
# 1. Navigate to backend
cd backend

# 2. Install dependencies
npm install

# 3. Seed initial users, Equipment Register assets, and Action Tracker items
npm run seed

# 4. Start the backend server (runs on Port 5000)
npm start
```
> The backend server will start at **`http://localhost:5000`**.  
> Background cron will output: `[Cron] Scheduler initialized (running every minute. DEMO_MODE=true)`.

---

### Step 2: Frontend Setup
Open a **second terminal** in the project directory:

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Launch Vite development server (runs on Port 3000)
npm run dev
```
> The frontend application will be live at **`http://localhost:3000`**.

---

## 👥 User Roles & Demo Credentials

Every dummy account is pre-configured with the default password: **`NlcSecure@2026!`**  
*(Satisfies the password policy: $\ge 10$ chars, uppercase, lowercase, number, symbol. The login page features 1-click **Quick Fill** buttons for all 5 roles).*

| Role | Name | Email | Default Password | Primary Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Rajesh Kumar | `admin@nlc.in` | `NlcSecure@2026!` | System configuration, Equipment Register management, and Audit Log chain verification. |
| **Manager** | Ananya Sharma | `manager@nlc.in` | `NlcSecure@2026!` | Dashboard analytics, Work Orders technician & SLA assignment, Preventive Maintenance Scheduler creation, Action Tracker closure verification. |
| **Supervisor** | Suresh Murugan | `supervisor@nlc.in` | `NlcSecure@2026!` | Work Orders technical review, approval, and rejection. Ownership of mechanical Action Tracker items. |
| **Technician** | Karthik Selvan | `technician@nlc.in` | `NlcSecure@2026!` | On-site execution: starting Work Orders, recording evidence, and completing maintenance. |
| **Requester** | Pooja Nair | `requester@nlc.in` | `NlcSecure@2026!` | Plant operator submitting breakdown Work Orders, post-repair inspection, verification, and closure. |

---

## Demo with 2FA

Two-Factor Authentication (TOTP, RFC 6238) is mandatory for the **Admin** (`admin@nlc.in`) and **Manager** (`manager@nlc.in`) leadership roles.

### First-Time Setup
1. Sign in with the demo password (`NlcSecure@2026!`).
2. Because 2FA is mandatory, you will be redirected automatically to the **2FA Setup** page (`/setup-2fa`).
3. Open **Google Authenticator** (or any TOTP app such as Microsoft Authenticator, Authy, or 1Password) on your mobile device.
4. Tap `+` and choose **Scan a QR code**. Point your camera at the QR code displayed on the screen (or copy and paste the displayed manual key).
5. Enter the current 6-digit verification code from your authenticator app into the confirmation box and click **Verify Code & Enable 2FA**.
6. On all subsequent logins, entering your password will prompt for your live 6-digit code.

### Troubleshooting: What to Do if the Code is Rejected
TOTP codes are strictly time-based and expire every 30 seconds. If your code is rejected:
- **Check Phone Time Sync**: Ensure your mobile device's date and time are set to **Automatic / Network-provided**. If your device clock drifts by even 30–60 seconds, generated codes will not match the server time.
  - **Android (Google Authenticator)**: Open Authenticator $\rightarrow$ Tap Settings (three dots) $\rightarrow$ **Time correction for codes** $\rightarrow$ **Sync now**.
  - **iOS**: Go to device **Settings** $\rightarrow$ **General** $\rightarrow$ **Date & Time** $\rightarrow$ toggle **Set Automatically** on.
- Wait for the code countdown timer to refresh to a brand-new 6-digit number in your app and enter it promptly.

### Resetting 2FA for a Demo Account
If you need to reset 2FA on a demo account to re-test the first-time setup flow or clear an authenticator association, run the documented script:

```bash
npm run reset-2fa -- <email>
```

**Examples:**
```bash
# Reset 2FA for Admin
npm run reset-2fa -- admin@nlc.in

# Reset 2FA for Manager
npm run reset-2fa -- manager@nlc.in
```

This utility executes a parameterized SQL query (`UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?`) to safely clear the secret and disable 2FA for that specific account, and logs the operation to the Audit Log without bypassing or weakening Authentication 2FA enforcement. On their next login, the user will once again be required to complete 2FA setup.

---

## ⏱️ 5-Minute Live Demo Script for Evaluators

This structured walkthrough demonstrates all requirements of the internship project to NLCIL stakeholders within 5 minutes.

---

### Minute 1: Dashboard & Equipment Register
1. Open your browser at **`http://localhost:3000`**.
2. Click the **Manager** quick-fill button and sign in (`manager@nlc.in`).
3. You will land on the **📊 Dashboard**:
   - **Point out KPI Cards**: Total Work Orders, SLA Breached / Escalated orders, PM Compliance %, Equipment Health, and Overdue Actions.
   - **Point out Recharts Visualizations**:
     - *Work Orders Lifecycle Distribution*: Interactive bar chart tracking status stages.
     - *Asset Life Health Breakdown*: Donut chart illustrating equipment running hours vs. rated service life.
4. Click **⚙️ Equipment Register** in the sidebar:
   - Highlight the **Life Status Badges**:
     - 🟢 **Green** ($<80\%$ running hours, e.g., *Bucket Wheel Excavator BWE-01* at 25%).
     - 🟡 **Amber** ($80\% - 100\%$ service life).
     - 🔴 **Red** ($>100\%$ critical wear).
   - Demonstrate the **`+ Add Equipment`** and **`Edit`** buttons (visible only to Managers & Admins).

---

### Minute 2: Work Orders — Defect Reporting & Supervisor Authorization
1. Log out (top right) and click the **Requester** quick-fill button (`requester@nlc.in`).
2. Navigate to **📋 Work Orders** and click **`+ New Work Order`**:
   - Title: `Hydraulic pressure fluctuation in Bucket Wheel Excavator drive`
   - Equipment: `BWE-01 - Bucket Wheel Excavator 1400L`
   - Type: `Corrective Maintenance`
   - Description: `Oil pressure drop observed during bench-2 excavation.`
   - Click **Submit Order**.
3. Note that the order is created with status **`Submitted`**.
4. Log out and sign in as **Supervisor** (`supervisor@nlc.in`):
   - Go to **📋 Work Orders** and open the newly submitted order.
   - Show that the Supervisor has **`✓ Approve Work Order`** and **`✕ Reject Work Order`** buttons.
   - Click **`✓ Approve Work Order`**. The status changes to **`Approved`**.

---

### Minute 3: Work Orders — Manager SLA Assignment & Technician Work Execution
1. Log out and sign in as **Manager** (`manager@nlc.in`):
   - Open that work order.
   - Click **`Assign Technician & Set Priority (SLA)`**:
     - Select Technician: `Karthik Selvan (Technician)`
     - Select Priority: `Critical (4 Hours SLA)`
     - Click **Confirm Assignment**.
   - Show how `sla_due_at` is automatically computed and displayed on screen.
2. Log out and sign in as **Technician** (`technician@nlc.in`):
   - Open the assigned order.
   - Click **`▶ Start Maintenance Work`** $\rightarrow$ Status changes to **`In Progress`**.
   - Click **`✓ Mark Work Completed`** $\rightarrow$ Status changes to **`Completed`**.
3. Log out and sign back in as **Requester** (`requester@nlc.in`):
   - Open the completed order.
   - Click **`✓ Verify & Close Work Order`** $\rightarrow$ Status changes to **`Closed`** and records the completion timestamp.

---

### Minute 4: Preventive Maintenance Scheduler & Action Tracker
1. Sign in as **Manager** (`manager@nlc.in`) and click **🔄 Preventive Maintenance Scheduler**:
   - Note the **DEMO MODE ACTIVE** banner: intervals in `.env` are treated as minutes so automated background operations can be verified live.
   - Click **`+ New PM Schedule`**:
     - Asset: `CVY-01 - Main Overland Belt Conveyor 2400mm`
     - Task: `Ultrasonic roller vibration scan`
     - Interval: `1` minute.
     - Click **Save Routine**.
2. Within 60 seconds, refresh **📋 Work Orders**:
   - Show that the background `node-cron` job automatically generated a new work order titled `[PM] Ultrasonic roller vibration scan (CVY-01)` with status `Submitted` and type `preventive`—without any manual user input!
3. Open **🛡️ Action Tracker**:
   - Point out statutory findings from **CAG Report 35 of 2025** and DGMS safety circulars.
   - Highlight the red **`OVERDUE`** indicator on actions past their due date that haven't been verified by management.

---

### Minute 5: Audit Log & Cryptographic Verification
1. Log out and sign in as **Admin** (`admin@nlc.in`).
2. Click **🔒 Audit Log** in the sidebar:
   - Show the ledger table where every single action (login, equipment modification, work order approval, SLA assignment, and cron creation) is cryptographically linked.
   - Show `prev_hash` pointing to the previous row's `hash`, starting with `"GENESIS"`.
3. Click the green **`🔒 Verify Chain Integrity`** button:
   - The backend recalculates the SHA-256 hash across every row in sequence.
   - A bright green banner appears: **`✓ INTEGRITY VERIFIED — Audit log chain integrity verified. All entries are valid and untampered.`**
4. *(Optional live tamper test)*:
   - Run in terminal:
     ```powershell
     node -e "const db = require('./backend/db'); db.prepare('UPDATE audit_log SET action = ? WHERE id = 1').run('UNAUTHORIZED_TAMPER');"
     ```
   - Click **`🔒 Verify Chain Integrity`** again.
   - The banner immediately turns bright red: **`⚠ TAMPERING DETECTED — Tampering detected at row ID 1! Row data does not match stored hash.`**
   - Demonstrates tamper evidence for statutory auditors.

---

## 🔒 Security Hardening

- **Authentication**: bcrypt password hashing (10 salt rounds) with 1-hour signed JWTs, uniform generic 401 error responses for failed logins to mitigate username enumeration, and RFC 6238 TOTP two-factor authentication (Google Authenticator) mandatory for Admin and Manager roles.
- **Password Policy**: Enforces strict password complexity ($\ge 10$ characters with uppercase, lowercase, numbers, and special symbols) across all user accounts and seeding routines.
- **Brute-Force Protection**: 5-failed-attempt lockout (15 minutes), IP rate limiter on `/api/auth/login` (10 requests / 15 mins), and dedicated rate limiter on `/api/auth/2fa/verify` (5 attempts / 5 mins).
- **Injection Prevention**: all reviewed queries use prepared statements (`db.prepare('...').run(?)`).
- **CORS & Headers**: Strict origin whitelisting (`http://localhost:3000`) and Helmet HTTP security response headers.
- **Audit Log & Separate Anchor File**: SHA-256 blockchain-style hash chain on all database events, backed by a separate filesystem anchor file (`backend/anchor.json`) to detect tail rewrites and truncation attacks (deleted rows).

---

## Known Limitations

- This is a 14-day prototype using dummy data; it is not connected to NLCIL production systems and has not had an independent security assessment.
- The audit chain detects changes to rows. It cannot stop someone with full access to the server from rewriting the database and the anchor.json file together. In a real deployment the anchor should be copied to separate write-once storage.
- Account lockout can be triggered on purpose against a known email.
- JWTs are stored in sessionStorage and cannot be revoked before they expire (1 hour).
- SQLite is used for local simplicity and would need replacing for many concurrent users.
- Email/SMS alerts are not implemented.

---

## 📄 License & Ownership
Developed for **NLC India Limited (NLCIL)**. All rights reserved. Prototype for demonstration and assessment purposes.

