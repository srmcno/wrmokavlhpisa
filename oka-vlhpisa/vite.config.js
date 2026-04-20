import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Post-build: strip the ES-module markers from the final HTML so the app
// runs when the user double-clicks index.html (file://). Browsers block
// `type="module"` and `crossorigin` scripts from file:// URLs.
function stripModuleForFileProtocol() {
  return {
    name: "strip-module-for-file-protocol",
    enforce: "post",
    apply: "build",
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (chunk.type === "asset" && fileName.endsWith(".html") && typeof chunk.source === "string") {
          chunk.source = chunk.source
            .replace(/<script([^>]*?)\stype="module"/g, "<script$1")
            .replace(/<script([^>]*?)\scrossorigin(="[^"]*")?/g, "<script$1");
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    stripModuleForFileProtocol(),
  ],
  base: "./",
  build: {
    // Emit a classic script bundle (IIFE) so index.html works when opened
    // directly from disk without a web server.
    target: "es2019",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 99_999,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
});
