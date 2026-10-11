# Building the engine

`engine/` is a WebAssembly build of [Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs) 0.21 plus [cs16-client](https://github.com/Velaron/cs16-client), with the playback patches below. Stock npm `xash3d-fwgs` 1.2.2 (web port commit `7c58854`) only plays Xash DEMO_PROTOCOL 3 and does not export `Demo_GetState`.

The C sources, the Emscripten version, and the exact upstream commits that produced these six files are **not in this repository**. Xash3D FWGS is GPL-3.0. cs16-client is GPL-2.0 or later. Redistributing `engine/` is complete only when this tree also contains:

1. The Xash3D FWGS checkout, pinned to the commit this build used.
2. The cs16-client checkout, pinned to the commit this build used.
3. The patch set listed below, as committed diffs against those pins.
4. The Emscripten SDK version and the configure flags.
5. A build script (shell or Dockerfile) whose outputs match [`CHECKSUMS.sha256`](CHECKSUMS.sha256).

Until that source is added, treat `engine/` as unpublished build output. Check the bytes you have with:

```bash
npm run verify-engine
```

## Patches this build adds

- Play Half-Life DEMO protocol 5 (`HLDEMO`) recordings. The demofile code lives beside the stock Xash demo reader (`demofile_gs` and `demofile_xash` in the engine sources).
- Console commands: `demo_holdend`, `demo_seek`, `demo_pause`.
- Export `Demo_GetState` (playing, frame, frame count, time, length, paused, ended, seeking).
- Export `Demo_SetGhost`. Each sample is 32 bytes: time, x, y, z, pitch, yaw, flags, path distance.
- Export `Demo_SetOverlay`. Each segment is 32 bytes: frame, two world points, RGBA.

Debug paths baked into `xash.wasm` are rooted at `../engine-src/` (for example `engine/client/demofile/demofile_gs.c`). File sizes:

| File                          | Bytes   |
| ----------------------------- | ------- |
| xash.wasm                     | 4360353 |
| xash.js                       | 501128  |
| filesystem_stdio.wasm         | 56688   |
| libref_webgl2.wasm            | 217149  |
| client_emscripten_wasm32.wasm | 654253  |
| menu_emscripten_wasm32.wasm   | 620578  |

## Third-party code linked into the binaries

mbedtls, opus, miniz, and MultiEmulator are visible in the `xash.wasm` debug paths. Notices are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The Emscripten runtime in `xash.js` is MIT.

## Client library

`client_emscripten_wasm32.wasm` and `menu_emscripten_wasm32.wasm` are cs16-client. That project is GPL-2.0 or later, with a special exception that allows linking with the Half-Life engine and Valve modified game libraries. Parts of it come from the Half-Life 1 SDK. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
