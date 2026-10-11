import { describe, expect, it } from "vitest";
import { PACKAGE_ASSET_URLS, resolvePackageAssetUrls } from "./bootEngineFs";
import { PATCHED_ENGINE_FILES, resolveEngineFiles } from "./patchedEngine";

describe("package file urls", () => {
  it("points shipped assets at files next to the package", () => {
    expect(PACKAGE_ASSET_URLS.delta.endsWith("/assets/delta.lst")).toBe(true);
    expect(
      PACKAGE_ASSET_URLS.fira.endsWith("/assets/fonts/FiraSans-Regular.ttf"),
    ).toBe(true);
    expect(PACKAGE_ASSET_URLS.tahoma.endsWith("/assets/fonts/tahoma.ttf")).toBe(
      true,
    );
    expect(PACKAGE_ASSET_URLS.extras.endsWith("/assets/extras.pk3")).toBe(true);
    expect(
      PACKAGE_ASSET_URLS.hlLang.endsWith(
        "/assets/resource/halflife_english.txt",
      ),
    ).toBe(true);
    expect(
      PACKAGE_ASSET_URLS.csLang.endsWith(
        "/assets/resource/cstrike_english.txt",
      ),
    ).toBe(true);
  });

  it("points the engine at the shipped wasm build", () => {
    expect(PATCHED_ENGINE_FILES.xashJs.endsWith("/engine/xash.js")).toBe(true);
    expect(PATCHED_ENGINE_FILES.xash.endsWith("/engine/xash.wasm")).toBe(true);
    expect(
      PATCHED_ENGINE_FILES.filesystem.endsWith("/engine/filesystem_stdio.wasm"),
    ).toBe(true);
    expect(
      PATCHED_ENGINE_FILES.render.endsWith("/engine/libref_webgl2.wasm"),
    ).toBe(true);
    expect(
      PATCHED_ENGINE_FILES.menu.endsWith(
        "/engine/cstrike/cl_dlls/menu_emscripten_wasm32.wasm",
      ),
    ).toBe(true);
    expect(
      PATCHED_ENGINE_FILES.client.endsWith(
        "/engine/cstrike/cl_dlls/client_emscripten_wasm32.wasm",
      ),
    ).toBe(true);
  });

  it("keeps an explicit asset url and fills the rest from the package", () => {
    const urls = resolvePackageAssetUrls({
      extras: "https://cdn.example/extras.pk3",
    });
    expect(urls.extras).toBe("https://cdn.example/extras.pk3");
    expect(urls.delta).toBe(PACKAGE_ASSET_URLS.delta);
  });

  it("joins engine files onto a directory url", () => {
    const files = resolveEngineFiles("https://cdn.example/engine");
    expect(files.xashJs).toBe("https://cdn.example/engine/xash.js");
    expect(files.xash).toBe("https://cdn.example/engine/xash.wasm");
    expect(files.filesystem).toBe(
      "https://cdn.example/engine/filesystem_stdio.wasm",
    );
    expect(files.render).toBe("https://cdn.example/engine/libref_webgl2.wasm");
    expect(files.menu).toBe(
      "https://cdn.example/engine/cstrike/cl_dlls/menu_emscripten_wasm32.wasm",
    );
    expect(files.client).toBe(
      "https://cdn.example/engine/cstrike/cl_dlls/client_emscripten_wasm32.wasm",
    );
    expect(resolveEngineFiles()).toBe(PATCHED_ENGINE_FILES);
  });
});
