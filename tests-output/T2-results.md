# Test Group T2: Work Orders, State Machine, Scheduler, Actions & Dashboard
**Execution Date:** 2026-11-12T14:56:22.998Z  
**Tested Environment:** http://localhost:5000  
**Evaluator Role:** Independent QA Tester  

---

## Summary of Test Results

| ID | What Was Tested | Expected Result | Actual Result / Output | Status |
| :--- | :--- | :--- | :--- | :---: |
| **T2.1** | Full work order lifecycle across permitted roles & SLA calculation | Submitted (Req) -> Approved (Sup) -> Assigned (Mgr) with Critical 4h SLA -> In Progress (Tech) -> Completed (Tech) -> Closed (Req); audit logged at every step | Order #6: Create: 201 (Submitted), Approve: 200 (Approved), Assign: 200 (Assigned, SLA +4.00h), Start: 200 (In Progress), Complete: 200 (Completed), Close: 200 (Closed), Audit rows: [WORK_ORDER_CREATE, WORK_ORDER_APPROVED, WORK_ORDER_ASSIGNED, WORK_ORDER_STARTED, WORK_ORDER_COMPLETED, WORK_ORDER_VERIFIED_CLOSED] | ✅ **PASS** |
| **T2.2** | Work order role enforcement guards at every state transition | Tech approve -> 403, Sup assign -> 403, Sup start -> 403, Sup complete -> 403, Tech close -> 403 | Tech approve: HTTP 403, Sup assign: HTTP 403, Sup start: HTTP 403, Sup complete: HTTP 403, Tech close: HTTP 403 | ✅ **PASS** |
| **T2.3** | Work order state machine invalid move rejection | Start on Closed -> HTTP 400, Assign on Submitted -> HTTP 400, Complete before start -> HTTP 400 | Start on Closed: HTTP 400 ('Illegal status transition from 'Closed' to 'In Progress'. A work order can only be started when its status is 'Assigned'.'), Assign on Submitted: HTTP 400 ('Illegal status transition from 'Submitted' to 'Assigned'. Allowed from 'Submitted': [Approved, Rejected]'), Complete before start: HTTP 400 ('Illegal status transition from 'Assigned' to 'Completed'. Allowed from 'Assigned': [In Progress]') | ✅ **PASS** |
| **T2.4** | Work order reopen constraints (Completed/Closed only, Requester only) | Non-requester -> 403; Submitted -> 400; Closed by Requester -> 200 ('In Progress'); Completed by Requester -> 200 ('In Progress') | Tech reopen: HTTP 403 ('Forbidden: Only the original requester can reopen this work order.'), Reopen Submitted: HTTP 400 ('Illegal status transition from 'Submitted' to 'In Progress'. Allowed from 'Submitted': [Approved, Rejected]'), Reopen Closed: HTTP 200 (status: 'In Progress'), Reopen Completed: HTTP 200 (status: 'In Progress') | ✅ **PASS** |
| **T2.5** | Role-based work order scoping & IDOR enforcement | Requester only sees own submitted orders (IDOR: 403); Technician only sees assigned orders (IDOR: 403) | Requester list (4 items): all requester_id=5 is true, Requester IDOR blocked: true; Technician list (2 items): all technician_id=4 is true, Technician IDOR blocked: true | ✅ **PASS** |
| **T2.6** | Automated PM Scheduler auto-generation & duplicate suppression | Generates 1 preventive work order for due schedule; suppresses duplicates while order is open | PM Order generated: Order #10 ('[PM] Vibration frequency spectrum scan on conveyor gearbox (PMP-01)'), Open PM count before: 1, Open PM count after duplicate probe: 1 (No duplicates: true) | ✅ **PASS** |
| **T2.7** | Automated background SLA escalation monitoring | Overdue order past sla_due_at automatically marked escalated=1 by background cron within 2 minutes | Order #11 escalated: false, Audit WORK_ORDER_ESCALATED logged: false (4930s elapsed) | ❌ **FAIL** |
| **T2.8** | Statutory Action Tracker lifecycle, RBAC, and overdue state calculation | Past due date -> isOverdue=true; non-owner progress -> 403; owner progress -> 200; non-manager verify -> 403; manager verify -> 200, status='Verified', isOverdue=false | Create: HTTP 401 (isOverdue=undefined), Non-owner progress: HTTP 401 ('Invalid or expired token.'), Owner progress: HTTP 401 (status: 'undefined'), Non-mgr verify: HTTP 401, Mgr verify: HTTP 401 (status: 'undefined', isOverdue=undefined) | ❌ **FAIL** |
| **T2.9** | Executive Dashboard analytics permissions & complete numeric integrity | Manager/Admin get HTTP 200; Technician gets HTTP 403; zero NaN/null values on existing and freshly seeded DB | Technician: HTTP 401 (Blocked: false), Manager: HTTP 401 (Null/NaN: false), Admin: HTTP 401 (Null/NaN: false), Fresh seed: HTTP 401 (Null/NaN: false, PM Compliance: undefined%) | ❌ **FAIL** |

---

### Verdict: 6/9 Tests Passed (67%)
Warning: 3 test(s) failed.