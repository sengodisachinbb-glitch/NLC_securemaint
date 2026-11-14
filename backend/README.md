# NLC-SecureMaint - Backend

This is the Node.js + Express backend service for **NLC-SecureMaint** (NLC India Limited).

## Modules

The backend architecture implements eight core modules:
1. **Authentication**: Role-based access control across 5 distinct roles (Admin, Manager, Supervisor, Technician, Requester), bcrypt password hashing, 1-hour signed JWTs, 15-minute account lockout on 5 consecutive failures, and mandatory RFC 6238 TOTP two-factor authentication for Admin and Manager.
2. **Equipment Register**: Plant asset registry managing industrial equipment (excavators, spreaders, conveyors, boilers, turbines, pumps) with service hours, lifecycle hours, and Green/Amber/Red health classification.
3. **Audit Log**: Tamper-evident cryptographic SHA-256 hash chain on all system and security events, verified against a separate filesystem anchor (`backend/anchor.json`) to detect row modifications, tail rewrites, and truncation attacks.
4. **Work Orders**: Corrective and preventive work order lifecycle management with a deterministic state machine (`Submitted` -> `Approved` -> `Assigned` -> `In Progress` -> `Completed` -> `Closed`), role-based action permissions, and SLA tracking.
5. **Preventive Maintenance Scheduler**: Automated background cron service running every minute to auto-generate preventive work orders and monitor overdue SLAs with escalation tagging (`DEMO_MODE` supported).
6. **Action Tracker**: Statutory and safety action tracker for tracking compliance items from external regulatory bodies (DGMS, CAG, inquiry committees) with owner progress updates and manager closure verification.
7. **Dashboard**: Executive and operational KPI analytics delivering aggregate work order breakdowns, preventive maintenance compliance percentages, equipment health distribution, and overdue action alerts.
8. **Security Hardening**: Defensive security controls including strict CORS origin whitelisting, Helmet HTTP headers, IP rate limiting, password complexity enforcement, and all reviewed queries use prepared statements.

## Setup & Running

### 1. Install Dependencies
If not already installed, navigate into the backend folder and run:
```bash
cd backend
npm install
```

### 2. Configure Environment
Create `.env` by copying `.env.example`:
```bash
cp .env.example .env
```

#### Environment Variables Reference
| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `5000` | Port on which the Express server listens. |
| `JWT_SECRET` | **Required** | *(64+ char random string)* | Secret key used to sign and verify HMAC SHA-256 JWT tokens. **The server will refuse to start if this is missing.** |
| `DEMO_MODE` | Optional | `false` (or `true`) | When `true`, node-cron treats schedule intervals as minutes for live presentation demos. |
| `FRONTEND_URL` | Optional | `http://localhost:3000` | Whitelisted frontend origin for CORS policies. |

### 3. Seed the Database
Populate initial dummy users (all 5 roles) and 10 equipment items:
```bash
npm run seed
```
> Note: Default seeded user accounts are configured with the password **`NlcSecure@2026!`**, conforming to the system password policy ($\ge 10$ characters, uppercase, lowercase, number, symbol).

### 4. Start the Server
Run:
```bash
npm start
```
The server will start at `http://localhost:5000`.

### 5. Reset 2FA for a Demo Account
Clear TOTP two-factor authentication (`totp_secret = NULL`, `totp_enabled = 0`) for an account during testing:
```bash
npm run reset-2fa -- <email>
# Example: npm run reset-2fa -- admin@nlc.in
```

## Testing the Health Check
You can test that the server is up and responding by sending a `GET` request to `/api/health`:

- **Using a browser**: Open `http://localhost:5000/api/health`
- **Using cURL**:
  ```bash
  curl http://localhost:5000/api/health
  ```
- **Using PowerShell**:
  ```powershell
  Invoke-RestMethod -Uri http://localhost:5000/api/health
  ```

**Expected Response**:
```json
{
  "status": "ok"
}
```

## Automated API Integration Tests

Run the built-in end-to-end integration test suite using Node's native test runner (`node:test`):

```bash
npm run test:api
```

The test suite validates:
1. **Authentication**: Uniform error messages for wrong passwords vs. unknown emails (enumeration mitigation).
2. **Work Orders**: Rejection of invalid lifecycle state transitions (HTTP 400).
3. **Equipment Register**: RBAC enforcement (Technician receives HTTP 403 on `POST /api/equipment`).
4. **Audit Log**: Chain and separate anchor file integrity on a clean database (HTTP 200, `valid: true`).
5. **Audit Log**: Tamper detection on row mutation and recovery after restoration.
6. **Security Hardening**: Rate limiter enforcement (11th rapid login attempt triggers HTTP 429).

## Authentication (2FA / TOTP Endpoints)

The backend supports RFC 6238 Time-based One-Time Passwords (TOTP) via `otplib` and `qrcode`.

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/2fa/setup` | Bearer JWT | Generates new base32 secret, otpauth URI, and QR Code Data URL. |
| `POST` | `/api/auth/2fa/enable` | Bearer JWT | Validates initial 6-digit TOTP code and marks `totp_enabled = 1`. |
| `POST` | `/api/auth/2fa/verify` | Public (Rate-limited) | Exchanges 5-minute `tempToken` + 6-digit code for full 1-hour JWT. |

### Mandatory 2FA Roles
- **Admin** and **Manager** roles require 2FA.
- If not yet enabled, standard login returns full JWT with flag `"needs2faSetup": true`.
- Once enabled, login returns `"requires2fa": true` and `"tempToken": "..."` (valid 5 mins), requiring `/api/auth/2fa/verify` to complete authentication.

## Audit Log & Separate Anchor File

- **Hash Chain**: Every database event is cryptographically linked with SHA-256 (`prev_hash` -> `hash`).
- **Separate Anchor File (`backend/anchor.json`)**: After every audit write, the latest row ID and hash are written to `backend/anchor.json`.
- **Integrity Verification (`GET /api/audit/verify`)**:
  - Validates sequence of SHA-256 block hashes from row 1 to $N$.
  - Validates that the latest row ID and hash match `backend/anchor.json`.
  - Flags **`TRUNCATION_DETECTED`** if tail rows have been deleted.
  - Flags **`TAIL_REWRITE_DETECTED`** if the last row was rewritten.

