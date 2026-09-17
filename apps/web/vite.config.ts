import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@fleet/constants": path.resolve(__dirname, "../../packages/constants/src/index.ts"),
      "@fleet/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@fleet/validation": path.resolve(__dirname, "../../packages/validation/src/index.ts"),
      "@fleet/api-client": path.resolve(__dirname, "../../packages/api-client/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
