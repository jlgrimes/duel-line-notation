import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const modulePath = resolve(distRoot, "ocgcore.js");
const wasmPath = resolve(distRoot, "ocgcore.wasm");

let stage = "checking artifacts";
let handle = 0;
let module;
let destroy;

function announce(nextStage) {
  stage = nextStage;
  console.log(`[ocgcore smoke] ${nextStage}`);
}

function conciseError(error) {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack
    ? error.stack
        .split("\n")
        .filter((line) => !line.includes("/dist/ocgcore.js:1"))
        .slice(0, 6)
        .join("\n")
    : "";
  return `${name}: ${message}${stack ? `\n${stack}` : ""}`;
}

try {
  assert.ok(existsSync(modulePath), `Missing ${modulePath}`);
  assert.ok(existsSync(wasmPath), `Missing ${wasmPath}`);

  announce("importing generated module");
  const { default: createOcgcore } = await import(pathToFileURL(modulePath).href);

  announce("instantiating WebAssembly module");
  module = await createOcgcore({
    locateFile(file) {
      return resolve(distRoot, file);
    },
    onAbort(reason) {
      console.error(`[ocgcore smoke] runtime aborted during ${stage}: ${String(reason)}`);
    },
  });

  announce("binding bridge exports");
  const versionMajor = module.cwrap("dln_ocg_version_major", "number", []);
  const versionMinor = module.cwrap("dln_ocg_version_minor", "number", []);
  const create = module.cwrap("dln_ocg_create", "number", [
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
  ]);
  destroy = module.cwrap("dln_ocg_destroy", "number", ["number"]);
  const start = module.cwrap("dln_ocg_start", "number", ["number"]);
  const processDuel = module.cwrap("dln_ocg_process", "number", ["number"]);
  const getMessage = module.cwrap("dln_ocg_get_message", "number", ["number", "number"]);

  announce("reading ocgcore API version");
  assert.equal(versionMajor(), 11, "Unexpected ocgcore API major version");
  assert.equal(versionMinor(), 0, "Unexpected ocgcore API minor version");

  announce("allocating duel");
  handle = create(
    0x12345678,
    0x9abcdef0,
    0,
    0,
    8000,
    0,
    1,
  );
  assert.ok(handle > 0, "OCG_CreateDuel did not return a duel handle");

  announce("starting duel");
  assert.equal(start(handle), 1, "OCG_StartDuel failed");

  announce("processing startup");
  const status = processDuel(handle);
  assert.ok([0, 1, 2].includes(status), `Unexpected duel status ${status}`);

  announce("reading startup packet");
  const lengthPointer = module._malloc(4);
  try {
    module.HEAPU32[lengthPointer >>> 2] = 0;
    const messagePointer = getMessage(handle, lengthPointer);
    const messageLength = module.HEAPU32[lengthPointer >>> 2];

    assert.ok(messagePointer > 0, "OCG_DuelGetMessage returned a null pointer");
    assert.ok(messageLength > 0, "ocgcore produced no startup packet");

    console.log(JSON.stringify({
      apiVersion: `${versionMajor()}.${versionMinor()}`,
      status,
      messageLength,
      firstMessageByte: module.HEAPU8[messagePointer],
    }, null, 2));
  } finally {
    module._free(lengthPointer);
  }

  announce("destroying duel");
  assert.equal(destroy(handle), 1, "OCG_DestroyDuel failed");
  handle = 0;
  announce("passed");
} catch (error) {
  console.error(`[ocgcore smoke] FAILED during ${stage}`);
  console.error(conciseError(error));
  process.exitCode = 1;
} finally {
  if (handle > 0 && destroy) {
    try {
      destroy(handle);
    } catch {
      // Preserve the original failure; teardown is best-effort in the smoke harness.
    }
  }
}
