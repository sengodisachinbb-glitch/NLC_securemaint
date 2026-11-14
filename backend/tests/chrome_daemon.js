// Chrome Remote Debugging Daemon for Browser QA Testing
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = "C:\\Users\\9c23s\\AppData\\Local\\Google\\Chrome\\AutomationProfile";
const activePortPath = "C:\\Users\\9c23s\\AppData\\Local\\Google\\Chrome\\User Data\\DevToolsActivePort";

if (!fs.existsSync(profile)) {
  fs.mkdirSync(profile, { recursive: true });
}

console.log("[Chrome Daemon] Launching Chrome on remote debugging port 9444...");

const cp = spawn(chromePath, [
  "--remote-debugging-port=9444",
  "--remote-allow-origins=*",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "http://localhost:3000"
], { stdio: ["ignore", "pipe", "pipe"] });

cp.stderr.on("data", (d) => {
  const str = d.toString();
  process.stderr.write(str);
  const match = str.match(/DevTools listening on ws:\/\/127\.0\.0\.1:9444(\/devtools\/browser\/[a-f0-9-]+)/i);
  if (match) {
    const wsPath = match[1];
    fs.writeFileSync(activePortPath, `9444\n${wsPath}\n`, "utf8");
    console.log(`[Chrome Daemon] DevToolsActivePort updated: port 9444, path ${wsPath}`);
  }
});

cp.stdout.on("data", (d) => {
  process.stdout.write(d.toString());
});

cp.on("close", (code) => {
  console.log(`[Chrome Daemon] Chrome exited with code ${code}`);
  process.exit(code || 0);
});

// Periodic verification of endpoint
setInterval(async () => {
  try {
    const res = await fetch("http://127.0.0.1:9444/json/version");
    if (res.ok) {
      const data = await res.json();
      const wsUrl = data.webSocketDebuggerUrl;
      const wsPath = wsUrl ? wsUrl.replace(/^ws:\/\/[^/]+/, "") : "";
      if (wsPath) {
        fs.writeFileSync(activePortPath, `9444\n${wsPath}\n`, "utf8");
      }
    }
  } catch (e) {
    // ignore
  }
}, 5000);

console.log("[Chrome Daemon] Process running and monitoring DevToolsActivePort.");

