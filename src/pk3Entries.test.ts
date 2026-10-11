import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractPlayerModels, extractZipEntries } from "./pk3Entries";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const concat = (parts: Uint8Array[]): Uint8Array => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u16 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

const zip = (
  files: { name: string; data: Uint8Array; method: 0 | 8 }[],
): Uint8Array => {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = text(file.name);
    const stored = file.method === 0 ? file.data : deflateRawSync(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(file.method),
      u16(0),
      u16(0),
      u32(0),
      u32(stored.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      stored,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(file.method),
        u16(0),
        u16(0),
        u32(0),
        u32(stored.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concat(centrals);
  return concat([
    ...locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
};

describe("extractZipEntries", () => {
  it("reads stored and deflated player models and skips other files", async () => {
    const archive = zip([
      { name: "models/player.mdl", data: text("stray"), method: 0 },
      {
        name: "models/player/gign/gign.mdl",
        data: text("gign-model"),
        method: 8,
      },
      {
        name: "models/player/leet/leet.mdl",
        data: text("leet-model"),
        method: 0,
      },
      { name: "models/v_ak47.mdl", data: text("weapon"), method: 0 },
      { name: "../models/player/gign/gign.mdl", data: text("bad"), method: 0 },
    ]);

    const entries = await extractPlayerModels(archive);
    expect(entries.map((entry) => entry.name)).toEqual([
      "models/player/gign/gign.mdl",
      "models/player/leet/leet.mdl",
    ]);
    expect(new TextDecoder().decode(entries[0].bytes)).toBe("gign-model");
    expect(new TextDecoder().decode(entries[1].bytes)).toBe("leet-model");
    expect(
      await extractZipEntries(new Uint8Array([1, 2, 3]), () => true),
    ).toEqual([]);
  });

  it("rewrites Windows backslashes and still rejects parent paths", async () => {
    const archive = zip([
      { name: "models\\v_usp.mdl", data: text("usp"), method: 0 },
      { name: "sprites\\radar640.spr", data: text("radar"), method: 8 },
      { name: "..\\models\\v_usp.mdl", data: text("bad"), method: 0 },
    ]);

    const entries = await extractZipEntries(archive, () => true);
    expect(entries.map((entry) => entry.name)).toEqual([
      "models/v_usp.mdl",
      "sprites/radar640.spr",
    ]);
    expect(new TextDecoder().decode(entries[0].bytes)).toBe("usp");
    expect(new TextDecoder().decode(entries[1].bytes)).toBe("radar");
  });

  it("stops when uncompressed bytes pass the cap", async () => {
    const archive = zip([
      { name: "models/a.mdl", data: new Uint8Array(80), method: 0 },
      { name: "models/b.mdl", data: new Uint8Array(80), method: 0 },
    ]);
    const entries = await extractZipEntries(archive, () => true, {
      maxUncompressedBytes: 100,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.bytes.byteLength).toBe(80);
  });

  it("drops a deflated entry that inflates past the cap", async () => {
    const archive = zip([
      { name: "models/big.mdl", data: new Uint8Array(20_000), method: 8 },
    ]);
    const entries = await extractZipEntries(archive, () => true, {
      maxUncompressedBytes: 1000,
    });
    expect(entries).toEqual([]);
  });
});
