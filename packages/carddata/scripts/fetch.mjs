/**
 * Checks out the pinned card database and card script revisions beneath `vendor/`.
 *
 * Nothing fetched here is committed. `vendor/` is ignored, exactly like the pinned core
 * source in `packages/ocgcore`, so the repository stays free of third-party card data and
 * scripts while still building reproducibly from named revisions.
 *
 * See README.md for the licensing position on what this downloads.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(packageRoot, "vendor");
const lock = JSON.parse(readFileSync(resolve(packageRoot, "carddata.lock.json"), "utf8"));

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

/**
 * Clones at a pinned commit. `blobs` limits the checkout to specific paths, which matters
 * for the card database: the repository holds many multi-megabyte files and only one is
 * needed.
 */
function checkout(name, { repository, commit }, paths) {
  const target = resolve(vendorRoot, name);
  if (!existsSync(resolve(target, ".git"))) {
    rmSync(target, { recursive: true, force: true });
    git(["clone", "--filter=blob:none", "--no-checkout", repository, target], packageRoot);
  }

  git(["fetch", "--depth=1", "origin", commit], target);
  git(["checkout", "--detach", commit], target);

  if (paths) {
    for (const path of paths) git(["checkout", commit, "--", path], target);
  } else {
    git(["reset", "--hard", commit], target);
  }

  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: target, encoding: "utf8" }).trim();
  if (actual !== commit) {
    throw new Error(`Expected ${name} at ${commit}, checked out ${actual}.`);
  }
  return target;
}

mkdirSync(vendorRoot, { recursive: true });

const databaseRoot = checkout("carddb", lock.cardDatabase, [lock.cardDatabase.file]);
if (!existsSync(resolve(databaseRoot, lock.cardDatabase.file))) {
  throw new Error(`The pinned card database is missing ${lock.cardDatabase.file}.`);
}

const scriptRoot = checkout("cardscripts", lock.cardScripts, null);
for (const required of ["constant.lua", "utility.lua"]) {
  if (!existsSync(resolve(scriptRoot, required))) {
    throw new Error(`The pinned script collection is missing ${required}.`);
  }
}

console.log(`Card database ready at ${lock.cardDatabase.commit}`);
console.log(`Card scripts ready at ${lock.cardScripts.commit}`);
console.log("Both are ignored by git and are never committed. See packages/carddata/README.md.");
