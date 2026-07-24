# @dln/ocgcore

Isolated build package for the real Project Ignis/EDOPro duel engine.

## Commands

```sh
npm --prefix packages/ocgcore run doctor
npm --prefix packages/ocgcore run fetch
npm --prefix packages/ocgcore run build
```

`engine.lock.json` pins the exact upstream core revision. `fetch` checks out that detached commit beneath `vendor/ocgcore`; generated sources and binaries are intentionally ignored.

The build contract is:

```text
packages/ocgcore/dist/ocgcore.js
packages/ocgcore/dist/ocgcore.wasm
```

The browser worker will consume only those two artifacts. Upstream source layout, Emscripten flags, Lua callbacks, card readers, and duel APIs stay private to this package.

## Current checkpoint

The reproducible source/toolchain layer is present. The next commit adds the CMake wrapper and C++ bridge that links the pinned core and exports the minimal browser API (`create`, `start`, `process`, `get_message`, and `set_response`). Until that wrapper lands, `npm run build` intentionally fails with `Missing packages/ocgcore/CMakeLists.txt wrapper` rather than producing a fake smoke binary.
