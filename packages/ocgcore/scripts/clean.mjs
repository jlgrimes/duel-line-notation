import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const directory of ["build", "dist"]) {
  rmSync(resolve(packageRoot, directory), { recursive: true, force: true });
}
console.log("Removed ocgcore build outputs.");
