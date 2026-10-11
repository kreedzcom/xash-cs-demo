import { describe, expect, it } from "vitest";
import {
  collectResourcePaths,
  planViewerAssets,
  readBspDependencies,
} from "./assets";

describe("collectResourcePaths", () => {
  it("keeps model, sound, sprite, and wad paths", () => {
    const text =
      "xx models/player/leet/leet.mdl\0sound/player/pl_step1.wav junk";
    const bytes = new TextEncoder().encode(text);
    expect(collectResourcePaths(bytes)).toEqual([
      "models/player/leet/leet.mdl",
      "sound/player/pl_step1.wav",
    ]);
  });
});

describe("readBspDependencies", () => {
  it("reads the sky name and wad file names from entity text", () => {
    const text =
      '{ "skyname" "des" "wad" "c:\\games\\cstrike\\cstrike.wad;halflife.wad" }';
    const bytes = new TextEncoder().encode(text);
    expect(readBspDependencies(bytes)).toEqual({
      wads: ["cstrike.wad", "halflife.wad"],
      sky: "des",
    });
  });
});

describe("planViewerAssets", () => {
  it("asks the map archive first for the bsp and the shared library first for models", () => {
    const planned = planViewerAssets(
      "kz_demo",
      "kz_demo",
      ["models/player/leet/leet.mdl"],
      { wads: ["cstrike.wad"], sky: "des" },
      "https://kreedz.test/api/viewer/assets/kz_demo/",
      "https://kreedz.test/api/viewer/base/",
      { localRoot: "/xash/cstrike" },
    );
    const bsp = planned.find(
      (asset) => asset.fsPath === "/cstrike/maps/kz_demo.bsp",
    );
    const model = planned.find(
      (asset) => asset.fsPath === "/cstrike/models/player/leet/leet.mdl",
    );
    const wad = planned.find((asset) =>
      asset.fsPath.endsWith("wads/cstrike.wad"),
    );
    expect(bsp?.urls[0]).toBe(
      "https://kreedz.test/api/viewer/assets/kz_demo/maps/kz_demo.bsp",
    );
    expect(model?.urls).toEqual([
      "https://kreedz.test/api/viewer/base/models/player/leet/leet.mdl",
      "/xash/cstrike/models/player/leet/leet.mdl",
      "https://kreedz.test/api/viewer/assets/kz_demo/models/player/leet/leet.mdl",
    ]);
    expect(wad?.urls[0]).toBe(
      "https://kreedz.test/api/viewer/base/wads/cstrike.wad",
    );
    const decals = planned.find(
      (asset) => asset.fsPath === "/cstrike/decals.wad",
    );
    expect(decals?.urls).toContain(
      "https://kreedz.test/api/viewer/base/wads/decals.wad",
    );
    expect(
      planned.filter((asset) => asset.fsPath.endsWith("cstrike.wad")),
    ).toHaveLength(1);
    expect(
      planned.some((asset) => asset.fsPath.endsWith("gfx/env/desbk.tga")),
    ).toBe(true);
  });

  it("asks the map archive only for custom wads", () => {
    const planned = planViewerAssets(
      "kz_demo",
      "kz_demo",
      ["sounds/common/wpn_select.wav"],
      { wads: ["qtexs.wad"], sky: null },
      "https://kreedz.test/api/viewer/assets/kz_demo/",
      "https://kreedz.test/api/viewer/base/",
      { useCorePack: true, localRoot: "/xash/cstrike" },
    );
    const wad = planned.find((asset) =>
      asset.fsPath.endsWith("wads/qtexs.wad"),
    );
    expect(wad?.urls).toEqual([
      "https://kreedz.test/api/viewer/assets/kz_demo/wads/qtexs.wad",
      "/xash/cstrike/wads/qtexs.wad",
    ]);
    expect(planned.some((asset) => asset.fsPath.includes("wpn_select"))).toBe(
      false,
    );
  });

  it("still downloads a custom player model when the core pack is used", () => {
    const planned = planViewerAssets(
      "kz_demo",
      "kz_demo",
      ["models/player/kzpro/kzpro.mdl", "models/player/gign/gign.mdl"],
      { wads: [], sky: null },
      "https://kreedz.test/api/viewer/assets/kz_demo/",
      "https://kreedz.test/api/viewer/base/",
      { useCorePack: true },
    );
    const custom = planned.find((asset) =>
      asset.fsPath.endsWith("models/player/kzpro/kzpro.mdl"),
    );
    expect(custom?.urls[0]).toBe(
      "https://kreedz.test/api/viewer/base/models/player/kzpro/kzpro.mdl",
    );
    expect(
      planned.some((asset) =>
        asset.fsPath.endsWith("models/player/gign/gign.mdl"),
      ),
    ).toBe(false);
  });

  it("skips the local cstrike folder when that fallback is off", () => {
    const planned = planViewerAssets(
      "kz_demo",
      "kz_demo",
      ["models/player/kzpro/kzpro.mdl"],
      { wads: ["qtexs.wad"], sky: null },
      "https://kreedz.test/api/viewer/assets/kz_demo/",
      "https://kreedz.test/api/viewer/base/",
      { localFallback: false },
    );
    expect(
      planned.every((asset) =>
        asset.urls.every((url) => !url.startsWith("/xash/cstrike/")),
      ),
    ).toBe(true);
  });

  it("skips models, sprites, and sounds when the core pack is used", () => {
    const planned = planViewerAssets(
      "kz_demo",
      "kz_demo",
      [
        "models/player/leet/leet.mdl",
        "sound/player/pl_step1.wav",
        "sprites/640hud1.spr",
      ],
      { wads: ["halflife.wad"], sky: "des" },
      "https://kreedz.test/api/viewer/assets/kz_demo/",
      "https://kreedz.test/api/viewer/base/",
      { useCorePack: true },
    );
    expect(planned.some((asset) => asset.fsPath.includes("/models/"))).toBe(
      false,
    );
    expect(planned.some((asset) => asset.fsPath.includes("/sound/"))).toBe(
      false,
    );
    expect(planned.some((asset) => asset.fsPath.includes("/sprites/"))).toBe(
      false,
    );
    expect(planned.some((asset) => asset.fsPath.endsWith(".bsp"))).toBe(true);
    expect(
      planned.some((asset) => asset.fsPath.endsWith("wads/halflife.wad")),
    ).toBe(true);
  });

  it("reads the entity lump and ignores a sky name stored before that lump", () => {
    const entities = new TextEncoder().encode(
      '{ "skyname" "city" "wad" "c:\\games\\halflife.wad" }',
    );
    const decoy = new TextEncoder().encode('{ "skyname" "noshadow" }');
    const headerSize = 4 + 15 * 8;
    const bytes = new Uint8Array(headerSize + decoy.length + entities.length);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 30, true);
    view.setInt32(4, headerSize + decoy.length, true);
    view.setInt32(8, entities.length, true);
    bytes.set(decoy, headerSize);
    bytes.set(entities, headerSize + decoy.length);
    expect(readBspDependencies(bytes)).toEqual({
      wads: ["halflife.wad"],
      sky: "city",
    });
  });

  it("drops a sky or map name that could escape the game directory", () => {
    expect(
      readBspDependencies(
        new TextEncoder().encode(
          '{ "skyname" "../secret" "wad" "../evil.wad" }',
        ),
      ),
    ).toEqual({ wads: ["evil.wad"], sky: null });
    expect(() =>
      planViewerAssets(
        "../kz",
        "kz_demo",
        [],
        { wads: [], sky: null },
        "https://example.test/maps/",
        "https://example.test/base/",
      ),
    ).toThrow(/map name/i);
    const planned = planViewerAssets(
      "kz_demo",
      "../other",
      [],
      { wads: [], sky: null },
      "https://example.test/maps/",
      "https://example.test/base/",
    );
    expect(planned.some((asset) => asset.fsPath.includes(".."))).toBe(false);
  });
});
