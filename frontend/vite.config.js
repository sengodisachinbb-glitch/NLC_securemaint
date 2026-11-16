import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:5000; form-action 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'";

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP_POLICY,
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

/**
 * Vite plugin to ensure security headers (including X-Content-Type-Options: nosniff
 * and strict CSP with form-action, base-uri, frame-ancestors, object-src) are
 * consistently sent on all dev server responses, including Vite internal endpoints.
 */
function securityHeadersPlugin() {
  return {
    name: "security-headers-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
          res.setHeader(header, value);
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
          res.setHeader(header, value);
        }
        next();
      });
    }
  };
}

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
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Content-Security-Policy", CSP_POLICY);
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
  plugins: [react(), securityHeadersPlugin(), externalizePreamblePlugin()],
  server: {
    port: 3000,
    headers: SECURITY_HEADERS
  },
  preview: {
    port: 3000,
    headers: SECURITY_HEADERS
  }
});
