import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks to Vite (5173) and Vite forwards /api to
// Django. Same-origin, so no CORS setup is needed locally. In production the
// frontend is hosted separately: set VITE_API_BASE_URL to the HTTPS API URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    build: { outDir: "dist", sourcemap: false },
  };
});
