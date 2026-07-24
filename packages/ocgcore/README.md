# @dln/ocgcore

Isolated Emscripten build package for the real Project Ignis/EDOPro duel engine.

## Commands

```sh
npm run ocgcore:doctor
npm run ocgcore:fetch
npm run ocgcore:build
npm run ocgcore:smoke
```

`engine.lock.json` pins the exact upstream core revision. `fetch` checks out that detached commit beneath `vendor/ocgcore` and initializes its pinned Lua submodule. Generated sources and binaries are intentionally ignored.

The build contract is:

```text
packages/ocgcore/dist/ocgcore.js
packages/ocgcore/dist/ocgcore.wasm
```

The browser worker will consume only those two artifacts. Upstream source layout, Emscripten flags, Lua callbacks, card readers, and duel APIs stay private to this package.

## Exported bridge

The generated module currently exports a minimal handle-based duel API:

- `dln_ocg_create`
- `dln_ocg_destroy`
- `dln_ocg_start`
- `dln_ocg_process`
- `dln_ocg_get_message`
- `dln_ocg_set_response`
- `dln_ocg_version_major`
- `dln_ocg_version_minor`

The bridge supplies deterministic RNG seeds and safe placeholder callbacks. Real card data and Lua script loading are the next integration layer before interactive gameplay.

## Smoke test

`npm run ocgcore:smoke` loads the generated ES module in Node.js, verifies ocgcore API version 11.0, allocates a duel, starts and processes it, and requires a non-empty startup message from `OCG_DuelGetMessage`.

GitHub Actions runs the build and smoke test whenever the package changes and uploads the generated JS/WASM pair as a workflow artifact.
