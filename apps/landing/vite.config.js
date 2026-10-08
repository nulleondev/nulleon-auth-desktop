import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { privateDevServer } from "../shared/devServerSecurity.js";
export default defineConfig({
  plugins: [react()],
  server: privateDevServer(import.meta.url),
});
