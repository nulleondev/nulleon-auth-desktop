import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { privateDevServer } from "../shared/devServerSecurity.js";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: privateDevServer(import.meta.url),
});
