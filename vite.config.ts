import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  server: {
    port: 5173,
    host: true,
    // dependencies may live outside the project (symlinked node_modules)
    fs: { strict: false },
    proxy: {
      "/api": { target: "http://localhost:3000", ws: true },
      "/uploads": "http://localhost:3000",
    },
  },
  build: { outDir: "dist", assetsDir: "static", chunkSizeWarningLimit: 4000 },
});
