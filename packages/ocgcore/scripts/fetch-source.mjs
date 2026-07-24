import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(packageRoot, "vendor");
const sourceRoot = resolve(vendorRoot, "ocgcore");
const lock = JSON.parse(readFileSync(resolve(packageRoot, "engine.lock.json"), "utf8"));

function git(args, cwd = packageRoot) {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

mkdirSync(vendorRoot, { recursive: true });

if (!existsSync(resolve(sourceRoot, ".git"))) {
  rmSync(sourceRoot, { recursive: true, force: true });
  git(["clone", "--filter=blob:none", "--no-checkout", lock.repository, sourceRoot]);
}

git(["fetch", "--depth=1", "origin", lock.commit], sourceRoot);
git(["checkout", "--detach", lock.commit], sourceRoot);
git(["reset", "--hard", lock.commit], sourceRoot);
git(["submodule", "sync", "--recursive"], sourceRoot);
git(["submodule", "update", "--init", "--recursive", "--depth=1"], sourceRoot);

const actual = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();

if (actual !== lock.commit) {
  throw new Error(`Expected ocgcore ${lock.commit}, checked out ${actual}.`);
}

if (!existsSync(resolve(sourceRoot, "lua/src/lua.h"))) {
  throw new Error("ocgcore's pinned Lua submodule was not initialized.");
}

console.log(`ocgcore source and submodules ready at ${actual}`);
