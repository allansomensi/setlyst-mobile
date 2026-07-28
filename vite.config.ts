import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tauri expects a fixed dev server port (see src-tauri/tauri.conf.json "devUrl").
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "src/*" alias declared in tsconfig.json.
      // TypeScript's `paths` only affects type-checking; Vite needs its own
      // resolver alias to actually bundle the imports.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Tell Vite to ignore watching the src-tauri directory.
      ignored: ["**/src-tauri/**"],
    },
  },
});
