import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Keeps the browser on one origin in development, so no CORS dance.
      "/api": "http://127.0.0.1:8000",
    },
  },
});
