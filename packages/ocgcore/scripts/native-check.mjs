/**
 * Builds the pinned core, Lua, and `bridge.cpp` for the host machine and runs
 * `native-check.cpp` against them.
 *
 * The WebAssembly build needs Emscripten, which many environments do not have, and the
 * published `ocgcore.wasm` only picks up bridge changes after the release workflow runs on
 * `main`. This gives the bridge a fast, local verification path with nothing but a C++
 * compiler: run it after editing `bridge.cpp` instead of waiting for a WebAssembly build.
 *
 *   npm run ocgcore:native-check
 *
 * It checks bridge behaviour, not the browser bundle. `npm run ocgcore:smoke` still covers
 * the generated WebAssembly artifacts.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "vendor", "ocgcore");
const buildRoot = resolve(packageRoot, "build", "native");
const binary = resolve(buildRoot, "native-check");

// Matches the exclusion list in CMakeLists.txt: standalone interpreters and libraries the
// core does not link.
const EXCLUDED_LUA = /\/(lbitlib|lcorolib|ldblib|linit|loadlib|loslib|ltests|lua|luac|lutf8lib|onelua)\.c$/;

if (!existsSync(resolve(sourceRoot, "ocgapi.h"))) {
  throw new Error("The pinned ocgcore checkout is missing. Run npm run ocgcore:fetch first.");
}
if (!existsSync(resolve(sourceRoot, "lua", "src", "lua.h"))) {
  throw new Error("The pinned Lua submodule is missing. Run npm run ocgcore:fetch first.");
}

function findCompiler() {
  for (const candidate of [process.env.CXX, "g++", "clang++"].filter(Boolean)) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No C++ compiler found. Set CXX, or install g++ or clang++.");
}

function sourcesIn(directory, extension) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .map((name) => resolve(directory, name));
}

const compiler = findCompiler();
const luaSources = sourcesIn(resolve(sourceRoot, "lua", "src"), ".c")
  .filter((path) => !EXCLUDED_LUA.test(path));
const coreSources = sourcesIn(sourceRoot, ".cpp");

mkdirSync(buildRoot, { recursive: true });

const args = [
  "-std=c++17",
  "-O0",
  "-w",
  // The core relies on Lua errors unwinding C++ frames, exactly as the WebAssembly build does.
  "-fexceptions",
  "-I", sourceRoot,
  "-I", resolve(sourceRoot, "lua"),
  "-I", resolve(sourceRoot, "lua", "src"),
  // Lua is C but is compiled as C++ here, matching the CMake build.
  "-x", "c++", ...luaSources,
  "-include", resolve(sourceRoot, "lua", "luaconf-customize.h"),
  "-x", "c++", ...coreSources,
  resolve(packageRoot, "bridge.cpp"),
  resolve(packageRoot, "native-check.cpp"),
  "-o", binary,
];

console.log(`[native-check] compiling ${luaSources.length + coreSources.length + 2} files with ${compiler}`);
const started = Date.now();
execFileSync(compiler, args, { stdio: "inherit" });
console.log(`[native-check] built in ${((Date.now() - started) / 1000).toFixed(1)}s`);

execFileSync(binary, [], { stdio: "inherit" });
