import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Options } from "tsup";

/**
 * esbuild copies `new URL("./file", import.meta.url)` into dist while bundling.
 * Rewrite the member to a computed access so the expression is left as written,
 * then put `import.meta.url` back. Consumer bundlers (Vite, webpack 5) need the
 * literal form so they can serve the engine and asset files.
 */
const COMPUTED_META_URL = 'import.meta["url"]';
const LITERAL_META_URL = "import.meta.url";

const preservePackageUrls: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "preserve-package-urls",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      if (!source.includes(LITERAL_META_URL)) {
        return undefined;
      }
      return {
        contents: source.replaceAll(LITERAL_META_URL, COMPUTED_META_URL),
        loader: "ts",
      };
    });
  },
};

const restoreMetaUrl = (directory: string): void => {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      restoreMetaUrl(full);
      continue;
    }
    if (!entry.endsWith(".js") && !entry.endsWith(".map")) {
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (!text.includes(COMPUTED_META_URL)) {
      continue;
    }
    writeFileSync(full, text.replaceAll(COMPUTED_META_URL, LITERAL_META_URL));
  }
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    track: "src/demoTrack.ts",
    net: "src/loopbackNet.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
  shims: false,
  external: ["xash3d-fwgs"],
  esbuildPlugins: [preservePackageUrls],
  async onSuccess() {
    restoreMetaUrl("dist");
  },
});
