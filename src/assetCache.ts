export type AssetCacheKind = "static" | "map" | "demo" | "pack";

export const CACHE_NAMES: Record<AssetCacheKind, string> = {
  static: "xash-cs-demo-static-v1",
  map: "xash-cs-demo-maps-v1",
  demo: "xash-cs-demo-demos-v1",
  pack: "xash-cs-demo-packs-v1",
};

const CACHE_LIMITS: Partial<Record<AssetCacheKind, number>> = {
  demo: 50,
  map: 15,
};

const INDEX_URL = "https://xash-cs-demo.invalid/cache-index";
/** Previous cache names. Deleted on startup so a rename does not keep stale files. */
const LEGACY_CACHES = [
  "kreedz-viewer-assets-v1",
  "kreedz-viewer-assets-v2",
  "kreedz-viewer-static-v1",
  "kreedz-viewer-maps-v1",
  "kreedz-viewer-demos-v1",
  "kreedz-viewer-packs-v1",
];

/**
 * Pick a cache bucket from the URL. Hosts can pass their own classifier
 * into `fetchFirst` when file extensions are not enough.
 */
export const classifyAssetUrl = (
  url: string,
  fallback: AssetCacheKind,
): AssetCacheKind => {
  const path = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".dem")) {
    return "demo";
  }
  if (path.endsWith(".pk3") || path.includes("/packs/")) {
    return "pack";
  }
  if (path.endsWith(".bsp")) {
    return "map";
  }
  return fallback;
};

/** Cache key that changes when the caller passes a new version token. */
export const versionedCacheKey = (url: string, version?: string): string => {
  if (!version) {
    return url;
  }
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}xash-v=${encodeURIComponent(version)}`;
};
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [50, 150];

export type CacheIndexEntry = { url: string; at: number };

const sessionMisses = new Set<string>();
let legacyCleared = false;

export const clearAssetMisses = (): void => {
  sessionMisses.clear();
};

export const rememberAssetMiss = (url: string): void => {
  sessionMisses.add(url);
};

export const isRememberedMiss = (url: string): boolean =>
  sessionMisses.has(url);

/** Drop the oldest entries once a cache is past its cap. Newest stays last. */
export const pruneCacheIndex = (
  entries: CacheIndexEntry[],
  url: string,
  limit: number,
  now: number,
): { kept: CacheIndexEntry[]; dropped: string[] } => {
  const next = entries.filter((entry) => entry.url !== url);
  next.push({ url, at: now });
  next.sort((left, right) => left.at - right.at);
  const dropped: string[] = [];
  while (next.length > limit) {
    const oldest = next.shift();
    if (oldest) {
      dropped.push(oldest.url);
    }
  }
  return { kept: next, dropped };
};

const readBody = async (response: Response): Promise<Uint8Array> =>
  new Uint8Array(await response.arrayBuffer());

/**
 * A missing file is sometimes the site's HTML 404 page with status 200.
 * Treating that page as hud.txt hides the real sprite list, and the client
 * then dies with "Failed to get number_0 sprite index".
 */
export const looksLikeHtmlDocument = (
  bytes: Uint8Array,
  contentType: string | null,
): boolean => {
  if (contentType?.toLowerCase().includes("text/html")) {
    return true;
  }
  const sample = new TextDecoder()
    .decode(bytes.subarray(0, 64))
    .trimStart()
    .toLowerCase();
  return sample.startsWith("<!doctype html") || sample.startsWith("<html");
};

const readAsset = async (response: Response): Promise<Uint8Array | null> => {
  const bytes = await readBody(response);
  if (
    bytes.length === 0 ||
    looksLikeHtmlDocument(bytes, response.headers.get("content-type"))
  ) {
    return null;
  }
  return bytes;
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const fetchWithRetry = async (url: string): Promise<Response | null> => {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url);
      if (
        !RETRY_STATUSES.has(response.status) ||
        attempt === RETRY_DELAYS_MS.length
      ) {
        return response;
      }
    } catch {
      if (attempt === RETRY_DELAYS_MS.length) {
        return null;
      }
    }
    await sleep(RETRY_DELAYS_MS[attempt] ?? 150);
  }
  return null;
};

const clearLegacyCaches = (): void => {
  if (legacyCleared || typeof caches === "undefined") {
    return;
  }
  legacyCleared = true;
  void Promise.all(LEGACY_CACHES.map((name) => caches.delete(name)));
};

const readIndex = async (cache: Cache): Promise<CacheIndexEntry[]> => {
  const hit = await cache.match(INDEX_URL);
  if (!hit) {
    return [];
  }
  try {
    const parsed = (await hit.json()) as CacheIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeIndex = async (
  cache: Cache,
  entries: CacheIndexEntry[],
): Promise<void> => {
  await cache.put(
    INDEX_URL,
    new Response(JSON.stringify(entries), {
      headers: { "content-type": "application/json" },
    }),
  );
};

let cacheWrite: Promise<unknown> = Promise.resolve();

/** One index update at a time, so parallel downloads cannot drop each other's rows. */
const enqueueCacheWrite = <T>(work: () => Promise<T>): Promise<T> => {
  const run = cacheWrite.then(work, work);
  cacheWrite = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const touchCacheEntry = (
  cache: Cache,
  kind: AssetCacheKind,
  url: string,
): Promise<void> =>
  enqueueCacheWrite(async () => {
    const limit = CACHE_LIMITS[kind];
    if (!limit) {
      return;
    }
    const { kept, dropped } = pruneCacheIndex(
      await readIndex(cache),
      url,
      limit,
      Date.now(),
    );
    await Promise.all(dropped.map((stale) => cache.delete(stale)));
    await writeIndex(cache, kept);
  });

/**
 * Return cached bytes for a URL, or fetch and store a successful response.
 * Falls back to a plain fetch when the Cache API is unavailable.
 * A 404 is remembered for the session. 429 and 5xx are retried.
 */
export const cacheMatchOrFetch = async (
  url: string,
  kind: AssetCacheKind = "static",
  version?: string,
): Promise<Uint8Array | null> => {
  const cacheKey = versionedCacheKey(url, version);
  if (!url || sessionMisses.has(url)) {
    return null;
  }
  clearLegacyCaches();
  if (typeof caches === "undefined") {
    const response = await fetchWithRetry(url);
    if (!response?.ok) {
      if (response?.status === 404) {
        sessionMisses.add(url);
      }
      return null;
    }
    const bytes = await readAsset(response);
    if (!bytes) {
      sessionMisses.add(url);
    }
    return bytes;
  }

  try {
    const cache = await caches.open(CACHE_NAMES[kind]);
    const hit = await cache.match(cacheKey);
    if (hit?.ok) {
      const cached = await readAsset(hit);
      if (cached) {
        await touchCacheEntry(cache, kind, cacheKey);
        return cached;
      }
      await cache.delete(cacheKey);
    }
    const response = await fetchWithRetry(url);
    if (!response?.ok) {
      if (response?.status === 404) {
        sessionMisses.add(url);
      }
      return null;
    }
    const bytes = await readAsset(response.clone());
    if (!bytes) {
      sessionMisses.add(url);
      return null;
    }
    try {
      await cache.put(cacheKey, response);
      await touchCacheEntry(cache, kind, cacheKey);
    } catch {
      // Cross-origin responses without CORS still return a body to fetch().
    }
    return bytes;
  } catch {
    return null;
  }
};

/** Drop core-pack responses that belong to an older version stamp. */
export const retainCorePackVersion = async (version: string): Promise<void> => {
  if (!version || typeof caches === "undefined") {
    return;
  }
  const marker = `v=${encodeURIComponent(version)}`;
  try {
    const cache = await caches.open(CACHE_NAMES.pack);
    const keys = await cache.keys();
    await Promise.all(
      keys.map((request) =>
        request.url.includes(marker) ? false : cache.delete(request),
      ),
    );
  } catch {
    // Cache maintenance is optional.
  }
};
