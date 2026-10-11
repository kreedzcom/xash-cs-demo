import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checksumFile = path.join(root, "engine", "CHECKSUMS.sha256");
const lines = readFileSync(checksumFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

let failed = 0;
for (const line of lines) {
  const hash = line.slice(0, line.indexOf(" ")).toLowerCase();
  const relative = line.slice(line.indexOf(" ")).trim().replaceAll("\\", "/");
  const file = path.join(root, relative);
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== hash) {
    process.stderr.write(
      `mismatch ${relative}\n  expected ${hash}\n  actual   ${actual}\n`,
    );
    failed += 1;
  } else {
    process.stdout.write(`ok ${relative}\n`);
  }
}

if (failed > 0) {
  process.exit(1);
}
