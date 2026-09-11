import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT || process.env.PORT || 8787);

  return {
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/phaser/")) {
              return "phaser";
            }
            if (id.includes("node_modules/perfect-freehand/")) {
              return "drawing-vendor";
            }
            if (id.includes("node_modules/zod/")) {
              return "schema-vendor";
            }
          },
        },
      },
    },
  };
});
