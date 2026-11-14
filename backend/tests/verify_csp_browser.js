// Automated Chrome DevTools Protocol Test for Task Z2 & Z3: CSP & Self-Hosted Inter Font Verification
const fs = require("fs");

async function runCspBrowserVerification() {
  const targets = await fetch("http://127.0.0.1:9444/json/list").then(r => r.json());
  const page = targets.find(t => t.type === "page");
  if (!page) {
    console.error("No browser page target found on port 9444");
    process.exit(1);
  }

  console.log("Connecting to Chrome page via CDP:", page.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  const consoleMessages = [];
  const cspErrors = [];
  const networkRequests = [];

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return res.result?.value;
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p.reject(data.error);
      else p.resolve(data.result);
      return;
    }

    if (data.method === "Network.requestWillBeSent") {
      networkRequests.push(data.params.request.url);
    } else if (data.method === "Runtime.consoleAPICalled") {
      const text = data.params.args.map(a => a.value || a.description || "").join(" ");
      consoleMessages.push({ type: data.params.type, text });
      if (text.toLowerCase().includes("content security policy") || text.toLowerCase().includes("csp") || text.toLowerCase().includes("violates")) {
        cspErrors.push(text);
      }
    } else if (data.method === "Log.entryAdded") {
      const text = data.params.entry.text || "";
      if (text.toLowerCase().includes("content security policy") || text.toLowerCase().includes("csp") || text.toLowerCase().includes("violates")) {
        cspErrors.push(text);
      }
    }
  };

  await new Promise(r => { ws.onopen = r; });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");

  console.log("\n--- STEP 1: Verify Login Page Loads with CSP Headers & Inter Font ---");
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await new Promise(r => setTimeout(r, 2000));

  const loginTitle = await evalJs("document.title");
  const emailInputExists = await evalJs("!!document.querySelector('input[type=\"email\"]')");
  const bodyFontFamily = await evalJs("window.getComputedStyle(document.body).fontFamily");
  const interFontLoaded = await evalJs("document.fonts.check('16px Inter')");

  console.log("Login Page Title:", loginTitle);
  console.log("Email Input Present:", emailInputExists);
  console.log("Body font-family:", bodyFontFamily);
  console.log("Inter font active in document.fonts:", interFontLoaded);

  console.log("\n--- STEP 2: Perform Login as Manager (manager@nlc.in) ---");
  await evalJs(`
    (() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      const form = document.querySelector('form');

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(emailInput, 'manager@nlc.in');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      nativeSetter.call(passInput, 'NlcSecure@2026!');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 2500));

  const postLoginUrl = await evalJs("window.location.href");
  console.log("Current URL after Login:", postLoginUrl);
  const tokenInSession = await evalJs("!!sessionStorage.getItem('token')");
  console.log("JWT Token stored in sessionStorage:", tokenInSession);

  console.log("\n--- STEP 3: Verify 2FA Setup QR Code Rendering ---");
  if (!postLoginUrl.includes("/setup-2fa")) {
    await send("Page.navigate", { url: "http://localhost:3000/setup-2fa" });
    await new Promise(r => setTimeout(r, 2000));
  }

  const qrImageSrc = await evalJs("document.querySelector('img[src^=\"data:image/png;base64\"]')?.src || ''");
  console.log("2FA Setup QR Image Found:", qrImageSrc.startsWith("data:image/png;base64"));

  console.log("\n--- STEP 4: Navigate to /dashboard and Verify Recharts Charts ---");
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await new Promise(r => setTimeout(r, 2500));

  const chartSvgs = await evalJs("document.querySelectorAll('.recharts-surface').length");
  console.log("Recharts SVG Elements Rendered:", chartSvgs);

  console.log("\n--- STEP 5: Verify Offline / Zero External Network Requests ---");
  const externalRequests = networkRequests.filter(url => {
    return !url.startsWith("http://localhost:") && !url.startsWith("http://127.0.0.1:") && !url.startsWith("data:") && !url.startsWith("blob:");
  });
  console.log("Total Network Requests Logged:", networkRequests.length);
  console.log("External / CDN / Google Fonts Requests:", externalRequests.length);
  if (externalRequests.length > 0) {
    console.log("External Requests:", externalRequests);
  } else {
    console.log("Confirmed: ZERO external CDN/Google Fonts requests! Purely self-hosted and air-gap compatible.");
  }

  console.log("\n--- STEP 6: Content Security Policy Violation Summary ---");
  console.log("Total CSP Errors Caught in Console:", cspErrors.length);
  if (cspErrors.length > 0) {
    console.log("CSP Errors Details:", cspErrors);
  } else {
    console.log("Zero CSP violation errors detected in Chrome Console!");
  }

  ws.close();
  process.exit(cspErrors.length > 0 || externalRequests.length > 0 ? 1 : 0);
}

runCspBrowserVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
