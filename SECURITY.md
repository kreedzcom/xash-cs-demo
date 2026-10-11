# Security

Report a vulnerability through [GitHub security advisories](https://github.com/kreedzcom/xash-cs-demo/security) for this repository.

## What the library checks

- Map, sky, and wad names from a demo or BSP must match a short filename pattern before they are joined onto a URL or a path inside the engine's memory filesystem.
- Zip entries with `..`, an absolute path, or an oversized uncompressed total are skipped.
- Demos larger than 128 MiB are refused. Sample collection stops after 250,000 frames.
- Type-3 console frames are scanned for `stop`, `disconnect`, `reconnect`, `retry`, `connect`, `quit`, `exit`, `playdemo`, `timedemo`, and `record`. Matching words are replaced with spaces before the demo is written into the engine.

Commands hidden inside a network message (`stufftext`) are not visible to that scanner. A build of the engine should ignore console commands that come from the demo.

## What you should set in the host page

- Content-Security-Policy must allow `blob:` scripts and `wasm-unsafe-eval`, because the Emscripten glue is loaded from a blob URL and then compiles WebAssembly. See the README.
- `blockMicrophone` and `suspendAudioWhileHidden` patch browser APIs for the whole page. Turn them on only for the viewer, and call the restore functions if the rest of the page needs a microphone or its own audio contexts.
- Serve game files from origins you control. The library will `fetch` every URL you pass in.
