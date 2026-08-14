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
    },
  };
});
