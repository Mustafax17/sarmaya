import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy for the SHIPPED build only (apply: "build"). We can't
// put this in index.html directly: Vite's dev server injects an inline HMR/React
// Refresh script, which a strict script-src would block. The production bundle has
// no inline scripts, so 'self' holds there.
//   - script-src 'self'            → no inline/eval; blocks injected <script> XSS
//   - style-src 'unsafe-inline'    → required: the app uses inline style attrs +
//                                     one injected <style>; Google Fonts stylesheet
//   - connect-src 'self'           → API must be same-origin in prod (it is, via the
//                                     same host); widen this if you split origins
//   - object-src/base-uri/frame-ancestors locked down (clickjacking + base-tag XSS)
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const htmlSecurity = {
  name: "html-security-headers",
  apply: "build",
  transformIndexHtml() {
    return [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: PROD_CSP }, injectTo: "head-prepend" },
      { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head-prepend" },
    ];
  },
};

// The dev server proxies /api to the Express backend so cookies are same-origin
// (httpOnly auth cookie works without CORS headaches).
export default defineConfig({
  plugins: [react(), htmlSecurity],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into their own long-cached chunks so the app
        // chunk stays small and repeat loads are fast.
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
