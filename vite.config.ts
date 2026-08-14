import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The vite root is the project root (index.html lives here), but static
  // assets like the battle-hero banner live under client/public. Point the
  // public dir there so they are copied into dist/ and served at /.
  publicDir: "client/public",
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
