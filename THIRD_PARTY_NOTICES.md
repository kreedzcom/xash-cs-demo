# Third-party notices

## TypeScript glue (`src/`)

MIT. Copyright (c) 2026 kreedz.com. See [LICENSE](LICENSE).

Parts of `src/patchedEngine.ts` and `src/loopbackNet.ts` follow the shape of the MIT package [xash3d-fwgs](https://github.com/yohimik/webxash3d-fwgs) by yohimik (`xash3d-fwgs` 1.2.2, web port commit `7c58854`). `engine/xash.js` is a patched Emscripten glue build in that style.

```
MIT License

Copyright (c) yohimik

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`assets/extras.pk3` is a copy of `extras.pk3` from that MIT package (export `xash3d-fwgs/extras.pk3`, file `dist/valve/extras.pk3` in 1.2.2). `scripts/prepack.mjs` copies it when the npm tarball is built. It is not committed. The published package includes that copy so playback does not need `xash3d-fwgs` installed. `xash-cs-demo/net` still imports `ErrNoLocation` from `xash3d-fwgs`, which is an optional peer dependency.

## Engine binaries (`engine/`)

[Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs) is GPL-3.0. The full text is [engine/LICENSE](engine/LICENSE). The corresponding source for this exact build is not in the repository yet. See [engine/BUILD.md](engine/BUILD.md).

[cs16-client](https://github.com/Velaron/cs16-client) is GPL-2.0 or later (the upstream LICENSE says "version 2 of the License, or any later version"), with this additional exception from that LICENSE:

> In addition, as a special exception, the author gives permission to link the code of this program with the Half-Life Game Engine ("HL Engine") and Modified Game Libraries ("MODs") developed by Valve, L.L.C ("Valve"). You must obey the GNU General Public License in all respects for all of the code used other than the HL Engine and MODs from Valve.

The same upstream LICENSE also includes the Half-Life 1 SDK terms for SDK portions: you may copy, modify, and distribute that SDK code only for free, and a distribution must keep Valve's license text. Copyright Valve Corporation. This package does not vendor the SDK tree. The client wasm is the compiled result. Read the upstream LICENSE before you redistribute `client_emscripten_wasm32.wasm` or `menu_emscripten_wasm32.wasm`.

Because cs16-client is "or later", it can be combined with GPL-3.0 engine code.

### Libraries visible in `xash.wasm` debug paths

| Component                      | Typical license               | Where it appears                     |
| ------------------------------ | ----------------------------- | ------------------------------------ |
| mbedtls                        | Apache-2.0                    | `engine-src/3rdparty/mbedtls/`       |
| opus 1.4.0                     | BSD-3-Clause                  | `engine-src/3rdparty/opus/`          |
| miniz                          | MIT                           | `engine-src/3rdparty/miniz/miniz.c`  |
| MultiEmulator                  | GPL-3.0 (ReGameDLL_CS family) | `engine-src/3rdparty/MultiEmulator/` |
| Emscripten runtime (`xash.js`) | MIT                           | generated glue                       |

Confirm the exact texts against the pinned engine sources when those sources are published. Do not treat this table as a substitute for those texts.

## Fonts and engine data (`assets/`)

- `assets/fonts/FiraSans-Regular.ttf` — SIL Open Font License 1.1. Copyright (c) 2012-2015, The Mozilla Foundation and Telefonica S.A. Full text: [assets/fonts/FiraSans-OFL.txt](assets/fonts/FiraSans-OFL.txt).
- `assets/fonts/tahoma.ttf` — Tahoma from the Wine project, LGPL-2.1 or later. Copyright (c) 1993-2024 the Wine project authors. The short notice is [assets/fonts/tahoma-LICENSE.txt](assets/fonts/tahoma-LICENSE.txt). The full LGPL-2.1 text those authors point at (`COPYING.LIB`) is [assets/fonts/COPYING.LGPL-2.1.txt](assets/fonts/COPYING.LGPL-2.1.txt).
- `assets/delta.lst` — GoldSrc network delta table the engine reads at startup. It is engine data, not a retail map, model, or sound. Xash3D FWGS ships this table with the GPL engine. If you replace the binaries, replace this file with the copy from that same source tree.
- `assets/resource/halflife_english.txt` and `cstrike_english.txt` — empty language stubs written for this package so the engine has a file to open. They are not Valve's language databases.

## Game files this package does not include

Counter-Strike, Half-Life, and Valve are trademarks of Valve Corporation. This project is not affiliated with Valve.

You must supply your own legally obtained Counter-Strike 1.6 files (maps, demos, models, sprites, sounds, wads). This repository does not contain them, and it does not grant any right to download them from anyone else's website.
