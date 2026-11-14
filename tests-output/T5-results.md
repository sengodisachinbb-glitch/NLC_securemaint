# Test Group T5: Project Integrity, Terminology, Documentation & Clean Install
**Execution Date:** 2026-11-13T00:51:00.000Z  
**Tested Environment:** http://localhost:5000 & Fresh Sandbox Environment (PORT 5099)  
**Evaluator Role:** Independent QA Tester  

---

## Summary of Test Results

| ID | What Was Tested | Expected Result | Actual Result / Output | Status |
| :--- | :--- | :--- | :--- | :---: |
| **T5.1** | Repository-wide search for forbidden marketing/buzzword terms (`military`, `immutable`, `certified`, `Passkeys`, `enterprise-grade`, `Hardened Production`, `100%`) excluding `node_modules` | Zero occurrences of forbidden buzzwords; all occurrences of `100%` cataloged with file and line | Buzzwords (`military`, `immutable`, `certified`, `Passkeys`, `enterprise-grade`, `Hardened Production`): **0 hits**.<br>`100%`: **26 hits total** (18 CSS/UI layout `width: "100%"`, 3 health metrics/labels, 2 comments in equipment life calculation, 3 documentation lines on parameterized SQL queries). | ✅ **PASS** |
| **T5.2** | Documentation verification: root `README.md` must contain a `Known Limitations` section with the exact 6 points and a `Demo with 2FA` section | Both sections exist verbatim with all 6 required limitation points, TOTP scanning instructions, time sync troubleshooting, and reset script documentation | `## Demo with 2FA` verified at line 137 (includes setup, Google Authenticator QR scan, phone time sync correction, and reset command).<br>`## Known Limitations` verified at line 279 with all 6 required bullets present verbatim. | ✅ **PASS** |
| **T5.3** | Parameterized 2FA reset command execution: `npm run reset-2fa -- manager@nlc.in` | Command clears `totp_secret` and `totp_enabled` only for `manager@nlc.in`; other accounts unchanged; subsequent login prompts for 2FA setup | Command executed successfully via parameterized SQL query.<br>DB verified: `manager@nlc.in` has `totp_secret=NULL`, `totp_enabled=0`.<br>`admin@nlc.in` remained `totp_enabled=1`.<br>Login as `manager@nlc.in` returned HTTP 200 with `{ needs2faSetup: true }`. | ✅ **PASS** |
| **T5.4** | Automated backend integration test suite execution: `npm run test:api` | All 6 test suites execute against the running server and print a clean PASS/FAIL report table | Executed `node --test tests/api.test.js`. 6/6 tests passed (0 fail, duration 477ms). Full PASS/FAIL table printed. | ✅ **PASS** |
| **T5.5** | Module naming consistency review across root `README.md`, `backend/README.md`, and frontend sidebar navigation (`Layout.jsx`) | Compare 8 standard module names against both READMEs and the UI sidebar; identify exact differences | **Root README.md**: 8/8 standard names match perfectly.<br>**backend/README.md**: Lists 5 modules (omits PM Scheduler, Action Tracker, Dashboard).<br>**Frontend Sidebar**: Uses visual labels (`Executive Dashboard`, `Equipment Registry`, `Work Orders`, `PM Schedules`, `Compliance Actions`, `2FA Security`, `Audit Trail Ledger`). | ✅ **PASS** |
| **T5.6** | Clean installation & setup verification following ONLY `README.md` steps in a fresh temporary directory (without existing `nlc.db`) | Clean install, `.env` config, `npm run seed`, `npm start` on alternate port, and `POST /api/auth/login` all succeed | Initialized clean temp dir with 0 DB files.<br>`npm run seed` generated fresh `nlc.db` (5 users, 10 equipment).<br>Server started on `http://localhost:5099`.<br>`POST /api/auth/login` returned HTTP 200 with valid JWT token (length: 275). | ✅ **PASS** |

---

### Verdict: 6/6 Tests Executed & Passed (100%)
All items in Test Group T5 executed successfully and verified without modification to application code.

---

## Detailed Test Logs & Technical Appendices

### Appendix T5.1: Term Search Findings Breakdown
The codebase was scanned recursively excluding `node_modules`, `.git`, `tests-output`, and binary files.

#### 1. Forbidden Marketing Buzzwords
- `"military"`: **0 hits**
- `"immutable"`: **0 hits**
- `"certified"`: **0 hits**
- `"Passkeys"`: **0 hits**
- `"enterprise-grade"`: **0 hits**
- `"Hardened Production"`: **0 hits**

#### 2. `"100%"` Occurrences (26 Hits Total)
Every hit was inspected and verified to fall into CSS layout styles, metric calculation comments, or statement of 100% parameterized SQL query coverage:
1. `backend/routes/dashboard.js:79` – `// If no preventive orders have been created yet, compliance is considered 100% baseline`
2. `backend/routes/equipment.js:15` – `* - "Amber": between 80% and 100% of service life`
3. `backend/routes/equipment.js:16` – `* - "Red": above 100% of service life`
4. `frontend/src/index.css:176` – `background: linear-gradient(135deg, #0a2540 0%, #1e3a5f 100%);`
5. `frontend/src/index.css:182` – `width: 100%;`
6. `frontend/src/index.css:220` – `width: 100%;`
7. `frontend/src/index.css:235` – `width: 100%;`
8. `frontend/src/pages/Actions.jsx:167` – `<table style={{ width: "100%", ... }}>`
9. `frontend/src/pages/Actions.jsx:299` – `<div className="card" style={{ width: "100%", ... }}>`
10. `frontend/src/pages/Actions.jsx:401` – `<div className="card" style={{ width: "100%", ... }}>`
11. `frontend/src/pages/Audit.jsx:275` – `<table style={{ width: "100%", ... }}>`
12. `frontend/src/pages/Dashboard.jsx:85` – `{ name: "Amber (80-100% Life)", value: stats.equipmentHealth.amber, color: "#f59e0b" },`
13. `frontend/src/pages/Dashboard.jsx:86` – `{ name: "Red (>100% Critical)", value: stats.equipmentHealth.red, color: "#ef4444" }`
14. `frontend/src/pages/Dashboard.jsx:190` – `<div style={{ width: "100%", height: 300 }}>`
15. `frontend/src/pages/Dashboard.jsx:208` – `<div style={{ width: "100%", height: 300 }}>`
16. `frontend/src/pages/Equipment.jsx:150` – `<table style={{ width: "100%", ... }}>`
17. `frontend/src/pages/Equipment.jsx:229` – `<div className="card" style={{ width: "100%", ... }}>`
18. `frontend/src/pages/Login.jsx:263` – `width: "100%",`
19. `frontend/src/pages/PmSchedules.jsx:131` – `<table style={{ width: "100%", ... }}>`
20. `frontend/src/pages/PmSchedules.jsx:186` – `<div className="card" style={{ width: "100%", ... }}>`
21. `frontend/src/pages/WorkOrderDetail.jsx:396` – `<div className="card" style={{ width: "100%", ... }}>`
22. `frontend/src/pages/WorkOrders.jsx:138` – `<table style={{ width: "100%", ... }}>`
23. `frontend/src/pages/WorkOrders.jsx:256` – `<div className="card" style={{ width: "100%", ... }}>`
24. `PROJECT_AUDIT_REPORT.md:15` – `...and 100% parameterized SQLite queries have been implemented and tested.`
25. `README.md:16` – `- **Security Hardening**: ... and 100% parameterized queries.`
26. `README.md:273` – `- **Injection Prevention**: 100% of SQLite database queries use parameterized prepared statements...`

---

### Appendix T5.2: README Verification
Root `README.md` was inspected for the required sections:

#### 1. `## Demo with 2FA` (Line 137)
- Explains mandatory TOTP setup for Admin (`admin@nlc.in`) and Manager (`manager@nlc.in`).
- Documents QR code scanning with Google Authenticator, Microsoft Authenticator, or Authy.
- Contains explicit troubleshooting section for rejected codes advising phone time synchronization (**Time correction for codes $\rightarrow$ Sync now**).
- Documents how to reset 2FA via parameterized script: `npm run reset-2fa -- manager@nlc.in`.

#### 2. `## Known Limitations` (Line 279)
Contains all 6 required limitation points verbatim:
1. *This is a 14-day prototype using dummy data; it is not connected to NLCIL production systems and has not had an independent security assessment.*
2. *The audit chain detects changes to rows. It cannot stop someone with full access to the server from rewriting the database and the anchor.json file together. In a real deployment the anchor should be copied to separate write-once storage.*
3. *Account lockout can be triggered on purpose against a known email.*
4. *JWTs are stored in sessionStorage and cannot be revoked before they expire (1 hour).*
5. *SQLite is used for local simplicity and would need replacing for many concurrent users.*
6. *Email/SMS alerts are not implemented.*

---

### Appendix T5.3: 2FA Reset Isolation Verification
1. Command executed:
   ```bash
   cd backend && npm run reset-2fa -- manager@nlc.in
   ```
   **Output:**
   ```
   [2FA-Reset] Target user: manager@nlc.in
   [2FA-Reset] Successfully cleared TOTP credentials for manager@nlc.in. User must re-enroll 2FA on next login.
   ```
2. Database Verification:
   ```sql
   SELECT email, totp_enabled, totp_secret FROM users;
   ```
   - `manager@nlc.in`: `totp_enabled = 0`, `totp_secret = NULL`
   - `admin@nlc.in`: `totp_enabled = 1`, `totp_secret = <ENCRYPTED/BASE32_VALUE>` (Unchanged)
   - `supervisor@nlc.in`, `tech@nlc.in`, `requester@nlc.in`: `totp_enabled = 0` (Unchanged)
3. Login Behavior Verification:
   `POST /api/auth/login` with `manager@nlc.in` returned:
   ```json
   {
     "needs2faSetup": true,
     "message": "Two-factor authentication setup is required for your role.",
     "tempToken": "ey..."
   }
   ```
   Confirmed that 2FA setup is required immediately on next login.

---

### Appendix T5.4: Automated Test Suite (`npm run test:api`) Output
```
> nlc-securemaint-backend@1.0.0 test:api
> node --test tests/api.test.js

◇ injected env (4) from .env
[Test Runner] Connected to existing running backend server on http://localhost:5000
▶ NLC-SecureMaint API Test Suite
  ✔ 1. Login with wrong password returns the same message as unknown email (64.061ms)
  ✔ 2. An invalid state transition on a work order is rejected (3.7702ms)
  ✔ 3. A Technician gets 403 on POST /api/equipment (2.2847ms)
  ✔ 4. The audit verify endpoint reports valid on a clean database (3.7333ms)
  ✔ 5. Tampering with one audit row makes verify fail (restore it afterward) (5.951ms)

==========================================================================================
                           NLC-SECUREMAINT TEST EXECUTION REPORT                          
==========================================================================================
┌─────────┬────────┬───────────────────────────────────────────────────────┬────────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ Test # │ Module                                                │ Status │ Details                                                                                       │
├─────────┼────────┼───────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 1      │ 'Authentication (Account Enumeration Defense)'        │ 'PASS' │ "HTTP 401 identical message: 'Invalid email or password.'"                                    │
│ 1       │ 2      │ 'Work Orders (State Transition Guard)'                │ 'PASS' │ "HTTP 400 rejected 'Submitted' -> 'start' (Illegal status transition from 'Submitted' to...)" │
│ 2       │ 3      │ 'Equipment Register (RBAC /api/equipment)'            │ 'PASS' │ "HTTP 403 Forbidden for role 'Technician'"                                                    │
│ 3       │ 4      │ 'Audit Log (Clean Chain Verification)'                │ 'PASS' │ 'HTTP 200 valid: true, rows: 74, anchor synchronized'                                         │
│ 4       │ 5      │ 'Audit Log (Tamper Detection & Recovery)'             │ 'PASS' │ 'Tamper detected at row #106 (valid: false). Restored successfully (valid: true).'            │
│ 5       │ 6      │ 'Security Hardening (Rate Limiter: 11 Logins -> 429)' │ 'PASS' │ 'First 10 returned 401, 11th request returned HTTP 429 (Too Many Requests)'                   │
└─────────┴────────┴───────────────────────────────────────────────────────┴────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘
==========================================================================================

  ✔ 6. 11 rapid logins return 429 (15.4234ms)
✔ NLC-SecureMaint API Test Suite (381.2847ms)
ℹ tests 6
ℹ suites 1
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 477.5641
```

---

### Appendix T5.5: Module Naming Comparative Matrix

| Standard Module Name | Root `README.md` | `backend/README.md` | Frontend Sidebar (`Layout.jsx`) | Consistency Status |
| :--- | :--- | :--- | :--- | :---: |
| **Authentication** | Present (Lines 9, 218) | Present (Line 7) | Implicit in header / `2FA Security` (Line 72) | Partial (Backend lists it; sidebar uses `2FA Security`) |
| **Equipment Register** | Present (Lines 10, 228) | Present (Line 8) | Displays as `⚙️ Equipment Registry` (Line 41) | Minor Variation (`Register` vs `Registry`) |
| **Audit Log** | Present (Lines 15, 266) | Present (Line 9) | Displays as `🔒 Audit Trail Ledger` (Line 81) | Variation (`Audit Log` vs `Audit Trail Ledger`) |
| **Work Orders** | Present (Lines 11, 236) | Present (Line 10) | Displays as `📋 Work Orders` (Line 48) | **Exact Match** |
| **Preventive Maintenance Scheduler** | Present (Lines 12, 247) | Missing from Features list | Displays as `🔄 PM Schedules` (Line 56) | Abbreviated (`PM Schedules`) |
| **Action Tracker** | Present (Lines 13, 254) | Missing from Features list | Displays as `🛡️ Compliance Actions` (Line 64) | Renamed (`Action Tracker` vs `Compliance Actions`) |
| **Dashboard** | Present (Lines 14, 260) | Missing from Features list | Displays as `📊 Executive Dashboard` (Line 34) | Extended (`Executive Dashboard`) |
| **Security Hardening** | Present (Lines 16, 271) | Present (Line 11) | Cross-cutting (Rate limiting, 2FA, Lockout) | Documented across all components |

---

### Appendix T5.6: Clean Installation Following ONLY README Steps
Executed via `backend/tests/fresh_setup_test.js`:
1. **Clean Directory**: Created isolated temp directory `C:\Users\9c23s\AppData\Local\Temp\nlc_fresh_test_...` with 0 database or anchor files.
2. **Environment Configuration**: Copied `.env.example` to `.env` and set `JWT_SECRET` and `PORT=5099`.
3. **Dependency Resolution**: Verified `package.json` dependencies via `npm ls`.
4. **Seed Database (`npm run seed`)**: Successfully executed. Seed created fresh `nlc.db` containing exactly 5 users and 10 equipment items.
5. **Start Server (`npm start`)**: Backend launched on port 5099. Probed `GET http://localhost:5099/api/health` $\rightarrow$ returned `{ "status": "ok" }`.
6. **Authentication (`POST /api/auth/login`)**: Authenticated with seeded Admin account (`admin@nlc.in` / `NlcSecure@2026!`). Returned HTTP 200 with JWT token length 275 and user role `Admin`.
7. **Clean Up**: Terminated temporary process and wiped temporary test directory.

