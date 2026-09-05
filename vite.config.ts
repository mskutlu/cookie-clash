import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(dirname, "app"),
  plugins: [react()],
  resolve: { alias: { "@shared": path.join(dirname, "shared") } },
  build: { outDir: path.join(dirname, "dist"), emptyOutDir: true },
  define: { "process.env": {} },
});
