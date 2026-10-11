import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheMatchOrFetch,
  classifyAssetUrl,
  clearAssetMisses,
  looksLikeHtmlDocument,
  pruneCacheIndex,
  versionedCacheKey,
} from "./assetCache";

describe("classifyAssetUrl", () => {
  it("uses the file extension instead of a site path", () => {
    expect(classifyAssetUrl("https://example.test/files/1.dem", "static")).toBe(
      "demo",
    );
    expect(
      classifyAssetUrl("https://example.test/packs/core.pk3", "static"),
    ).toBe("pack");
    expect(
      classifyAssetUrl("https://example.test/maps/kz.bsp?v=2", "static"),
    ).toBe("map");
    expect(classifyAssetUrl("https://example.test/wads/a.wad", "static")).toBe(
      "static",
    );
    expect(versionedCacheKey("https://example.test/a.dem", "3")).toBe(
      "https://example.test/a.dem?xash-v=3",
    );
  });
});

describe("looksLikeHtmlDocument", () => {
  it("rejects the site 404 page served for a missing sprite", () => {
    const page = new TextEncoder().encode(
      "<!DOCTYPE html><html><title>Page not found</title>",
    );
    expect(looksLikeHtmlDocument(page, "text/html; charset=utf-8")).toBe(true);
    expect(looksLikeHtmlDocument(page, null)).toBe(true);
  });

  it("keeps hud.txt and sprite bytes", () => {
    const hud = new TextEncoder().encode(
      "number_0\t\t\t640 640hud7\t0\t0\t20\t25\n",
    );
    expect(looksLikeHtmlDocument(hud, "text/plain")).toBe(false);
    expect(
      looksLikeHtmlDocument(new Uint8Array([0x49, 0x44, 0x53, 0x50]), null),
    ).toBe(false);
  });
});

describe("pruneCacheIndex", () => {
  it("drops the oldest urls once the cap is reached", () => {
    const { kept, dropped } = pruneCacheIndex(
      [
        { url: "a", at: 1 },
        { url: "b", at: 2 },
      ],
      "c",
      2,
      3,
    );
    expect(dropped).toEqual(["a"]);
    expect(kept.map((entry) => entry.url)).toEqual(["b", "c"]);
  });
});

describe("cacheMatchOrFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearAssetMisses();
  });

  it("retries a rate limit and then returns the file", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", undefined);
    const pending = cacheMatchOrFetch("https://kreedz.test/file.dem", "demo");
    await vi.runAllTimersAsync();
    const bytes = await pending;
    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remembers a missing file for the rest of the session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", undefined);
    const url = "https://kreedz.test/missing.wad";
    expect(await cacheMatchOrFetch(url, "map")).toBeNull();
    expect(await cacheMatchOrFetch(url, "map")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
