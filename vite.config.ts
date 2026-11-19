import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const devBackend = process.env.SCALLAPI_URL ?? "http://127.0.0.1:28400"

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/v8": { target: devBackend, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
})
