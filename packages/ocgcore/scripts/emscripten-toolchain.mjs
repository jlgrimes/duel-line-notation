import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function compilerDirectory() {
  try {
    const command = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(command, ["em++"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const compiler = output.split(/\r?\n/, 1)[0];
    return compiler ? dirname(compiler) : null;
  } catch {
    return null;
  }
}

export function findEmscriptenToolchain() {
  const candidates = [];

  if (process.env.EMSDK) {
    candidates.push(resolve(process.env.EMSDK, "upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"));
  }

  if (process.env.EMSCRIPTEN) {
    candidates.push(resolve(process.env.EMSCRIPTEN, "cmake/Modules/Platform/Emscripten.cmake"));
  }

  const compilerRoot = compilerDirectory();
  if (compilerRoot) {
    candidates.push(resolve(compilerRoot, "cmake/Modules/Platform/Emscripten.cmake"));
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
