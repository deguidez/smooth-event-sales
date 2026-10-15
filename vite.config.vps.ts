// @lovable.dev/vite-tanstack-config already includes the default plugins — do NOT add them manually.
//
// Build PARA A VPS (Node + PM2). O build publicado no Lovable usa `vite.config.ts`
// e continua intacto — este arquivo só é lido quando você roda:
//   bun run build:vps
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Gera `.output/server/index.mjs`, um servidor Node autônomo.
  nitro: { preset: "node_server" },
  tanstackStart: { server: { entry: "server" } },
  vite: {
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});
