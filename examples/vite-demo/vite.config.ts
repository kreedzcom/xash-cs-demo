import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "xash-cs-demo": path.resolve(root, "../../src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(root, "../..")],
    },
  },
});
