# Changelog

## 1.0.0

- First stable release. Same player as 0.2.0.
- Copyright and the package author are kreedz.com.

## 0.2.0

- Published as an ESM package with compiled `dist/` and type declarations (`xash-cs-demo`, `xash-cs-demo/track`, `xash-cs-demo/net`).
- Engine and asset files resolve with `new URL(..., import.meta.url)` so Vite can serve them. `engineBaseUrl` and `assetUrls` override those URLs.
- `extras.pk3` ships inside the package. `xash3d-fwgs` is an optional peer, used only by `xash-cs-demo/net`.

## 0.1.0

- TypeScript library that boots a patched Xash3D FWGS and cs16-client build, installs game files you provide, and controls GoldSrc demo playback.
- The TypeScript is MIT. The files in `engine/` stay GPL-3.0. Notices are in `THIRD_PARTY_NOTICES.md`.
- Asset URLs, cache names, and the optional local file directory are host-supplied. The package does not embed a website's paths.
- Demo console commands in type-3 frames are blanked. Map and sky names are checked before they are used as paths. Zip unpacking stops at an uncompressed-size cap.
