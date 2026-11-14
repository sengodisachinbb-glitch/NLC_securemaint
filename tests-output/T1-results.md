# Test Group T1: Core Foundation, Authentication, Equipment & Audit Log
**Execution Date:** 2026-11-12T11:59:06.219Z  
**Tested Environment:** http://localhost:5000  
**Evaluator Role:** Independent QA Tester  

---

## Summary of Test Results

| ID | What Was Tested | Expected Result | Actual Result / Output | Status |
| :--- | :--- | :--- | :--- | :---: |
| **T1.1** | GET /api/health availability and response payload | HTTP 200 with {"status":"ok"} | HTTP 200 with {"status":"ok"} | ✅ **PASS** |
| **T1.2** | Idempotent database seeding (npm run seed x2) | Exactly 5 users and 10 equipment items, 0 duplicates, 0 plaintext passwords (all bcrypt) | Users: 5, Equipment: 10, Duplicates: (Users: 0, Equip: 0), Plaintext: 0, Valid bcrypt hashes: true | ✅ **PASS** |
| **T1.3** | Authentication with valid credentials (Supervisor & Technician) | HTTP 200 returning valid signed JWT token for both accounts | Supervisor: HTTP 200 (token length: 297), Technician: HTTP 200 (token length: 307) | ✅ **PASS** |
| **T1.4** | Account enumeration mitigation (wrong password vs unknown email) | Both return HTTP 401 with identical message: 'Invalid email or password.' | Unknown email: HTTP 401 ('Invalid email or password.'), Wrong password: HTTP 401 ('Invalid email or password.') [Identical: true] | ✅ **PASS** |
| **T1.5** | Account lockout after 5 consecutive failed login attempts | 5th failed attempt locks account (HTTP 403); subsequent correct password is refused with HTTP 403 | 5th attempt: HTTP 403 ('Account locked for 15 minutes due to 5 consecutive failed login attempts.'), Correct password while locked: HTTP 403 ('Account is temporarily locked due to 5 failed attempts. Please try again in 15 minute(s).'), locked_until: 2026-11-12T12:14:06.193Z | ✅ **PASS** |
| **T1.6** | GET /api/auth/me token authentication states | No token -> HTTP 401, Fake token -> HTTP 401, Valid token -> HTTP 200 with user profile | No token: HTTP 401 ('Access denied. No authentication token provided.'), Fake token: HTTP 401 ('Invalid or expired token.'), Valid token: HTTP 200 (user: 'Suresh Murugan (Supervisor)', role: 'Supervisor') | ✅ **PASS** |
| **T1.7** | Equipment Register RBAC & Input Validation | GET: HTTP 200 for any role; POST/PUT: HTTP 403 for Technician; POST: HTTP 201 for Manager; Invalid POST: HTTP 400 | GET (Tech): HTTP 200 (10 items), POST (Tech): HTTP 403 ('Forbidden: role 'Technician' does not have permission to access this resource.'), PUT (Tech): HTTP 403 ('Forbidden: role 'Technician' does not have permission to access this resource.'), POST (Manager): HTTP 201 (ID: 83), Invalid POST: HTTP 400 (7 validation errors) | ✅ **PASS** |
| **T1.8** | Equipment degradation lifecycle calculation (RAG Life Status) | 50% usage -> 'Green', 90% usage -> 'Amber', 110% usage -> 'Red' | 50% (5,000 hrs / 10,000 hrs): 'Green', 90% (9,000 hrs / 10,000 hrs): 'Amber', 110% (11,000 hrs / 10,000 hrs): 'Red' | ✅ **PASS** |
| **T1.9** | Audit Log cryptographic hash chain & role authorization | First row prev_hash is GENESIS; all rows sequentially chained; login & equipment actions present; Admin access HTTP 200 (valid: true); Non-admin access HTTP 403 | First prev_hash: 'GENESIS', Chain integrity: true (61 entries), Login & Equip actions logged: (Login: true, Equip: true), Admin /audit: HTTP 200, Admin /verify: HTTP 200 (valid: true), Tech /audit: HTTP 403, Tech /verify: HTTP 403 | ✅ **PASS** |

---

### Verdict: 9/9 Tests Passed (100%)
All tested criteria under Test Group T1 passed successfully with zero failures.