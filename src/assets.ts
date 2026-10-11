const RESOURCE_EXTENSIONS = [".mdl", ".wav", ".spr", ".wad"] as const;

const latin1 = new TextDecoder("latin1");

/** Map, sky, and wad names that are safe to join onto a URL or a virtual path. */
export const isSafeGameName = (name: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name);

const isPathChar = (value: number): boolean =>
  (value >= 48 && value <= 57) ||
  (value >= 65 && value <= 90) ||
  (value >= 97 && value <= 122) ||
  value === 95 ||
  value === 45 ||
  value === 46 ||
  value === 47 ||
  value === 92;

export const collectResourcePaths = (bytes: Uint8Array): string[] => {
  const found = new Set<string>();
  let start = -1;
  for (let index = 0; index <= bytes.length; index += 1) {
    const value = index < bytes.length ? bytes[index] : 0;
    if (isPathChar(value)) {
      if (start < 0) {
        start = index;
      }
      continue;
    }
    if (start >= 0) {
      const length = index - start;
      if (length >= 5 && length <= 120) {
        const text = latin1
          .decode(bytes.subarray(start, index))
          .replace(/\\/g, "/")
          .replace(/^\/+/, "");
        const lower = text.toLowerCase();
        if (
          RESOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension))
        ) {
          found.add(lower);
        }
      }
      start = -1;
    }
  }
  return [...found];
};

const readQuoted = (text: string, key: string): string[] => {
  const pattern = new RegExp(`"${key}"\\s+"([^"]+)"`, "gi");
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[1]) {
      values.push(match[1]);
    }
  }
  return values;
};

export interface BspDependencies {
  wads: string[];
  sky: string | null;
}

const BSP_VERSION = 30;
const MAX_ENTITY_LUMP = 2_000_000;

const entityText = (bytes: Uint8Array): string => {
  if (bytes.length >= 4 + 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getInt32(0, true) === BSP_VERSION) {
      const offset = view.getInt32(4, true);
      const length = view.getInt32(8, true);
      if (
        offset >= 0 &&
        length >= 0 &&
        length <= MAX_ENTITY_LUMP &&
        offset + length <= bytes.length
      ) {
        return latin1.decode(bytes.subarray(offset, offset + length));
      }
      return "";
    }
  }
  if (bytes.length > MAX_ENTITY_LUMP) {
    return "";
  }
  return latin1.decode(bytes);
};

export const readBspDependencies = (bytes: Uint8Array): BspDependencies => {
  const text = entityText(bytes);
  const wadNames = readQuoted(text, "wad").flatMap((value) =>
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const normalized = part.replace(/\\/g, "/");
        const name = normalized.slice(normalized.lastIndexOf("/") + 1);
        return name.toLowerCase();
      })
      .filter((name) => name.endsWith(".wad") && isSafeGameName(name)),
  );
  const skyName = readQuoted(text, "skyname")[0]?.trim().toLowerCase() ?? "";
  const sky = isSafeGameName(skyName) ? skyName : null;
  return { wads: [...new Set(wadNames)], sky };
};

export interface PlannedAsset {
  fsPath: string;
  urls: string[];
}

export interface PlanViewerOptions {
  /** Models, sprites, and sounds are unpacked from cstrike-core.pk3. */
  useCorePack?: boolean;
  /**
   * Directory of loose game files served by the dev server, without a
   * trailing slash. Example: `/xash/cstrike`. Omit it in production.
   */
  localRoot?: string;
  /** When false, `localRoot` is ignored. */
  localFallback?: boolean;
}

const CORE_PACK_PREFIXES = ["models/", "sprites/", "sound/"] as const;

const STOCK_PLAYER_MODELS = new Set([
  "arctic",
  "gign",
  "gsg9",
  "guerilla",
  "leet",
  "sas",
  "terror",
  "urban",
  "vip",
]);

const isStockPlayerModel = (relativePath: string): boolean => {
  const match = /^models\/player\/([a-z0-9_]+)\/\1\.mdl$/.exec(relativePath);
  return match != null && STOCK_PLAYER_MODELS.has(match[1]);
};

export const isCoveredByCorePack = (relativePath: string): boolean => {
  // Stock player models are unpacked onto disk. Custom ones are not in the pack.
  if (relativePath.startsWith("models/player/")) {
    return isStockPlayerModel(relativePath);
  }
  return CORE_PACK_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
};

const SHARED_WADS = new Set([
  "cached.wad",
  "cstrike.wad",
  "decals.wad",
  "fonts.wad",
  "gfx.wad",
  "halflife.wad",
  "liquids.wad",
  "tempdecal.wad",
]);

const wadFileName = (relativePath: string): string =>
  relativePath.slice(relativePath.lastIndexOf("/") + 1).toLowerCase();

const isCustomMapWad = (relativePath: string): boolean =>
  relativePath.toLowerCase().endsWith(".wad") &&
  !SHARED_WADS.has(wadFileName(relativePath));

const isMapSpecific = (relativePath: string): boolean =>
  relativePath.startsWith("maps/") || relativePath.startsWith("gfx/env/");

/** decals.wad is opened from the game directory, not from wads/. */
const wadRelativePath = (fileName: string): string => {
  const base = fileName.slice(fileName.lastIndexOf("/") + 1).toLowerCase();
  return base === "decals.wad" ? "decals.wad" : `wads/${base}`;
};

const unique = (values: string[]): string[] => [...new Set(values)];

const assetUrls = (
  relativePath: string,
  mapBase: string,
  sharedBase: string,
  localRoot: string,
): string[] => {
  const fileName = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  const localFallback =
    localRoot && !relativePath.endsWith(".bsp")
      ? `${localRoot}/${relativePath}`
      : "";
  const mapUrl = `${mapBase}${relativePath}`;
  const sharedUrl = `${sharedBase}${relativePath}`;
  const sharedWad =
    relativePath.endsWith(".wad") && !relativePath.startsWith("wads/")
      ? `${sharedBase}wads/${fileName}`
      : "";
  const sharedSound =
    relativePath.endsWith(".wav") && !relativePath.startsWith("sound/")
      ? `${sharedBase}sound/${fileName}`
      : "";
  // Custom map wads are not in the shared library. Asking there first only
  // produces a 404 and then still downloads the map archive.
  if (isCustomMapWad(relativePath)) {
    return unique([mapUrl, localFallback].filter(Boolean));
  }
  // BSP and skies live in the map archive. Shared CS files live in viewer-base,
  // so try that before a map-archive 404.
  const ordered = isMapSpecific(relativePath)
    ? [mapUrl, sharedUrl, sharedWad, sharedSound, localFallback]
    : [sharedUrl, sharedWad, sharedSound, localFallback, mapUrl];
  return unique(ordered.filter(Boolean));
};

export const planViewerAssets = (
  mapName: string,
  demoMapName: string,
  resources: string[],
  bsp: BspDependencies,
  mapAssetBase: string,
  baseAssetBase: string,
  options: PlanViewerOptions = {},
): PlannedAsset[] => {
  if (!isSafeGameName(mapName)) {
    throw new Error("The map name is not valid.");
  }
  const localRoot =
    options.localFallback === false
      ? ""
      : (options.localRoot?.replace(/\/$/, "") ?? "");
  const mapBase = mapAssetBase.endsWith("/")
    ? mapAssetBase
    : `${mapAssetBase}/`;
  const sharedBase = baseAssetBase.endsWith("/")
    ? baseAssetBase
    : `${baseAssetBase}/`;
  const relativePaths = new Set<string>([`maps/${mapName}.bsp`]);
  if (
    demoMapName &&
    isSafeGameName(demoMapName) &&
    demoMapName.toLowerCase() !== mapName.toLowerCase()
  ) {
    relativePaths.add(`maps/${demoMapName}.bsp`);
  }
  for (const wad of bsp.wads) {
    const fileName = wad.slice(wad.lastIndexOf("/") + 1);
    relativePaths.add(wadRelativePath(fileName));
  }
  // Bullet marks are registered from gamedir/decals.wad. A copy under wads/
  // is invisible to that loader, so a shot becomes texture 0.
  relativePaths.add("decals.wad");
  if (bsp.sky) {
    // Prefer TGA; skipping BMP twins cuts ~6 redundant requests per sky.
    for (const face of ["bk", "dn", "ft", "lf", "rt", "up"]) {
      relativePaths.add(`gfx/env/${bsp.sky}${face}.tga`);
    }
  }
  for (const resource of resources) {
    const stripped = resource.replace(/^(cstrike|valve)\//, "");
    if (stripped.includes("..") || stripped.length > 100) {
      continue;
    }
    // Demo binary scans pick up junk; keep only real game asset paths.
    if (stripped.endsWith(".wad")) {
      const fileName = stripped.slice(stripped.lastIndexOf("/") + 1);
      if (isSafeGameName(fileName)) {
        relativePaths.add(wadRelativePath(fileName));
      }
      continue;
    }
    let normalized = stripped;
    if (stripped.endsWith(".mdl")) {
      normalized = stripped.startsWith("models/")
        ? stripped
        : `models/${stripped}`;
    } else if (stripped.endsWith(".spr")) {
      normalized = stripped.startsWith("sprites/")
        ? stripped
        : `sprites/${stripped}`;
    } else if (stripped.endsWith(".wav")) {
      const soundPath = stripped.replace(/^sounds\//, "sound/");
      normalized = soundPath.startsWith("sound/")
        ? soundPath
        : `sound/${soundPath}`;
    } else {
      continue;
    }
    if (options.useCorePack && isCoveredByCorePack(normalized)) {
      continue;
    }
    relativePaths.add(normalized);
  }

  return [...relativePaths].map((relativePath) => ({
    fsPath: `/cstrike/${relativePath}`,
    urls: assetUrls(relativePath, mapBase, sharedBase, localRoot),
  }));
};
