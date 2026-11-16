# OWASP ZAP Security Scanning Evidence

## Tool & Version
- **Tool**: OWASP ZAP by Checkmarx
- **Version**: 2.17.0

## Scan Configuration
- **Scan Type**: Unauthenticated Automated & Active Scan
- **Scan Policy**: Dev Standard policy
- **Spiders**: Traditional Spider + Client Spider (Chrome Headless)

## Scan Targets & Results

| Target | Scan Mode / Stage | Results Summary | Key Findings / Status |
| :--- | :--- | :--- | :--- |
| **Frontend Dev Server** (`http://localhost:3000`) | Before Fixes (Dev Standard) | **0 High, 2 Medium, 2 Low, 5 Informational** | Medium: *CSP: Failure to Define Directive with No Fallback*, *CSP: style-src 'unsafe-inline'*. Low: *HSTS not set*, *X-Content-Type-Options missing*. |
| **Frontend Dev Server** (`http://localhost:3000`) | After Fixes (Dev Standard) | **0 High, 1 Medium, 1 Low, 5 Informational** | Resolved: *CSP: Failure to Define Directive with No Fallback* (added `form-action`, `base-uri`, `frame-ancestors`, `object-src 'none'`), resolved missing *nosniff* on Fast Refresh preamble. Retained: *style-src 'unsafe-inline'* (required by React/Vite dev server; accepted dev-mode risk), *HSTS* (dev on plain HTTP). |
| **Backend API** (`http://localhost:5000`) | Active Scan via `tests-output/zap-urls.txt` | **0 High, 0 Medium, 0 Low, 0 Informational (No alerts)** | Zero alerts raised. All 10 protected routes rejected unauthenticated requests with HTTP 401. All invalid/fuzzed paths returned clean HTTP 404. Strict Helmet CSP and security headers active on all endpoints. |

## Documented Limitations
- **Unauthenticated Scan Only**: Protected routes (`/api/work-orders`, `/api/equipment`, `/api/audit`, `/api/actions`, `/api/pm-schedules`, `/api/dashboard/stats`) strictly enforced authentication and returned HTTP 401 to the scanner. The business logic and data processing behind authentication were not exercised by ZAP attacks.
- **No Authenticated Scan**: An authenticated scan using an active session bearer token was not performed.
- **Accepted Risks**: Inline styles (`style-src 'unsafe-inline'`) are permitted in development mode as required by React and Vite build tooling. Production builds can transition to style nonces or hashes.
