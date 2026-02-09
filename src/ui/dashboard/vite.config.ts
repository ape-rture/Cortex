import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  plugins: [preact()],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "..", "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/healthz": "http://localhost:8787",
    },
  },
});
