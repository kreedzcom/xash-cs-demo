# Contributing

The TypeScript in `src/` is MIT. The files in `engine/` are GPL-3.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Checks

```bash
npm test
npm run typecheck
npm run verify-engine
npm run build
npm pack --dry-run
```

Tests build tiny synthetic demos in memory. They do not need a Counter-Strike install or another repository.

## Engine binaries

Do not replace `engine/*.wasm` or `engine/xash.js` without also updating [engine/CHECKSUMS.sha256](engine/CHECKSUMS.sha256) and the source notes in [engine/BUILD.md](engine/BUILD.md). `npm run verify-engine` must pass.

## Game data

Do not commit Valve `cstrike` or `valve` files, demos, or maps. `scripts/pack-cstrike-core.mjs` only packs a directory you already have, and its output stays outside git.

`assets/extras.pk3` is copied from the `xash3d-fwgs` dev dependency by `scripts/prepack.mjs`. Do not commit that copy.

## Releasing

1. Bump `version` in `package.json` and add a section to `CHANGELOG.md`.
2. `npm whoami` must be the npm user that owns `xash-cs-demo`. `npm view xash-cs-demo version` shows what is already published.
3. Tag `vX.Y.Z` and push the tag. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs the checks and `npm publish --provenance`.
4. The workflow needs either an `NPM_TOKEN` repository secret (automation token) or npm trusted publishing for this repository. Provenance is requested in `publishConfig`, so a publish from a laptop may be rejected. Publish from the tag workflow.
