import { execFileSync } from "node:child_process";
import { findEmscriptenToolchain } from "./emscripten-toolchain.mjs";

const requirements = [
  ["git", ["--version"]],
  ["cmake", ["--version"]],
  ["em++", ["--version"]],
];

let failed = false;
for (const [command, args] of requirements) {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log(`✓ ${command}: ${output.split("\n")[0]}`);
  } catch {
    failed = true;
    console.error(`✗ ${command} is unavailable`);
  }
}

const toolchain = findEmscriptenToolchain();
if (toolchain) {
  console.log(`✓ Emscripten CMake toolchain: ${toolchain}`);
} else {
  failed = true;
  console.error("✗ Emscripten CMake toolchain is unavailable");
}

if (failed) {
  console.error("\nInstall and activate the Emscripten SDK before building ocgcore.");
  process.exitCode = 1;
}
