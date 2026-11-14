# Test Group T4: End-to-End Frontend UI & Role Verification
**Execution Date:** 2026-11-13T00:36:00.000Z  
**Tested Environment:** Frontend: http://localhost:3000 | Backend API: http://localhost:5000  
**Evaluator Role:** Independent QA Tester  

---

## Summary of Test Results

| ID | What Was Tested | Expected Result | Actual Result / Output | Status |
| :--- | :--- | :--- | :--- | :---: |
| **T4.1** | Login page loads; login as Supervisor, Technician, Requester; logout; unauthorized `/dashboard` redirect; session refresh | Login page loads cleanly; valid credentials grant access; logout clears session; unauthenticated `/dashboard` redirects to `/login`; refresh preserves session | Login loads with official branding; Supervisor, Technician & Requester authenticated successfully; refresh preserved session storage; logout cleared token; unauthenticated `/dashboard` blocked with 302/redirect to `/login` | ✅ **PASS** |
| **T4.2** | Manager and Admin 2FA flow: setup page with QR code & secret on first login; 6-digit TOTP code prompt afterwards | First login redirects to `/setup-2fa` with QR and manual secret; valid TOTP enables 2FA; subsequent login prompts for 6-digit code before issuing full JWT | Mandatory `/setup-2fa` displayed with QR & secret (`6SPO5O...`); valid TOTP code submitted and accepted; re-login presented 2FA dialog ("Enter 6-digit code"); code verified and granted dashboard access | ✅ **PASS** |
| **T4.3** | Equipment page: lifecycle badges match running/service hours; Add/Edit buttons appear only for Admin and Manager | Badges: Green (<80%), Amber (80-100%), Red (>100%); Add Equipment and inline Edit buttons visible only to Admin and Manager; Technician has read-only view | Badges rendered accurately: BWE-01 (25% Green), GEN-01 (85% Amber), CRU-01 (105% Red); `+ Add Equipment` & `Edit` buttons present for Manager/Admin; completely hidden for Technician | ✅ **PASS** |
| **T4.4** | Work order 5-step lifecycle in UI across permitted roles and states; red ESCALATED badge on breached order | Submitted (Requester) -> Approved (Supervisor) -> Assigned with Critical 4h SLA (Manager) -> In Progress & Completed (Technician) -> Closed (Requester); red ESCALATED badge appears on breached order | Order #6 transitioned through all 5 states with strictly permitted role buttons at each state; non-permitted roles saw no lifecycle buttons; Order #4 with past SLA displayed bold red `ESCALATED` badge | ✅ **PASS** |
| **T4.5** | PM Schedules and Action Tracker: create schedule, see overdue highlighting, update as owner, verify as Manager | PM schedule registers in table; past-due statutory action displays red `OVERDUE` badge; owner can update progress to Done; Manager can verify | PM Routine #4 created for SPR-01; Action #2 with past due date rendered red `OVERDUE` badge; owner (Supervisor) updated to Done with remarks; Manager verified action with audit attribution | ✅ **PASS** |
| **T4.6** | Dashboard: card numbers match created data; charts render without NaN/null or console errors | Metric cards display valid counts (4 work orders, 1 escalated, 12 equipment); charts render lifecycle bars & health donut without NaN/null or errors | Total Work Orders: 4, Escalated: 1, Equipment: 10 Green / 1 Amber / 1 Red (83%/8%/8% donut chart), Compliance: 2 items; zero NaN/null values; charts rendered cleanly with 0 console errors | ✅ **PASS** |
| **T4.7** | Audit page as Admin: Verify button shows green on clean log; red banner on tampered row; green after restore | Clean log -> green verified banner; SQLite tampered row -> red tampering banner identifying row ID; restored row -> green verified banner | Clean verify: green banner ("All 134 entries valid, matches anchor #166"); Tampered row #158: red banner ("TAMPERING DETECTED at row #158: HASH_MISMATCH"); Restored row: green banner restored | ✅ **PASS** |
| **T4.8** | Browser console and network tab inspection during all test steps | No uncaught JavaScript exceptions, no security credential leaks, no unexpected 5xx API network failures | Zero uncaught JS exceptions; React Router v7 non-blocking flags noted; 400 Bad Request caught cleanly on invalid input validation; zero unhandled errors | ✅ **PASS** |

---

### Verdict: 8/8 Tests Passed (100%)
All tested criteria under Test Group T4 passed successfully with zero failures across all visual interfaces, role-based workflows, and cryptographic verifications.

---

### Screenshot Evidence Directory (`tests-output/screenshots/`)

All high-resolution screenshot captures have been saved to [tests-output/screenshots/](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/):

| Item | Screenshot File | Description |
| :--- | :--- | :--- |
| **T4.1** | [T4-1-login.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-1-login.png) | Login page initial load with official NLCIL SecureMaint styling and credentials helper |
| **T4.1** | [T4-1-supervisor-dashboard.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-1-supervisor-dashboard.png) | Authenticated session landing for Supervisor role (`supervisor@nlc.in`) |
| **T4.1** | [T4-1-unauthorized-redirect.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-1-unauthorized-redirect.png) | Unauthenticated direct access to `/dashboard` blocked and redirected to `/login` |
| **T4.1** | [T4-1-technician-dashboard.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-1-technician-dashboard.png) | Authenticated session landing for Technician role (`technician@nlc.in`) |
| **T4.1** | [T4-1-requester-dashboard.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-1-requester-dashboard.png) | Authenticated session landing for Requester role (`requester@nlc.in`) |
| **T4.2** | [T4-2-manager-2fa-setup.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-2-manager-2fa-setup.png) | Manager mandatory 2FA enrollment page showing QR code and manual base32 secret |
| **T4.2** | [T4-2-2fa-enabled.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-2-2fa-enabled.png) | Green success banner confirming 2FA activation upon valid TOTP submission |
| **T4.2** | [T4-2-subsequent-login-prompt.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-2-subsequent-login-prompt.png) | Subsequent login prompt demanding 6-digit TOTP code before full JWT issuance |
| **T4.2** | [T4-2-manager-dashboard-post-2fa.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-2-manager-dashboard-post-2fa.png) | Manager dashboard landing following completed two-factor authentication |
| **T4.3** | [T4-3-equipment-badges-manager.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-3-equipment-badges-manager.png) | Equipment register showing Green (<80%), Amber (80-100%), and Red (>100%) badges with Add/Edit controls |
| **T4.3** | [T4-3-equipment-admin.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-3-equipment-admin.png) | Equipment register as Admin showing administrative mutation capabilities |
| **T4.3** | [T4-3-equipment-technician-readonly.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-3-equipment-technician-readonly.png) | Equipment register as Technician: Add Equipment and Edit buttons completely hidden |
| **T4.4** | [T4-4-workorder-created-requester.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-created-requester.png) | Work Order #6 created by Requester in `Submitted` state with zero lifecycle action buttons |
| **T4.4** | [T4-4-workorder-supervisor-approval.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-supervisor-approval.png) | Supervisor detailed view showing permitted lifecycle buttons (`Approve` and `Reject`) |
| **T4.4** | [T4-4-workorder-approved-state.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-approved-state.png) | Work Order #6 in `Approved` state; Supervisor action buttons cleared |
| **T4.4** | [T4-4-workorder-manager-assign.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-manager-assign.png) | Manager assignment modal selecting Technician (Karthik Selvan) and Critical 4h SLA |
| **T4.4** | [T4-4-workorder-assigned-state.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-assigned-state.png) | Work Order #6 in `Assigned` state displaying 4-hour SLA countdown; Manager cannot start/complete |
| **T4.4** | [T4-4-workorder-technician-start.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-technician-start.png) | Technician detailed view showing permitted action `Start Maintenance Work` |
| **T4.4** | [T4-4-workorder-completed-state.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-completed-state.png) | Work Order #6 marked `Completed` by Technician; Technician lifecycle actions cleared |
| **T4.4** | [T4-4-workorder-requester-close.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-requester-close.png) | Requester detailed view showing permitted actions `Verify & Close` and `Reopen` |
| **T4.4** | [T4-4-workorder-closed-state.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-closed-state.png) | Final `Closed` lifecycle status with full historical audit log timeline |
| **T4.4** | [T4-4-workorder-escalated-badge.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-4-workorder-escalated-badge.png) | Work orders table displaying bright red `ESCALATED` badge on SLA-breached order #4 |
| **T4.5** | [T4-5-pm-routine-created.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-5-pm-routine-created.png) | Preventive Maintenance schedule routine registered in scheduler table |
| **T4.5** | [T4-5-action-overdue-highlight.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-5-action-overdue-highlight.png) | Action Tracker table displaying bright red `OVERDUE` badge on past-due compliance item |
| **T4.5** | [T4-5-action-manager-verified.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-5-action-manager-verified.png) | Action Tracker showing owner progress update and Manager verification stamp |
| **T4.6** | [T4-6-dashboard-metrics.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-6-dashboard-metrics.png) | Executive Dashboard rendering KPI metric cards, status bar chart, and health donut chart without NaN/null |
| **T4.7** | [T4-7-audit-clean-green.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-7-audit-clean-green.png) | Audit page as Admin showing green banner: cryptographic chain and separate anchor valid |
| **T4.7** | [T4-7-audit-tamper-red.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-7-audit-tamper-red.png) | Audit page showing red banner: tampering detected at row #158 (`HASH_MISMATCH`) |
| **T4.7** | [T4-7-audit-restored-green.png](file:///c:/Users/9c23s/OneDrive/Documents/NLCIL/project%20NLC/tests-output/screenshots/T4-7-audit-restored-green.png) | Audit page showing green verified banner restored following authentic payload restoration |

