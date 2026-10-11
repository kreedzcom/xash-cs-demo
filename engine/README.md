# Patched engine binaries

WebAssembly build that plays Counter-Strike 1.6 **HLDEMO protocol 5** recordings.
Stock [xash3d-fwgs](https://github.com/FWGS/xash3d-fwgs) npm packages only understand
Xash DEMO_PROTOCOL 3 and cannot play these demos.

This build adds:

- `demo_holdend`, `demo_seek`, `demo_pause`
- `Demo_GetState`
- `Demo_SetGhost` (32-byte samples: time, x, y, z, pitch, yaw, flags, path distance)
- `Demo_SetOverlay` (32-byte segments: frame, two world points, RGBA)

Files:

- `xash.js`, `xash.wasm` — engine (Xash3D FWGS 0.21)
- `filesystem_stdio.wasm`, `libref_webgl2.wasm`
- `cstrike/cl_dlls/client_emscripten_wasm32.wasm` and `menu_emscripten_wasm32.wasm` — [cs16-client](https://github.com/Velaron/cs16-client)

These files are GPL-covered. The corresponding C and Emscripten source is not in this repository yet. Read [BUILD.md](BUILD.md) before you redistribute them. Confirm the bytes with `npm run verify-engine` ([CHECKSUMS.sha256](CHECKSUMS.sha256)).

License texts: [LICENSE](LICENSE) (GPL-3.0) for the Xash3D FWGS build, and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for cs16-client, the Half-Life SDK exception, and libraries linked into the wasm.
