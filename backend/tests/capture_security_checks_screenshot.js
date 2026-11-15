// Take screenshot of Scripted Security Checks Report via Chrome CDP
const fs = require("fs");
const path = require("path");

async function captureScriptedChecksScreenshot() {
  const targets = await fetch("http://127.0.0.1:9444/json/list").then(r => r.json());
  const page = targets.find(t => t.type === "page");
  if (!page) {
    console.error("No browser page target found on port 9444");
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
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
  };

  await new Promise(r => { ws.onopen = r; });

  await send("Page.enable");
  const reportPath = path.resolve(__dirname, "../../reports/archive/Scripted-Security-Checks.html");
  const fileUrl = `file:///${reportPath.replace(/\\/g, "/")}`;

  console.log("Navigating to:", fileUrl);
  await send("Page.navigate", { url: fileUrl });
  await new Promise(r => setTimeout(r, 2000));

  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const outPath = path.resolve(__dirname, "../../tests-output/screenshots/Scripted-Security-Checks.png");
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
  console.log("Saved security checks screenshot to:", outPath);

  ws.close();
}

captureScriptedChecksScreenshot().catch(console.error);

