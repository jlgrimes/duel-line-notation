import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "vendor/ocgcore");
const buildRoot = resolve(packageRoot, "build");
const distRoot = resolve(packageRoot, "dist");

function run(command, args, cwd = packageRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

run(process.execPath, [resolve(packageRoot, "scripts/doctor.mjs")]);
run(process.execPath, [resolve(packageRoot, "scripts/fetch-source.mjs")]);

if (!existsSync(resolve(packageRoot, "CMakeLists.txt"))) {
  throw new Error("Missing packages/ocgcore/CMakeLists.txt wrapper.");
}

mkdirSync(buildRoot, { recursive: true });
mkdirSync(distRoot, { recursive: true });

run("emcmake", [
  "cmake",
  "-S", packageRoot,
  "-B", buildRoot,
  "-DCMAKE_BUILD_TYPE=Release",
  `-DOCGCORE_SOURCE_DIR=${sourceRoot}`,
  `-DOCGCORE_DIST_DIR=${distRoot}`,
]);
run("cmake", ["--build", buildRoot, "--config", "Release", "--parallel"]);

for (const artifact of ["ocgcore.js", "ocgcore.wasm"]) {
  if (!existsSync(resolve(distRoot, artifact))) {
    throw new Error(`Build completed without dist/${artifact}.`);
  }
}

console.log("ocgcore WASM artifacts are ready in packages/ocgcore/dist.");
