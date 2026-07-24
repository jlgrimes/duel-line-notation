import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const modulePath = resolve(distRoot, "ocgcore.js");
const wasmPath = resolve(distRoot, "ocgcore.wasm");

assert.ok(existsSync(modulePath), `Missing ${modulePath}`);
assert.ok(existsSync(wasmPath), `Missing ${wasmPath}`);

const { default: createOcgcore } = await import(pathToFileURL(modulePath).href);
const module = await createOcgcore({
  locateFile(file) {
    return resolve(distRoot, file);
  },
});

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
const destroy = module.cwrap("dln_ocg_destroy", "number", ["number"]);
const start = module.cwrap("dln_ocg_start", "number", ["number"]);
const processDuel = module.cwrap("dln_ocg_process", "number", ["number"]);
const getMessage = module.cwrap("dln_ocg_get_message", "number", ["number", "number"]);

assert.equal(versionMajor(), 11, "Unexpected ocgcore API major version");
assert.equal(versionMinor(), 0, "Unexpected ocgcore API minor version");

const handle = create(
  0x12345678,
  0x9abcdef0,
  0,
  0,
  8000,
  0,
  1,
);
assert.ok(handle > 0, "OCG_CreateDuel did not return a duel handle");
assert.equal(start(handle), 1, "OCG_StartDuel failed");

const status = processDuel(handle);
assert.ok([0, 1, 2].includes(status), `Unexpected duel status ${status}`);

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
  assert.equal(destroy(handle), 1, "OCG_DestroyDuel failed");
}
