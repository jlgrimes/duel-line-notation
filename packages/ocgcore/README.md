# @dln/ocgcore

Isolated Emscripten build package for the real Project Ignis/EDOPro duel engine.

## Commands

```sh
npm run ocgcore:doctor
npm run ocgcore:fetch
npm run ocgcore:build
npm run ocgcore:smoke
npm run ocgcore:native-check
npm run ocgcore:fixtures
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

The bridge supplies deterministic RNG seeds, card records, and the Lua script resolver.

Scripts are host-owned, because the WebAssembly build has no filesystem. Register sources with
`dln_ocg_set_script`, and the core's `read_script` callback resolves them by the exact name it asks
for (`c15025844.lua` for a card, or whatever a script passes to `Duel.LoadScript`). Shared libraries
such as `constant.lua` and `utility.lua` are not requested automatically; push them in with
`dln_ocg_load_script` after creating the duel.

Every lookup is recorded as `OK`, `FAIL`, or `MISS` and drained through `dln_ocg_take_script_log`, so
a missing script stays distinguishable from one that failed to compile. Lua compile and runtime
errors drain through `dln_ocg_take_engine_log`. Creating a duel makes the core probe `c0.lua` for its
internal temporary card, so one `MISS c0.lua` per duel is expected; register an empty script under
that name to silence it.

Card data and scripts themselves are still the missing layer: the bridge can load them, but nothing
packages them yet.

## Smoke test

`npm run ocgcore:smoke` loads the generated ES module in Node.js, verifies ocgcore API version 11.0, allocates a duel, starts and processes it, and requires a non-empty startup message from `OCG_DuelGetMessage`.

## Native bridge check

`npm run ocgcore:native-check` compiles the pinned core, Lua, and `bridge.cpp` for the host machine
with an ordinary C++ compiler and exercises the bridge directly — no Emscripten required. Use it
after editing `bridge.cpp`: the WebAssembly artifacts under `public/ocgcore` only pick up bridge
changes when the release workflow runs on `main`, so this is the fast way to know a bridge change is
correct. It takes about two minutes and needs `npm run ocgcore:fetch` first.

It checks bridge behaviour rather than the browser bundle; the smoke test still covers the generated
artifacts.

GitHub Actions runs the build and smoke test whenever the package changes and uploads the generated JS/WASM pair as a workflow artifact. The native bridge check runs on every push.
