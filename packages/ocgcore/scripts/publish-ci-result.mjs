import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");

const buildExit = Number.parseInt(process.argv[2] ?? "1", 10);
const smokeExit = Number.parseInt(process.argv[3] ?? "1", 10);
const ok = buildExit === 0 && smokeExit === 0;

function logTail(path, maximumCharacters = 16000) {
  if (!existsSync(path)) return "";
  const contents = readFileSync(path, "utf8");
  return contents.length <= maximumCharacters
    ? contents
    : contents.slice(contents.length - maximumCharacters);
}

const status = {
  ok,
  commit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  generatedAt: new Date().toISOString(),
  buildExit,
  smokeExit,
  buildLogTail: logTail("/tmp/ocgcore-build.log"),
  smokeLogTail: logTail("/tmp/ocgcore-smoke.log"),
};

const statusPath = resolve(repositoryRoot, ".github/ocgcore-ci-status.json");
mkdirSync(dirname(statusPath), { recursive: true });
writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);

if (ok) {
  const publicRoot = resolve(repositoryRoot, "public/ocgcore");
  mkdirSync(publicRoot, { recursive: true });
  copyFileSync(resolve(packageRoot, "dist/ocgcore.js"), resolve(publicRoot, "ocgcore.js"));
  copyFileSync(resolve(packageRoot, "dist/ocgcore.wasm"), resolve(publicRoot, "ocgcore.wasm"));
}

console.log(`Published ocgcore CI result: ${ok ? "success" : "failure"}`);
