import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
  ],
  build: {
    // Disable chunk size warnings — we're intentionally going single-file
    chunkSizeWarningLimit: 99999,
    rollupOptions: {
      output: {
        // Force everything into one bundle so singlefile can inline it
        inlineDynamicImports: true,
      },
    },
  },
});
