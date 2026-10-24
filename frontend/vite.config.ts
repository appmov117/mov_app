import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const mapboxToken = env.VITE_MAPBOX_TOKEN || env.MAPBOX_ACCESS_TOKEN || env.API_KEY || "";
  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Sin recarga automática: el SW toma control solo (skipWaiting + clientsClaim) y en
      // desarrollo, donde se regenera en cada carga, autoUpdate provocaba recargas en bucle.
      registerType: "prompt",
      devOptions: { enabled: true, type: "module" },
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Ruta",
        short_name: "Ruta",
        description: "Viajes con membresía fija. El pasajero paga directo al conductor.",
        lang: "es",
        start_url: "/",
        display: "standalone",
        background_color: "#0B6E7F",
        theme_color: "#0B6E7F",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,ico}"],
      },
    }),
  ],
  define: {
      "import.meta.env.VITE_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
    },
    optimizeDeps: {
      exclude: ["maplibre-gl"],
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:8001",
        "/ws": { target: "ws://127.0.0.1:8001", ws: true },
      },
    },
  };
});
