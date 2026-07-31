import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  ssr: {
    external: ["cloudflare:workers"],
  },
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
});
