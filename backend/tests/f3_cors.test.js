// Test Suite for Task F3: CORS Policy Enforcement
// Tests clean 403 JSON error for disallowed origins (without allow headers and without stack traces)
// and normal CORS handling for whitelisted origins.

const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = process.env.API_URL || "http://localhost:5000";

test("Task F3: CORS Policy Enforcement Tests", async (t) => {
  // Test 1: Disallowed Origin receives clean HTTP 403 JSON without allow headers or stack trace
  await t.test("1. Disallowed origin receives HTTP 403 JSON without CORS allow headers or error stack", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      headers: { "Origin": "http://localhost:9999" }
    });
    const body = await res.json();
    const acaoHeader = res.headers.get("access-control-allow-origin");

    assert.equal(res.status, 403, `Disallowed origin must return HTTP 403 (got ${res.status})`);
    assert.equal(acaoHeader, null, "Disallowed origin must NOT receive Access-Control-Allow-Origin header");
    assert.ok(body.error, "Response body must contain error message");
    assert.match(body.error, /CORS/i, "Error message must reference CORS policy");
    assert.equal(body.stack, undefined, "Response body must not expose error stack trace");
  });

  // Test 2: Allowed Origin receives HTTP 200 with appropriate CORS headers
  await t.test("2. Allowed origin receives HTTP 200 with Access-Control-Allow-Origin and credentials headers", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      headers: { "Origin": "http://localhost:3000" }
    });
    const body = await res.json();
    const acaoHeader = res.headers.get("access-control-allow-origin");
    const acacHeader = res.headers.get("access-control-allow-credentials");

    assert.equal(res.status, 200, "Allowed origin must receive HTTP 200");
    assert.equal(acaoHeader, "http://localhost:3000", "Access-Control-Allow-Origin must match requesting allowed origin");
    assert.equal(acacHeader, "true", "Access-Control-Allow-Credentials must be true");
    assert.deepEqual(body, { status: "ok" });
  });

  // Test 3: Disallowed Origin preflight OPTIONS request
  await t.test("3. Disallowed origin preflight OPTIONS receives HTTP 403 without allow headers", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:9999",
        "Access-Control-Request-Method": "GET"
      }
    });
    const acaoHeader = res.headers.get("access-control-allow-origin");

    assert.equal(res.status, 403, `Disallowed preflight must return HTTP 403 (got ${res.status})`);
    assert.equal(acaoHeader, null, "Disallowed preflight must NOT receive Access-Control-Allow-Origin header");
  });

  // Test 4: Allowed Origin preflight OPTIONS request
  await t.test("4. Allowed origin preflight OPTIONS receives HTTP 204 with Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
      }
    });
    const acaoHeader = res.headers.get("access-control-allow-origin");

    assert.equal(res.status, 204, "Allowed preflight must return HTTP 204 No Content");
    assert.equal(acaoHeader, "http://localhost:3000", "Preflight must return Access-Control-Allow-Origin");
  });
});

