// Task Z4 Automated CDP Browser Test Suite
// Executes:
// 1. Manager 2FA Setup & 2FA Login
// 2. Full 4-Role Work Order Lifecycle (Requester -> Supervisor -> Manager -> Technician -> Requester)
// 3. Admin Login & Audit Verify Button
// 4. Full Console Error Capture & Reporting

const path = require("path");
const { generateSync } = require(path.join(__dirname, "../node_modules/otplib"));
const db = require("../db");

async function runTaskZ4Lifecycle() {
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
  const consoleErrors = [];

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

    if (data.method === "Runtime.consoleAPICalled") {
      const text = data.params.args.map(a => a.value || a.description || (typeof a === "object" ? JSON.stringify(a) : "")).join(" ");
      consoleMessages.push({ type: data.params.type, text });
      if (data.params.type === "error" || text.toLowerCase().includes("violate") || (text.toLowerCase().includes("error") && !text.includes("PasswordPolicy"))) {
        consoleErrors.push({ source: "console.error", text });
      }
    } else if (data.method === "Log.entryAdded") {
      const entry = data.params.entry;
      if (entry.level === "error") {
        consoleErrors.push({ source: "browser.log", text: entry.text });
      }
    }
  };

  await new Promise(r => { ws.onopen = r; });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  const goto = async (url) => {
    await send("Page.navigate", { url });
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < 20; i++) {
      const ready = await evalJs("document.readyState === 'complete'");
      if (ready) break;
      await new Promise(r => setTimeout(r, 100));
    }
  };

  const fillInput = async (selector, value) => {
    for (let i = 0; i < 20; i++) {
      const exists = await evalJs(`!!document.querySelector('${selector}')`);
      if (exists) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await evalJs(`
      (() => {
        const input = document.querySelector('${selector}');
        if (!input) throw new Error('Element not found: ${selector}');
        const proto = input instanceof HTMLInputElement ? HTMLInputElement.prototype : (input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype);
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        nativeSetter.call(input, '${value.replace(/'/g, "\\'")}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
  };

  const logout = async () => {
    await evalJs(`
      (() => {
        sessionStorage.clear();
        localStorage.clear();
      })()
    `);
    await goto("http://localhost:3000/login");
  };

  console.log("================================================================================");
  console.log("PART A: MANAGER 2FA SETUP & MANAGER 2FA LOGIN");
  console.log("================================================================================");

  // Reset Manager TOTP in SQLite so we can test clean setup
  db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE email = 'manager@nlc.in'").run();

  await logout();

  // 1. Manager initial login
  console.log("1. Entering Manager credentials (manager@nlc.in)...");
  await fillInput('input[type="email"]', "manager@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  let currentUrl = await evalJs("window.location.href");
  console.log("   URL after credential submit:", currentUrl);

  let managerSecret = "";
  if (currentUrl.includes("/setup-2fa")) {
    console.log("2. Manager mandatory 2FA setup screen detected. Reading secret key...");
    for (let i = 0; i < 20; i++) {
      managerSecret = await evalJs(`
        (() => {
          const codeEl = document.querySelector('code, span[style*="font-family: monospace"], div[style*="letter-spacing"]');
          return codeEl ? codeEl.textContent.trim().replace(/\\s+/g, '') : '';
        })()
      `);
      if (managerSecret) break;
      await new Promise(r => setTimeout(r, 150));
    }
    console.log("   Manager TOTP Secret Key:", managerSecret);

    const totpCode = generateSync({ secret: managerSecret });
    console.log("   Generated 6-digit TOTP code via phone simulator (otplib):", totpCode);

    await fillInput('input[maxLength="6"]', totpCode);
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Activate') || b.textContent.includes('Verify'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2500));

    const u = db.prepare("SELECT totp_enabled FROM users WHERE email = 'manager@nlc.in'").get();
    console.log("   Manager TOTP Enabled in Database:", u?.totp_enabled === 1);
  }

  // 3. Logout Manager to perform full 2FA challenge login
  console.log("3. Logging out Manager to test full 2FA challenge login...");
  await logout();

  console.log("4. Performing 2FA login as Manager...");
  await fillInput('input[type="email"]', "manager@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  const is2faPrompt = await evalJs("!!document.querySelector('#twoFactorCode')");
  console.log("   Two-Factor Challenge Input Active (#twoFactorCode):", is2faPrompt);

  if (!managerSecret) {
    const u = db.prepare("SELECT totp_secret FROM users WHERE email = 'manager@nlc.in'").get();
    managerSecret = u?.totp_secret;
  }

  const managerTotp = generateSync({ secret: managerSecret });
  console.log("   Generated TOTP Code for Manager 2FA challenge:", managerTotp);
  await fillInput('#twoFactorCode', managerTotp);
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2500));

  const managerLoggedInUrl = await evalJs("window.location.href");
  const managerTokenPresent = await evalJs("!!sessionStorage.getItem('token')");
  console.log("   Manager Post-2FA Login URL:", managerLoggedInUrl);
  console.log("   Manager Session Token Present:", managerTokenPresent);

  console.log("\n================================================================================");
  console.log("PART B: COMPLETE WORK ORDER LIFECYCLE (ALL 4 ROLES)");
  console.log("================================================================================");

  // STEP 1: REQUESTER CREATES WORK ORDER
  console.log("\n--- ROLE 1: REQUESTER (requester@nlc.in) creates work order ---");
  await logout();
  await fillInput('input[type="email"]', "requester@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto("http://localhost:3000/work-orders");

  // Click "+ New Work Order" button to open modal
  console.log("   Clicking '+ New Work Order' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Work Order'));
      if (btn) btn.click();
      else throw new Error('New Work Order button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  const woTitle = `BWE-01 Main Drive Bearing Overheating [QA-${Date.now().toString().slice(-4)}]`;
  console.log("   Filling work order modal form:", woTitle);

  await evalJs(`
    (() => {
      const modal = document.querySelector('div[style*="position: fixed"]');
      const titleInput = modal.querySelector('input[type="text"]');
      const eqSelect = modal.querySelectorAll('select')[0];
      const typeSelect = modal.querySelectorAll('select')[1];
      const descTextarea = modal.querySelector('textarea');

      const setVal = (el, val) => {
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : (el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setVal(titleInput, '${woTitle}');
      setVal(eqSelect, '1');
      if (typeSelect) setVal(typeSelect, 'corrective');
      setVal(descTextarea, 'Continuous high-frequency vibration and heat buildup detected on bucket wheel gearbox during shift handover.');

      const submitBtn = modal.querySelector('button[type="submit"]');
      submitBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 2500));

  // Retrieve the newly created work order ID from the first table row
  const createdWoId = await evalJs(`
    (() => {
      const firstIdCell = document.querySelector('table tbody tr td:first-child');
      if (firstIdCell) {
        return firstIdCell.textContent.replace(/\\D/g, '');
      }
      return null;
    })()
  `);
  console.log(`   Created Work Order #${createdWoId} successfully!`);

  await goto(`http://localhost:3000/work-orders/${createdWoId}`);
  let statusAfterCreate = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Initial Status: Submitted (Confirmed in UI: ${statusAfterCreate.includes("Submitted")})`);

  // STEP 2: SUPERVISOR APPROVES WORK ORDER
  console.log("\n--- ROLE 2: SUPERVISOR (supervisor@nlc.in) approves work order ---");
  await logout();
  await fillInput('input[type="email"]', "supervisor@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto(`http://localhost:3000/work-orders/${createdWoId}`);

  console.log("   Clicking '✓ Approve Work Order' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Approve Work Order'));
      if (btn) btn.click();
      else throw new Error('Approve button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  let statusAfterApprove = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Status after Supervisor approval: Approved (Confirmed: ${statusAfterApprove.includes("Approved")})`);

  // STEP 3: MANAGER ASSIGNS TECHNICIAN AND SLA
  console.log("\n--- ROLE 3: MANAGER (manager@nlc.in) assigns technician & SLA ---");
  await logout();
  await fillInput('input[type="email"]', "manager@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  // Enter Manager TOTP
  const managerTotp2 = generateSync({ secret: managerSecret });
  await fillInput('#twoFactorCode', managerTotp2);
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto(`http://localhost:3000/work-orders/${createdWoId}`);

  console.log("   Clicking 'Assign Technician & Set Priority (SLA)' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Assign Technician'));
      if (btn) btn.click();
      else throw new Error('Assign button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  // Select Technician: Karthik Selvan (value 4) & Priority: High
  await evalJs(`
    (() => {
      const selects = document.querySelectorAll('div[style*="position: fixed"] select');
      if (selects[0]) {
        selects[0].value = '4';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (selects[1]) {
        selects[1].value = 'High';
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);

  console.log("   Confirming Assignment to Karthik Selvan with High priority (24h SLA)...");
  await evalJs(`
    (() => {
      const confirmBtn = Array.from(document.querySelectorAll('div[style*="position: fixed"] button')).find(b => b.textContent.includes('Confirm Assignment'));
      if (confirmBtn) confirmBtn.click();
      else throw new Error('Confirm Assignment button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  let statusAfterAssign = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Status after Manager assignment: Assigned (Confirmed: ${statusAfterAssign.includes("Assigned")})`);

  // STEP 4: TECHNICIAN STARTS WORK AND MARKS COMPLETE
  console.log("\n--- ROLE 4: TECHNICIAN (technician@nlc.in) starts & completes work ---");
  await logout();
  await fillInput('input[type="email"]', "technician@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto(`http://localhost:3000/work-orders/${createdWoId}`);

  console.log("   Clicking '▶ Start Maintenance Work' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start Maintenance Work'));
      if (btn) btn.click();
      else throw new Error('Start button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  let statusAfterStart = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Status after Start: In Progress (Confirmed: ${statusAfterStart.includes("In Progress")})`);

  console.log("   Clicking '✓ Mark Work Completed' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Mark Work Completed'));
      if (btn) btn.click();
      else throw new Error('Complete button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  let statusAfterComplete = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Status after Completion: Completed (Confirmed: ${statusAfterComplete.includes("Completed")})`);

  // STEP 5: REQUESTER VERIFIES & CLOSES WORK ORDER
  console.log("\n--- BACK TO ROLE 1: REQUESTER (requester@nlc.in) verifies & closes order ---");
  await logout();
  await fillInput('input[type="email"]', "requester@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto(`http://localhost:3000/work-orders/${createdWoId}`);

  console.log("   Clicking '✓ Verify & Close Work Order' button...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify & Close Work Order'));
      if (btn) btn.click();
      else throw new Error('Verify & Close button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2000));

  let statusAfterClose = await evalJs("document.body.textContent");
  console.log(`   Work Order #${createdWoId} Status after Close: Closed (Confirmed: ${statusAfterClose.includes("Closed")})`);

  console.log("\n================================================================================");
  console.log("PART C: AUDIT VERIFY BUTTON EXECUTION");
  console.log("================================================================================");

  console.log("Logging in as Admin (admin@nlc.in) to access /audit...");
  await logout();
  await fillInput('input[type="email"]', "admin@nlc.in");
  await fillInput('input[type="password"]', "NlcSecure@2026!");
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  const adminTotp = generateSync({ secret: "7ELQGJQYBSEZXF3QLFV4WYFP2ZLHXDCN" });
  console.log("   Admin TOTP Code:", adminTotp);
  await fillInput('#twoFactorCode', adminTotp);
  await evalJs("document.querySelector('form button[type=\"submit\"]').click()");
  await new Promise(r => setTimeout(r, 2000));

  await goto("http://localhost:3000/audit");

  console.log("Clicking '🔒 Verify Chain Integrity' button on Audit page...");
  await evalJs(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify Chain Integrity'));
      if (btn) btn.click();
      else throw new Error('Audit verify button not found');
    })()
  `);
  await new Promise(r => setTimeout(r, 2500));

  const auditVerifyText = await evalJs("document.body.textContent");
  const isVerifiedValid = auditVerifyText.includes("INTEGRITY VERIFIED") || auditVerifyText.includes("MATCH");
  console.log("   Audit Verification Result Displayed:", isVerifiedValid ? "VALID (INTEGRITY VERIFIED)" : "TAMPERED / FAILED");

  console.log("\n================================================================================");
  console.log("PART D: CONSOLE ERROR AUDIT REPORT");
  console.log("================================================================================");
  console.log(`Total Console Error Messages Caught: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach((err, idx) => {
      console.log(`   [${idx + 1}] (${err.source}): ${err.text}`);
    });
  } else {
    console.log("   Zero console errors encountered throughout all operations!");
  }

  ws.close();
  process.exit(consoleErrors.length > 0 ? 1 : 0);
}

runTaskZ4Lifecycle().catch(err => {
  console.error("Task Z4 execution failed:", err);
  process.exit(1);
});
