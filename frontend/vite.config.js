import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite plugin to externalize the React Refresh preamble into a standalone script.
 * In development mode, @vitejs/plugin-react injects an inline script for the Fast Refresh preamble.
 * Under strict CSP (script-src 'self'), inline scripts are blocked without 'unsafe-inline'.
 * This plugin serves the preamble from a same-origin endpoint (/@react-refresh-preamble.js),
 * resolving the CSP error cleanly without needing 'unsafe-eval' or 'unsafe-inline' in script-src.
 */
function externalizePreamblePlugin() {
  return {
    name: "externalize-preamble-plugin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(
        /<script type="module">\s*import\s*\{\s*injectIntoGlobalHook\s*\}\s*from\s*["']\/@react-refresh["'];[\s\S]*?<\/script>/,
        '<script type="module" src="/@react-refresh-preamble.js"></script>'
      );
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/@react-refresh-preamble.js") {
          res.setHeader("Content-Type", "application/javascript");
          res.end(
            `import { injectIntoGlobalHook } from "/@react-refresh";\n` +
            `injectIntoGlobalHook(window);\n` +
            `window.$RefreshReg$ = () => {};\n` +
            `window.$RefreshSig$ = () => (type) => type;`
          );
          return;
        }
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), externalizePreamblePlugin()],
  server: {
    port: 3000,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:5000; frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  },
  preview: {
    port: 3000,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:5000; frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  }
});
