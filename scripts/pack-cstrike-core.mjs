import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Pack models/, sprites/, and sound/ from a Counter-Strike 1.6 `cstrike`
 * directory you already have into cstrike-core.pk3 (stored zip, method 0).
 *
 *   node scripts/pack-cstrike-core.mjs <cstrike-dir> <out.pk3>
 *
 * This script does not download game files.
 */

const folders = ["models", "sprites", "sound"];
const source = process.argv[2];
const output = process.argv[3];

if (!source || !output) {
  process.stderr.write(
    "Usage: node scripts/pack-cstrike-core.mjs <cstrike-dir> <out.pk3>\n",
  );
  process.exit(1);
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[index] = crc;
}

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const walk = (directory, prefix, files) => {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      walk(full, relative, files);
      continue;
    }
    files.push({
      name: relative.replaceAll("\\", "/"),
      bytes: readFileSync(full),
    });
  }
};

const files = [];
for (const folder of folders) {
  const directory = path.join(source, folder);
  if (!statSync(directory).isDirectory()) {
    process.stderr.write(`Missing ${directory}\n`);
    process.exit(1);
  }
  walk(directory, folder, files);
}

const u16 = (value) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};
const u32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
};

const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name, "utf8");
  const crc = crc32(file.bytes);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0800),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(file.bytes.length),
    u32(file.bytes.length),
    u16(name.length),
    u16(0),
    name,
    file.bytes,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0x0800),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(file.bytes.length),
    u32(file.bytes.length),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(offset),
    name,
  ]);
  locals.push(local);
  centrals.push(central);
  offset += local.length;
}

const centralBytes = Buffer.concat(centrals);
const end = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(files.length),
  u16(files.length),
  u32(centralBytes.length),
  u32(offset),
  u16(0),
]);

writeFileSync(output, Buffer.concat([...locals, centralBytes, end]));
process.stdout.write(`${files.length} files -> ${output}\n`);
process.stdout.write(
  "Write the same text to packs/cstrike-core.version when you publish it.\n",
);
