# Test Group T3: Security Hardening, Defenses, Audit Chains & Data Isolation
**Execution Date:** 2026-11-12T15:14:09.098Z  
**Tested Environment:** http://localhost:5000  
**Evaluator Role:** Independent QA Tester  

---

## Summary of Test Results

| ID | What Was Tested | Expected Result | Actual Result / Output | Status |
| :--- | :--- | :--- | :--- | :---: |
| **T3.1** | Rate limit: 11 rapid wrong logins from one client returns 429 on the 11th | 1st-10th return HTTP 401; 11th returns HTTP 429 with rate limit message | Attempts 1-10: HTTP 401, Attempt 11: HTTP 429 ({"error":"Too many login attempts from this IP address. Please try again after 15 minutes."}) | ✅ **PASS** |
| **T3.2** | CORS policy enforcement (http://localhost:9999 unauthorized vs http://localhost:3000 allowed) | Origin http://localhost:3000 receives Access-Control-Allow-Origin: http://localhost:3000; http://localhost:9999 receives no CORS allow headers | Allowed origin (3000): HTTP 200, ACAO='http://localhost:3000', ACAC='true'; Preflight ACAO='http://localhost:3000'; Denied origin (9999): HTTP 500, ACAO=null (omitted) | ✅ **PASS** |
| **T3.3** | H1: Server startup refusal without valid JWT_SECRET in environment | Process exits with code 1 and logs '[FATAL ERROR] Missing required environment variable: JWT_SECRET' | Exit Code: 1, Fatal log present: true, Refusal message present: true | ✅ **PASS** |
| **T3.4** | H2: Password policy enforcement for weak vs policy-compliant credentials | Weak passwords (<10 chars, missing upper/lower/digit/symbol) rejected with exact errors; compliant accepted; seed.js enforces check | Weak passwords rejected: true (tested 5 edge cases), Compliant ('NlcSecure@2026!') accepted: true, seed.js enforcement guard: true | ✅ **PASS** |
| **T3.5** | H3: Manager 2FA lifecycle (setup, enable, pending token rejection, wrong code 401, verify rate limit 429, valid code 200) | Setup generates secret/QR; enable activates 2FA; login gives pending token; pending token rejected on /equipment (401); wrong code rejected (401); 6th attempt returns 429; correct code returns full JWT (200) | Setup needs2faSetup=true, QR present=true; Enable totp_enabled=true; Pending token on /equipment: HTTP 401; Wrong code: HTTP 401; 6th verify attempt: HTTP 429 (429 rate limited: true); Valid TOTP verify: HTTP 200 (Token received: true); Equipment access with full token: HTTP 200 | ✅ **PASS** |
| **T3.6** | H5: Cryptographic audit log hash chain, truncation detection, and row tamper diagnosis | Clean log -> valid: true; Deleted tail row -> valid: false (TRUNCATION_DETECTED); Restored -> valid: true; Mutated row -> valid: false (HASH_MISMATCH at exact brokenRowId); Restored -> valid: true | Clean verify: valid=true (count: 90); Tail truncation: valid=false, reason='TRUNCATION_DETECTED', anchorRowId=122; Restored: valid=true; Row tamper at ID #34: valid=false, reason='HASH_MISMATCH', brokenRowId=34; Final restored verify: valid=true | ✅ **PASS** |
| **T3.7** | H6: Backend SQL parameterization audit and complete route authentication/authorization status catalog | Zero SQL string concatenations or unparameterized queries found; all routes cataloged with auth and authorize status | Dynamic request data concatenations/interpolations: 0 (Scanned 15 JS files; verified 8 modular constant queries with '?' parameters); Total API routes cataloged: 30 | ✅ **PASS** |
| **T3.8** | C6: Sensitive field exposure and error stack trace leakage audit across API endpoints | Zero exposures of password_hash, totp_secret, or server stack traces across success and error responses | Probed 13 core and error endpoints. Leakage findings: 0 (Clean: 0 password_hash, 0 totp_secret, 0 stack traces detected) | ✅ **PASS** |

---

### Verdict: 8/8 Tests Passed (100%)
All tested criteria under Test Group T3 passed successfully with zero failures.

---

### Appendix: H6 Route Authentication & Authorization Catalog

| Method | Route Path | Source File | Authenticated | Authorized Roles |
| :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | `index.js` | No | Public |
| `GET` | `/api/actions` | `actions.js` | Yes | All Authenticated Roles |
| `GET` | `/api/actions/:id` | `actions.js` | Yes | All Authenticated Roles |
| `POST` | `/api/actions` | `actions.js` | Yes | Admin, Manager |
| `PATCH` | `/api/actions/:id/progress` | `actions.js` | Yes | All Authenticated Roles |
| `PATCH` | `/api/actions/:id/verify` | `actions.js` | Yes | Manager, Admin |
| `GET` | `/api/audit/verify` | `audit.js` | Yes | Admin |
| `GET` | `/api/audit` | `audit.js` | Yes | Admin |
| `POST` | `/api/auth/login` | `auth.js` | No | Public |
| `POST` | `/api/auth/2fa/setup` | `auth.js` | Yes | All Authenticated Roles |
| `POST` | `/api/auth/2fa/enable` | `auth.js` | Yes | All Authenticated Roles |
| `POST` | `/api/auth/2fa/verify` | `auth.js` | No | Public |
| `GET` | `/api/auth/me` | `auth.js` | Yes | All Authenticated Roles |
| `GET` | `/api/dashboard/stats` | `dashboard.js` | Yes | Manager, Admin |
| `GET` | `/api/equipment` | `equipment.js` | Yes | All Authenticated Roles |
| `POST` | `/api/equipment` | `equipment.js` | Yes | Admin, Manager |
| `PUT` | `/api/equipment/:id` | `equipment.js` | Yes | Admin, Manager |
| `PUT` | `/api/equipment` | `equipment.js` | Yes | Admin, Manager |
| `GET` | `/api/pm-schedules` | `pmSchedules.js` | Yes | Manager, Admin |
| `POST` | `/api/pm-schedules` | `pmSchedules.js` | Yes | Manager, Admin |
| `POST` | `/api/work-orders` | `workOrders.js` | Yes | All Authenticated Roles |
| `GET` | `/api/work-orders` | `workOrders.js` | Yes | All Authenticated Roles |
| `GET` | `/api/work-orders/:id` | `workOrders.js` | Yes | All Authenticated Roles |
| `PATCH` | `/api/work-orders/:id/approve` | `workOrders.js` | Yes | Supervisor, Admin |
| `PATCH` | `/api/work-orders/:id/reject` | `workOrders.js` | Yes | Supervisor, Admin |
| `PATCH` | `/api/work-orders/:id/assign` | `workOrders.js` | Yes | Manager, Admin |
| `PATCH` | `/api/work-orders/:id/start` | `workOrders.js` | Yes | All Authenticated Roles |
| `PATCH` | `/api/work-orders/:id/complete` | `workOrders.js` | Yes | All Authenticated Roles |
| `PATCH` | `/api/work-orders/:id/verify-close` | `workOrders.js` | Yes | All Authenticated Roles |
| `PATCH` | `/api/work-orders/:id/reopen` | `workOrders.js` | Yes | All Authenticated Roles |
