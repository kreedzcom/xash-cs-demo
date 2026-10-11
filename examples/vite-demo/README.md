# Vite example

A single page that boots `xash-cs-demo`. It does not include a map, a demo, or any Valve file. Point the variables at files you have the right to serve.

Published projects install the package (`npm install xash-cs-demo`) and import it. They do not need the alias in this example's Vite config.

From the `xash-cs-demo` directory, after `npm install`:

```bash
npx vite --config examples/vite-demo/vite.config.ts
```

Set these in a `.env` file next to `index.html` (do not commit it):

```
VITE_MAP_NAME=kz_demo
VITE_DEMO_ID=1
VITE_REPLAYS_URL=https://example.test/demos
VITE_MAPS_URL=https://example.test/maps
VITE_MAP_BASE_URL=https://example.test/maps/kz_demo/
VITE_SHARED_BASE_URL=https://example.test/base/
```

The page needs a Content-Security-Policy that allows `blob:` scripts and `wasm-unsafe-eval`. Vite's dev server does not set that policy.
