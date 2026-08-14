import { defineConfig } from "vite";

const port = Number(process.env.PORT ?? 8787);

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: `http://localhost:${port}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
