import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function getEnvValue(key: string, defaultValue: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envPath = new URL('../.env', import.meta.url);
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(?:["']?)([^"'\\r\\n]+)(?:["']?)`, 'm'));
      if (match && match[1]) return match[1].trim();
    }
  } catch {
    // Ignore reading errors and return default
  }
  return defaultValue;
}

// Single source of truth for the version shown in the dashboard: the ROOT package.json, which is
// what a release bumps and what `npm run check:versions` gates. Resolved relative to this config
// file (not process.cwd()), because the dashboard is normally built from inside `dashboard/` — where
// cwd-relative resolution picks up `dashboard/package.json` instead. That file is not touched by a
// release, so the Login screen kept rendering whatever version it happened to be pinned at while the
// gateway moved on. The sidebar hid the drift by replacing the build-time value with the live
// version from the API (see Layout.tsx); the Login screen has no session yet, so it shows this
// constant verbatim. APP_VERSION env still overrides if explicitly provided.
const { version: pkgVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as {
  version: string;
};

const apiPort = getEnvValue('PORT', '2785');
const apiTarget = getEnvValue('VITE_API_URL', `http://localhost:${apiPort}`);
const dashboardPort = parseInt(getEnvValue('DASHBOARD_PORT', '2886'), 10);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: 'spa', // Enable SPA fallback for client-side routing
  // Fonts stay files: a small subset inlined as a data: URI is blocked by the gateway CSP (font-src 'self').
  build: { assetsInlineLimit: file => (file.endsWith('.woff2') ? false : undefined) },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkgVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: dashboardPort,
    proxy: {
      // With the trailing slash: Vite matches a plain key as a string prefix, so '/api' also
      // captured the SPA route /api-keys and a reload of that page went to the backend.
      '/api/': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy the WebSocket (socket.io) transport so the dashboard's real-time
      // chats/sessions streams work against the dev backend.
      '/socket.io': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
