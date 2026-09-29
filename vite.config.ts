import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // /api va al servidor (server/). API_URL permite apuntar a otro puerto en las pruebas.
  server: { proxy: { "/api": process.env.API_URL ?? "http://localhost:3001" } },
  preview: { proxy: { "/api": process.env.API_URL ?? "http://localhost:3001" } },
});
