import { extractZipEntries, type ZipEntry } from "./pk3Entries";
import {
  collectResourcePaths,
  isSafeGameName,
  planViewerAssets,
  readBspDependencies,
  type PlannedAsset,
} from "./assets";
import {
  cacheMatchOrFetch,
  classifyAssetUrl,
  retainCorePackVersion,
  type AssetCacheKind,
} from "./assetCache";
import {
  MAX_DEMO_BYTES,
  readDemoTrack,
  sanitizeDemoCommands,
  type DemoTrack,
} from "./demoTrack";
import { blankLogoSprite, LOGO_SPRITE_NAME } from "./logoSprite";
import type { PatchedEngineFs } from "./patchedEngine";

export const GAME_ROOT = "/rodir";

/** Files this package ships. Bundlers rewrite these `new URL` expressions. */
export const PACKAGE_ASSET_URLS = {
  delta: new URL("../assets/delta.lst", import.meta.url).href,
  fira: new URL("../assets/fonts/FiraSans-Regular.ttf", import.meta.url).href,
  tahoma: new URL("../assets/fonts/tahoma.ttf", import.meta.url).href,
  extras: new URL("../assets/extras.pk3", import.meta.url).href,
  hlLang: new URL("../assets/resource/halflife_english.txt", import.meta.url)
    .href,
  csLang: new URL("../assets/resource/cstrike_english.txt", import.meta.url)
    .href,
} as const;

/** Replace any shipped asset URL. Use this when the files live on your CDN. */
export interface PackageAssetUrls {
  delta?: string;
  fira?: string;
  tahoma?: string;
  extras?: string;
  hlLang?: string;
  csLang?: string;
}

export const resolvePackageAssetUrls = (
  override?: PackageAssetUrls,
): Required<PackageAssetUrls> => ({
  delta: override?.delta || PACKAGE_ASSET_URLS.delta,
  fira: override?.fira || PACKAGE_ASSET_URLS.fira,
  tahoma: override?.tahoma || PACKAGE_ASSET_URLS.tahoma,
  extras: override?.extras || PACKAGE_ASSET_URLS.extras,
  hlLang: override?.hlLang || PACKAGE_ASSET_URLS.hlLang,
  csLang: override?.csLang || PACKAGE_ASSET_URLS.csLang,
});

export const REQUIRED_CS_SPRITES = [
  "hud.txt",
  "640hud1.spr",
  "640hud2.spr",
  "640hud3.spr",
  "640hud4.spr",
  "640hud5.spr",
  "640hud6.spr",
  "640hud7.spr",
  "640hud10.spr",
  "scope_arc.tga",
  "scope_arc_ne.tga",
  "scope_arc_nw.tga",
  "scope_arc_sw.tga",
  "sniper_scope.spr",
  "black_smoke1.spr",
  "black_smoke2.spr",
  "black_smoke3.spr",
  "black_smoke4.spr",
  "shadow_circle.spr",
];

export const ENGINE_ARGS = [
  "-ref",
  "webgl2",
  "-windowed",
  "-noenginemouse",
  "+m_ignore",
  "1",
  "+m_pitch",
  "0",
  "+m_yaw",
  "0",
  "-game",
  "cstrike",
  "-console",
  "+con_notifytime",
  "0",
  "+hud_saytext",
  "0",
  "+_vgui_menus",
  "0",
  "+voice_enable",
  "0",
  "+r_drawviewmodel",
  "1",
  "+hud_fastswitch",
  "1",
  "+cl_dynamiccrosshair",
  "1",
  "+cl_crosshair_size",
  "auto",
  "+cl_crosshair_color",
  "50 250 50",
  "+cl_crosshair_translucent",
  "1",
  "+demo_overlay_info",
  "0",
] as const;

/** Issued with the engine so the CS menu never gets a frame of its own. */
export const PLAYBACK_LAUNCH_ARGS = [
  "+demo_holdend",
  "1",
  "+playdemo",
  "watch",
] as const;

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const FILE_YIELD_BATCH = 48;

export const ensureDir = (
  fs: PatchedEngineFs,
  directory: string,
  known?: Set<string>,
): void => {
  if (!directory || known?.has(directory)) {
    return;
  }
  const parts = directory.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    if (known?.has(current)) {
      continue;
    }
    try {
      fs.mkdir(current);
    } catch {
      // Already present.
    }
    known?.add(current);
  }
};

export const writeFs = (
  fs: PatchedEngineFs,
  filePath: string,
  data: Uint8Array | string,
  known?: Set<string>,
): void => {
  ensureDir(fs, filePath.slice(0, filePath.lastIndexOf("/")), known);
  if (typeof data === "string") {
    fs.writeFile(filePath, data);
    return;
  }
  // Game files are read-only. Sharing the buffer avoids a copy per engine.
  fs.writeFile(filePath, data, { canOwn: true });
};

const MEMORY_BUDGET = 256 * 1024 * 1024;
const assetMemory = new Map<string, Uint8Array>();
let assetMemoryBytes = 0;

const rememberAsset = (key: string, bytes: Uint8Array): void => {
  const previous = assetMemory.get(key);
  if (previous) {
    assetMemoryBytes -= previous.byteLength;
    assetMemory.delete(key);
  }
  assetMemory.set(key, bytes);
  assetMemoryBytes += bytes.byteLength;
  while (assetMemoryBytes > MEMORY_BUDGET && assetMemory.size > 0) {
    const oldest = assetMemory.keys().next().value;
    if (oldest == null) {
      return;
    }
    const removed = assetMemory.get(oldest);
    assetMemory.delete(oldest);
    assetMemoryBytes -= removed?.byteLength ?? 0;
  }
};

export type AssetClassifier = (
  url: string,
  fallback: AssetCacheKind,
) => AssetCacheKind;

export const fetchFirst = async (
  urls: string[],
  kind: AssetCacheKind = "static",
  classify: AssetClassifier = classifyAssetUrl,
): Promise<Uint8Array | null> => {
  for (const url of urls) {
    const key = `${classify(url, kind)}\0${url}`;
    const cached = assetMemory.get(key);
    if (cached) {
      rememberAsset(key, cached);
      return cached;
    }
  }
  for (const url of urls) {
    const resolved = classify(url, kind);
    const bytes = await cacheMatchOrFetch(url, resolved);
    if (bytes) {
      rememberAsset(`${resolved}\0${url}`, bytes);
      return bytes;
    }
  }
  return null;
};

const localFile = (
  localRoot: string | undefined,
  relativePath: string,
): string[] =>
  localRoot ? [`${localRoot.replace(/\/$/, "")}/${relativePath}`] : [];

const CORE_PACK_FILE = "packs/cstrike-core.pk3";
const CORE_PACK_VERSION = "packs/cstrike-core.version";

export type CorePackDownload = {
  version: string;
  bytes: Uint8Array | null;
};

/** Shared models, sprites, and sounds. Null when neither the API nor local pack exists. */
export const fetchCorePack = async (
  sharedRoot: string,
  localRoot?: string,
  classify: AssetClassifier = classifyAssetUrl,
): Promise<CorePackDownload> => {
  const root = sharedRoot.endsWith("/") ? sharedRoot : `${sharedRoot}/`;
  let version = "";
  try {
    const response = await fetch(`${root}${CORE_PACK_VERSION}`, {
      cache: "no-store",
    });
    if (response.ok) {
      version = (await response.text()).trim();
    }
  } catch {
    // Local pack can still load without a stamp.
  }
  if (!version && localRoot) {
    try {
      const localVersion = await fetch(
        `${localRoot.replace(/\/$/, "")}/${CORE_PACK_VERSION}`,
        { cache: "no-store" },
      );
      if (localVersion.ok) {
        version = (await localVersion.text()).trim();
      }
    } catch {
      // No stamp.
    }
  }
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  if (version) {
    await retainCorePackVersion(version);
  }
  const bytes = await fetchFirst(
    [
      `${root}${CORE_PACK_FILE}${query}`,
      ...localFile(localRoot, `${CORE_PACK_FILE}${query}`),
    ],
    "pack",
    classify,
  );
  return { version, bytes };
};

export type FetchedAsset = {
  fsPath: string;
  bytes: Uint8Array;
};

export const fetchPlannedAssets = async (
  planned: PlannedAsset[],
  onProgress?: (loaded: number, total: number) => void,
  shouldContinue?: () => boolean,
  classify: AssetClassifier = classifyAssetUrl,
  concurrency = 6,
): Promise<FetchedAsset[]> => {
  const pending = planned.map((asset) => ({
    ...asset,
    fsPath: asset.fsPath.startsWith("/cstrike/")
      ? `${GAME_ROOT}${asset.fsPath}`
      : asset.fsPath,
  }));
  const results: FetchedAsset[] = [];
  let loaded = 0;
  const total = pending.length;

  const downloadNext = async () => {
    while (pending.length > 0 && (shouldContinue?.() ?? true)) {
      const asset = pending.shift();
      if (!asset) {
        return;
      }
      const bytes = await fetchFirst(asset.urls, "static", classify);
      if (bytes) {
        results.push({ fsPath: asset.fsPath, bytes });
      }
      loaded += 1;
      if (loaded % 8 === 0 || loaded === total) {
        onProgress?.(loaded, total);
      }
    }
  };

  onProgress?.(0, total);
  await Promise.all(
    Array.from(
      {
        length: Math.min(Math.max(concurrency, 1), Math.max(pending.length, 1)),
      },
      () => downloadNext(),
    ),
  );
  return results;
};

export interface SharedBootFiles {
  gfxWad: Uint8Array | null;
  deltaLst: Uint8Array | null;
  fira: Uint8Array | null;
  tahoma: Uint8Array | null;
  extras: Uint8Array | null;
  csExtras: Uint8Array | null;
  hlLang: Uint8Array | null;
  csLang: Uint8Array | null;
  sprites: { name: string; bytes: Uint8Array }[];
  corePack: Uint8Array | null;
  /** Loose copies of the core pack. The engine opens these as normal files. */
  packFiles: { name: string; bytes: Uint8Array }[];
  planned: FetchedAsset[];
}

type StaticShared = Pick<
  SharedBootFiles,
  | "gfxWad"
  | "deltaLst"
  | "fira"
  | "tahoma"
  | "extras"
  | "csExtras"
  | "hlLang"
  | "csLang"
>;

const staticSharedPromises = new Map<string, Promise<StaticShared>>();

const loadStaticShared = (
  sharedRoot: string,
  localExtras?: string,
  classify: AssetClassifier = classifyAssetUrl,
  assetUrls: Required<PackageAssetUrls> = PACKAGE_ASSET_URLS,
): Promise<StaticShared> => {
  const cacheKey = [
    sharedRoot,
    localExtras ?? "",
    assetUrls.delta,
    assetUrls.fira,
    assetUrls.tahoma,
    assetUrls.extras,
    assetUrls.hlLang,
    assetUrls.csLang,
  ].join("\0");
  const existing = staticSharedPromises.get(cacheKey);
  if (existing) {
    return existing;
  }
  const load = (urls: string[]) => fetchFirst(urls, "static", classify);
  const pending = Promise.all([
    load([`${sharedRoot}gfx.wad`, `${sharedRoot}valve/gfx.wad`]),
    load([assetUrls.delta]),
    load([assetUrls.fira]),
    load([assetUrls.tahoma]),
    load([assetUrls.extras]),
    localExtras ? load([localExtras]) : Promise.resolve(null),
    load([assetUrls.hlLang]),
    load([assetUrls.csLang]),
  ]).then(
    ([gfxWad, deltaLst, fira, tahoma, extras, csExtras, hlLang, csLang]) => ({
      gfxWad,
      deltaLst,
      fira,
      tahoma,
      extras,
      csExtras,
      hlLang,
      csLang,
    }),
  );
  const guarded = pending.catch((error: unknown) => {
    if (staticSharedPromises.get(cacheKey) === guarded) {
      staticSharedPromises.delete(cacheKey);
    }
    throw error;
  });
  staticSharedPromises.set(cacheKey, guarded);
  return guarded;
};

type UnpackedCore = {
  pack: Uint8Array | null;
  files: ZipEntry[];
};

let unpackedCore: { version: string; promise: Promise<UnpackedCore> } | null =
  null;

const unpackCorePack = (
  version: string,
  pack: Uint8Array | null,
): Promise<UnpackedCore> => {
  if (unpackedCore?.version === version) {
    return unpackedCore.promise;
  }
  const promise = (
    pack ? extractZipEntries(pack, () => true) : Promise.resolve([])
  ).then((files) => ({
    pack: files.length > 0 ? null : pack,
    files,
  }));
  unpackedCore = { version, promise };
  promise.catch(() => {
    if (unpackedCore?.promise === promise) {
      unpackedCore = null;
    }
  });
  return promise;
};

const spritePath = (name: string): string => `sprites/${name.toLowerCase()}`;

export const fetchSharedBootFiles = async (
  sharedRoot: string,
  planned: PlannedAsset[],
  onProgress?: (message: string) => void,
  shouldContinue?: () => boolean,
  corePack: Uint8Array | null = null,
  coreVersion = "",
  localRoot?: string,
  localExtras?: string,
  classify: AssetClassifier = classifyAssetUrl,
  concurrency = 6,
  assetUrls?: PackageAssetUrls,
): Promise<SharedBootFiles> => {
  const resolvedAssets = resolvePackageAssetUrls(assetUrls);
  onProgress?.("Downloading shared game files...");
  onProgress?.(
    planned.length > 0
      ? `Downloading game files 0/${planned.length}...`
      : "Preparing engines...",
  );
  const [staticFiles, plannedFiles, unpacked] = await Promise.all([
    loadStaticShared(sharedRoot, localExtras, classify, resolvedAssets),
    fetchPlannedAssets(
      planned,
      (loaded, total) => {
        onProgress?.(`Downloading game files ${loaded}/${total}...`);
      },
      shouldContinue,
      classify,
      concurrency,
    ),
    unpackCorePack(
      coreVersion || (corePack ? "unversioned" : "missing"),
      corePack,
    ),
  ]);

  const unpackedNames = new Set(
    unpacked.files.map((file) => file.name.toLowerCase()),
  );
  const missingSprites =
    corePack == null
      ? [...REQUIRED_CS_SPRITES]
      : REQUIRED_CS_SPRITES.filter(
          (name) => !unpackedNames.has(spritePath(name)),
        );
  const sprites: { name: string; bytes: Uint8Array }[] = [];
  await Promise.all(
    missingSprites.map(async (name) => {
      const bytes = await fetchFirst(
        [
          `${sharedRoot}sprites/${name}`,
          `${sharedRoot}cstrike/sprites/${name}`,
          ...localFile(localRoot, `sprites/${name}`),
        ],
        "static",
        classify,
      );
      if (bytes) {
        sprites.push({ name, bytes });
      }
    }),
  );

  return {
    ...staticFiles,
    sprites,
    // A full unpack replaces the archive. Keep the zip only when unpacking failed.
    corePack: unpacked.pack,
    packFiles: unpacked.files,
    planned: plannedFiles,
  };
};

/**
 * Drop this boot's references. The session cache keeps the unpacked pack
 * so the next engine does not inflate it again.
 */
export const releaseCorePack = (shared: SharedBootFiles): void => {
  shared.corePack = null;
  shared.packFiles = [];
};

export const installSharedFiles = async (
  fs: PatchedEngineFs,
  shared: SharedBootFiles,
  bspBytes: Uint8Array,
  bspNames: string[],
): Promise<void> => {
  const known = new Set<string>();
  try {
    fs.mkdir("/rwdir");
  } catch {
    // Present.
  }

  writeFs(
    fs,
    `${GAME_ROOT}/cstrike/gameinfo.txt`,
    'game "Counter-Strike"\ngamedir "cstrike"\ntype "multiplayer"\n',
    known,
  );
  writeFs(
    fs,
    `${GAME_ROOT}/cstrike/liblist.gam`,
    'game "Counter-Strike"\ntype "multiplayer"\ngamedll "dlls/mp.dll"\n',
    known,
  );
  writeFs(
    fs,
    `${GAME_ROOT}/valve/gameinfo.txt`,
    'game "Half-Life"\ngamedir "valve"\n',
    known,
  );

  if (shared.gfxWad) {
    writeFs(fs, `${GAME_ROOT}/valve/gfx.wad`, shared.gfxWad, known);
  } else {
    const size = 16;
    const placeholder = new Uint8Array(8 + size * size);
    const header = new DataView(placeholder.buffer);
    header.setInt32(0, size, true);
    header.setInt32(4, size, true);
    writeFs(fs, `${GAME_ROOT}/valve/gfx/conchars`, placeholder, known);
  }
  if (shared.deltaLst) {
    writeFs(fs, `${GAME_ROOT}/valve/delta.lst`, shared.deltaLst, known);
    writeFs(fs, `${GAME_ROOT}/cstrike/delta.lst`, shared.deltaLst, known);
  }
  if (shared.hlLang) {
    writeFs(
      fs,
      `${GAME_ROOT}/valve/resource/halflife_english.txt`,
      new TextDecoder().decode(shared.hlLang),
      known,
    );
  }
  if (shared.csLang) {
    writeFs(
      fs,
      `${GAME_ROOT}/cstrike/resource/cstrike_english.txt`,
      new TextDecoder().decode(shared.csLang),
      known,
    );
  }
  if (shared.fira) {
    writeFs(
      fs,
      `${GAME_ROOT}/valve/gfx/fonts/FiraSans-Regular.ttf`,
      shared.fira,
      known,
    );
  }
  if (shared.tahoma) {
    writeFs(
      fs,
      `${GAME_ROOT}/valve/gfx/fonts/tahoma.ttf`,
      shared.tahoma,
      known,
    );
  }
  if (shared.extras) {
    writeFs(fs, `${GAME_ROOT}/valve/extras.pk3`, shared.extras, known);
  }
  if (shared.csExtras) {
    writeFs(fs, `${GAME_ROOT}/cstrike/extras.pk3`, shared.csExtras, known);
  }
  if (shared.corePack) {
    writeFs(
      fs,
      `${GAME_ROOT}/cstrike/cstrike-core.pk3`,
      shared.corePack,
      known,
    );
  }
  for (let index = 0; index < shared.packFiles.length; index += 1) {
    const file = shared.packFiles[index];
    writeFs(fs, `${GAME_ROOT}/cstrike/${file.name}`, file.bytes, known);
    if (index % FILE_YIELD_BATCH === FILE_YIELD_BATCH - 1) {
      await yieldToBrowser();
    }
  }
  for (const sprite of shared.sprites) {
    writeFs(
      fs,
      `${GAME_ROOT}/cstrike/sprites/${sprite.name}`,
      sprite.bytes,
      known,
    );
  }
  const logo = blankLogoSprite();
  writeFs(fs, `${GAME_ROOT}/cstrike/sprites/${LOGO_SPRITE_NAME}`, logo, known);
  writeFs(fs, `${GAME_ROOT}/valve/sprites/${LOGO_SPRITE_NAME}`, logo, known);
  for (const name of bspNames) {
    writeFs(fs, `${GAME_ROOT}/cstrike/maps/${name}.bsp`, bspBytes, known);
  }
  for (const asset of shared.planned) {
    writeFs(fs, asset.fsPath, asset.bytes, known);
    if (asset.fsPath.endsWith("/decals.wad")) {
      writeFs(fs, `${GAME_ROOT}/cstrike/decals.wad`, asset.bytes, known);
      writeFs(fs, `${GAME_ROOT}/valve/decals.wad`, asset.bytes, known);
    }
  }
};

export const installDemoFile = (
  fs: PatchedEngineFs,
  demoBytes: Uint8Array,
): void => {
  writeFs(
    fs,
    `${GAME_ROOT}/cstrike/watch.dem`,
    sanitizeDemoCommands(demoBytes),
  );
};

export interface DemoBootPaths {
  /** Demo files, without a trailing slash. `{replays}/{id}.dem`. */
  replays: string;
  /** Map bsp directory, without a trailing slash. `{maps}/{name}.bsp`. */
  maps: string;
  /** Map archive root, with or without a trailing slash. */
  mapBase?: string;
  /** Shared library root (models, sounds, wads, packs). */
  sharedBase?: string;
  /** @deprecated Use mapBase. */
  base?: string;
  /**
   * @deprecated Use sharedBase. A sounds URL is accepted and `/sounds` is
   * stripped so older callers keep working.
   */
  sounds?: string;
  /** Dev-server directory of loose game files, for example `/xash/cstrike`. */
  localRoot?: string;
  /** Optional dev-only extras pk3 URL. */
  localExtras?: string;
  /**
   * URLs for delta.lst, fonts, language stubs, and extras.pk3.
   * Omitted entries use the copies shipped in this package.
   */
  assetUrls?: PackageAssetUrls;
  classifyUrl?: AssetClassifier;
  /** Parallel asset downloads. Defaults to 6. */
  downloadConcurrency?: number;
}

const withSlash = (value: string): string => {
  if (!value) {
    return "";
  }
  return value.endsWith("/") ? value : `${value}/`;
};

export const resolveBootPaths = (
  paths: DemoBootPaths,
): {
  replays: string;
  maps: string;
  mapBase: string;
  sharedBase: string;
  localRoot?: string;
  localExtras?: string;
  assetUrls: Required<PackageAssetUrls>;
  classify: AssetClassifier;
  concurrency: number;
} => {
  const mapBase = paths.mapBase ?? paths.base ?? "";
  const sharedBase =
    paths.sharedBase ??
    (paths.sounds ? paths.sounds.replace(/\/sounds\/?$/, "/") : "");
  return {
    replays: paths.replays,
    maps: paths.maps,
    mapBase: withSlash(mapBase),
    sharedBase: withSlash(sharedBase),
    localRoot: paths.localRoot,
    localExtras: paths.localExtras,
    assetUrls: resolvePackageAssetUrls(paths.assetUrls),
    classify: paths.classifyUrl ?? classifyAssetUrl,
    concurrency: paths.downloadConcurrency ?? 6,
  };
};

export interface LoadedDemoBoot {
  demos: Uint8Array[];
  tracks: DemoTrack[];
  bspBytes: Uint8Array;
  bspNames: string[];
  shared: SharedBootFiles;
}

/** Download the demo, map, shared pack, and map-only files once for one or two engines. */
export const loadDemoBootFiles = async (
  mapName: string,
  demoIds: number[],
  paths: DemoBootPaths,
  onProgress?: (message: string) => void,
  shouldContinue?: () => boolean,
): Promise<LoadedDemoBoot> => {
  if (!isSafeGameName(mapName)) {
    throw new Error("The map name is not valid.");
  }
  const several = demoIds.length > 1;
  const resolved = resolveBootPaths(paths);
  const sharedRoot = resolved.sharedBase;
  onProgress?.(several ? "Downloading demos..." : "Downloading the demo...");
  const [downloaded, bspBytes, corePack] = await Promise.all([
    Promise.all(
      demoIds.map((demoId) =>
        fetchFirst(
          [`${resolved.replays}/${demoId}.dem`],
          "demo",
          resolved.classify,
        ),
      ),
    ),
    fetchFirst(
      [
        `${resolved.maps}/${encodeURIComponent(mapName)}.bsp`,
        `${resolved.mapBase}maps/${encodeURIComponent(mapName)}.bsp`,
      ],
      "map",
      resolved.classify,
    ),
    fetchCorePack(sharedRoot, resolved.localRoot, resolved.classify),
  ]);
  if (downloaded.some((demo) => !demo)) {
    throw new Error(
      several
        ? "One of the demos could not be downloaded."
        : "This demo could not be downloaded.",
    );
  }
  if (!bspBytes) {
    throw new Error(
      several
        ? "The map file for these demos is not available."
        : "The map file for this demo is not available.",
    );
  }
  if (!(shouldContinue?.() ?? true)) {
    throw new Error("cancelled");
  }
  const demos = downloaded as Uint8Array[];
  if (demos.some((demo) => demo.length > MAX_DEMO_BYTES)) {
    throw new Error(
      several
        ? "One of the demos is too large to play."
        : "This demo is too large to play.",
    );
  }
  const parsed = demos.map((bytes) => readDemoTrack(bytes));
  if (parsed.some((track) => !track)) {
    throw new Error(
      several
        ? "One of the files is not a GoldSrc demo."
        : "This file is not a GoldSrc demo.",
    );
  }
  const tracks = parsed as DemoTrack[];

  const dependencies = readBspDependencies(bspBytes);
  const resources = demos.flatMap((bytes) => collectResourcePaths(bytes));
  const demoMapName = tracks.find((track) => track.mapName)?.mapName ?? "";
  onProgress?.("Downloading shared game files...");
  const planned = planViewerAssets(
    mapName,
    demoMapName,
    resources,
    dependencies,
    resolved.mapBase,
    sharedRoot,
    {
      useCorePack: corePack.bytes != null,
      localRoot: resolved.localRoot,
    },
  ).filter((asset) => !asset.fsPath.endsWith(".bsp"));
  const shared = await fetchSharedBootFiles(
    sharedRoot,
    planned,
    onProgress,
    shouldContinue,
    corePack.bytes,
    corePack.version,
    resolved.localRoot,
    resolved.localExtras,
    resolved.classify,
    resolved.concurrency,
    resolved.assetUrls,
  );
  const bspNames = [
    ...new Set(
      [mapName, ...tracks.map((track) => track.mapName)].filter((name) =>
        isSafeGameName(name),
      ),
    ),
  ];
  return { demos, tracks, bspBytes, bspNames, shared };
};
