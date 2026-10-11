# xash-cs-demo

[![npm](https://img.shields.io/npm/v/xash-cs-demo)](https://www.npmjs.com/package/xash-cs-demo)

Play Counter-Strike 1.6 GoldSrc demos in the browser with a patched Xash3D FWGS and cs16-client WebAssembly build.

Headless TypeScript library. It boots the patched engine on a canvas, installs game files you provide, and controls playback. It does not ship Valve `cstrike` or `valve` game data, and it does not know about any website's API. You pass URL roots. The host must supply a Counter-Strike 1.6 file set it has the right to use.

Counter-Strike and Half-Life are trademarks of Valve Corporation. This project is not affiliated with Valve.

## Licenses

| Path | License |
| --- | --- |
| `src/`, tests, this README | MIT. Copyright (c) 2026 kreedz.com. See [LICENSE](LICENSE). |
| `engine/` | GPL-3.0. See [engine/LICENSE](engine/LICENSE) and [engine/BUILD.md](engine/BUILD.md). |
| Fonts, delta table, linked libraries | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). |

`package.json` lists the combination as `MIT AND GPL-3.0-only`.

## What you must provide

`loadDemoBootFiles` takes three URL roots. It fetches these paths itself:

| Root field | Files |
| --- | --- |
| `replays` | `{replays}/{demoId}.dem` |
| `maps` | `{maps}/{mapName}.bsp` |
| `mapBase` | `{mapBase}maps/{mapName}.bsp`, custom wads, skies (`gfx/env/{sky}{face}.tga`) |
| `sharedBase` | `gfx.wad`, `wads/`, `decals.wad`, `sound/`, `models/`, `sprites/`, `packs/cstrike-core.pk3`, `packs/cstrike-core.version` |

`base` is accepted as an alias of `mapBase`. `sounds` is accepted as an alias of `sharedBase`: a trailing `/sounds` is removed.

`packs/cstrike-core.pk3` is optional. When it is missing, models, sprites, and sounds are requested one file at a time. Build the pack from a `cstrike` directory you already have:

```bash
node scripts/pack-cstrike-core.mjs path/to/cstrike path/to/cstrike-core.pk3
```

Put a version string in `packs/cstrike-core.version`. The library appends `?v=` so a new pack replaces the cached one.

For local development, set `localRoot` to a directory your dev server already exposes (for example `/xash/cstrike`). Leave it unset in production. `localExtras` is an optional URL of an extras pk3.

Older callers can keep passing `base` and `sounds`. New code should pass `mapBase` and `sharedBase`.

## Install

```bash
npm install xash-cs-demo
```

The package is ESM. `xash-cs-demo` is the player. `xash-cs-demo/track` is the demo parser and does not load the engine. `xash-cs-demo/net` is an optional UDP loopback.

`xash3d-fwgs` is an optional peer dependency. Install it only if you import `xash-cs-demo/net`. Playback does not need it. `extras.pk3` is already included.

Vite (tested) rewrites the package's `new URL(..., import.meta.url)` expressions and serves `engine/` and `assets/` for you, including when dependency pre-bundling is on. To put those files on your own host instead, pass `engineBaseUrl` (a directory URL, trailing slash optional) and `assetUrls` on the boot paths:

```ts
const engine = new PatchedXash({
  canvas,
  engineBaseUrl: "https://cdn.example/engine/",
});

await loadDemoBootFiles(mapName, [demoId], {
  // ...url roots
  assetUrls: {
    delta: "https://cdn.example/delta.lst",
    extras: "https://cdn.example/extras.pk3",
  },
});
```

`engineBaseUrl` must contain `xash.js`, `xash.wasm`, `filesystem_stdio.wasm`, `libref_webgl2.wasm`, and `cstrike/cl_dlls/menu_emscripten_wasm32.wasm` plus `client_emscripten_wasm32.wasm`. Omitted `assetUrls` entries stay on the copies shipped in the package. `locateFile` still overrides a single engine path when you already have one. The content-security policy is listed under Browser and server requirements.

## Usage

```ts
import {
  ENGINE_ARGS,
  GAME_ROOT,
  PLAYBACK_LAUNCH_ARGS,
  PatchedXash,
  loadDemoBootFiles,
  installSharedFiles,
  installDemoFile,
  releaseCorePack,
  DemoPlayback,
  waitUntilPlaying,
  installPageHideRelease,
} from "xash-cs-demo";

installPageHideRelease();

const files = await loadDemoBootFiles(mapName, [demoId], {
  replays: "https://example.test/demos",
  maps: "https://example.test/maps",
  mapBase: "https://example.test/maps/kz_demo/",
  sharedBase: "https://example.test/base/",
});

const engine = new PatchedXash({
  canvas,
  arguments: [...ENGINE_ARGS, ...PLAYBACK_LAUNCH_ARGS],
  blockMicrophone: true,
  suspendAudioWhileHidden: true,
});
await engine.init();
const fs = engine.em!.FS;
await installSharedFiles(fs, files.shared, files.bspBytes, files.bspNames);
releaseCorePack(files.shared);
installDemoFile(fs, files.demos[0]);
fs.chdir?.(GAME_ROOT);
engine.main();

const playback = new DemoPlayback(
  (command) => engine.Cmd_ExecuteString(command),
  files.tracks[0].duration,
);

const started = await waitUntilPlaying(
  () => engine.demoState()?.playing === true,
  () => playback.start(),
  () => true,
);
```

`+playdemo watch` is already in `PLAYBACK_LAUNCH_ARGS`. `playback.start()` runs again only if that launch command was ignored.

`blockMicrophone` rejects `getUserMedia` audio requests so the engine's OpenAL startup does not prompt. `suspendAudioWhileHidden` suspends audio contexts while the tab is hidden, because looping sounds otherwise keep playing after the frame loop stops. Both patch the page until you call `restoreEngineMicrophone` and `restoreEngineAudioHold`.

`installPageHideRelease` quits engines on `pagehide`. Importing the package does not register that listener.

A small Vite page that wires the same steps is in [examples/vite-demo](examples/vite-demo). It does not include a map or a demo.

## Browser and server requirements

- WebGL2 (the engine is started with `-ref webgl2`).
- `DecompressionStream` (deflate), used to unpack pk3 files.
- `CacheStorage` is optional. Without it, files are fetched every time and still kept in a memory cache of about 256 MB.
- Content-Security-Policy: `script-src` must allow `blob:` (the glue script is imported from a blob URL) and `wasm-unsafe-eval` (or the older `unsafe-eval` where the browser requires it). `connect-src` must allow your asset origins and the engine file URLs.

## How a boot works

1. `loadDemoBootFiles` downloads the demo and the bsp, reads the demo header and the BSP entity lump (wad list and sky name), and plans the other files.
2. The optional core pack is unpacked in the browser. Loose files fill anything the pack does not cover.
3. `installSharedFiles` writes them into the engine's in-memory filesystem under `/rodir`.
4. `installDemoFile` writes `cstrike/watch.dem` after blanking dangerous console commands.
5. `engine.main()` starts the frame loop. Playback commands go through `Cmd_ExecuteString`.

`xash-cs-demo/track` exports the GoldSrc demo parser (`readDemoTrack`, `sampleAt`, `airJump`, `timerStartTime`, `sanitizeDemoCommands`, `prepareDemoForEngine`) without loading the engine.

`xash-cs-demo/net` exports `LoopbackNet`, a per-socket UDP loopback for a listen server. A single shared packet queue corrupts the GoldSrc connection. Demo playback does not need it. That entry imports `ErrNoLocation` from the optional peer `xash3d-fwgs`.

## Playback and the patched engine

Playback uses `demo_holdend`, `playdemo`, `demo_pause`, `demo_seek`, and `sys_timescale`. `engine.demoState()` reads `Demo_GetState`. `engine.setGhost` and `engine.setOverlay` push the buffers packed by `packGhostTrack` and `packOverlay`.

`CompareClock` keeps two to four engines on one clock, counted from each demo's start-button time (`timerStartTime`).

`engineBufferSize` picks an internal resolution of at least 1280 pixels wide so the CS HUD stays at in-game proportions when the canvas is a small pane.

`extractPlayerModels` reads `models/player/*/*.mdl` out of a pk3 when you want to mount custom player models as real files.

The engine identifies itself as Xash3D FWGS 0.21. What this build adds, and why the C source still has to be published next to the wasm, is in [engine/README.md](engine/README.md).

## Scripts

```bash
npm test
npm run typecheck
npm run verify-engine
npm run build
```

`npm run build` writes `dist/`. `npm pack` copies `extras.pk3` out of the `xash3d-fwgs` dev dependency into `assets/` and packs `dist/`, `engine/`, and `assets/`. The packed tarball is about 4 MB.
