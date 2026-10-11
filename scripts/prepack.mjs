import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(
  root,
  "node_modules",
  "xash3d-fwgs",
  "dist",
  "valve",
  "extras.pk3",
);
const target = path.join(root, "assets", "extras.pk3");

if (!existsSync(source)) {
  process.stderr.write(
    "xash3d-fwgs extras.pk3 is missing. Run npm install before packing.\n",
  );
  process.exit(1);
}

mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
process.stdout.write("copied extras.pk3 into assets/\n");
