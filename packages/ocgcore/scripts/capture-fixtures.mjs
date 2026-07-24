/**
 * Captures golden buffers from the real pinned core so the pure decoders in
 * `src/simulator/engine-query.ts` can be tested without WebAssembly.
 *
 * The script drives the same deterministic bootstrap duel the runtime uses, records the
 * raw bytes at each interesting point, and writes them to a TypeScript fixture module.
 * Re-run it after changing the pinned core, the bridge, or the requested query flags:
 *
 *   node packages/ocgcore/scripts/capture-fixtures.mjs
 *
 * It reads the generated artifacts from `packages/ocgcore/dist` when a local build
 * exists and otherwise falls back to the CI-published `public/ocgcore` assets.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const candidates = [resolve(packageRoot, "dist"), resolve(repoRoot, "public", "ocgcore")];
const distRoot = candidates.find((candidate) => existsSync(resolve(candidate, "ocgcore.js")));
if (!distRoot) {
  throw new Error(`No ocgcore.js found in ${candidates.join(" or ")}. Run npm run ocgcore:build first.`);
}

const outputPath = resolve(repoRoot, "test", "fixtures", "ocgcore-golden.ts");

const CARD_CODE = 15025844; // Mystical Elf
const LOCATION_DECK = 0x01;
const LOCATION_HAND = 0x02;
const LOCATION_MZONE = 0x04;
const POS_FACEDOWN_DEFENSE = 0x08;
const MSG_SELECT_PLACE = 18;
const MSG_SELECT_POSITION = 19;

// Mirrors FULL_CARD_QUERY_FLAGS in src/simulator/engine-constants.ts.
const FULL_CARD_QUERY_FLAGS =
  0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x80 | 0x100 | 0x200 | 0x400 | 0x800
  | 0x1000 | 0x10000 | 0x20000 | 0x40000 | 0x80000 | 0x100000 | 0x200000 | 0x400000 | 0x800000;

const { default: createOcgcore } = await import(pathToFileURL(resolve(distRoot, "ocgcore.js")).href);
const module = await createOcgcore({ locateFile: (file) => resolve(distRoot, file) });

const setCardData = module.cwrap("dln_ocg_set_card_data", "number", Array(12).fill("number"));
const clearCardData = module.cwrap("dln_ocg_clear_card_data", null, []);
const create = module.cwrap("dln_ocg_create", "number", Array(7).fill("number"));
const destroy = module.cwrap("dln_ocg_destroy", "number", ["number"]);
const newCard = module.cwrap("dln_ocg_new_card", "number", Array(8).fill("number"));
const start = module.cwrap("dln_ocg_start", "number", ["number"]);
const processDuel = module.cwrap("dln_ocg_process", "number", ["number"]);
const getMessage = module.cwrap("dln_ocg_get_message", "number", ["number", "number"]);
const setResponse = module.cwrap("dln_ocg_set_response", "number", ["number", "number", "number"]);
const queryCard = module.cwrap("dln_ocg_query_card", "number", Array(7).fill("number"));
const queryField = module.cwrap("dln_ocg_query_field", "number", ["number", "number"]);

function readBuffer(reader, ...args) {
  const lengthPointer = module._malloc(4);
  try {
    module.HEAPU32[lengthPointer >>> 2] = 0;
    const pointer = reader(...args, lengthPointer);
    const length = module.HEAPU32[lengthPointer >>> 2];
    if (pointer <= 0 || length <= 0) return new Uint8Array();
    return module.HEAPU8.slice(pointer, pointer + length);
  } finally {
    module._free(lengthPointer);
  }
}

function parsePackets(bytes) {
  const packets = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const packetLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    const payload = bytes.slice(offset + 4, offset + 4 + packetLength);
    packets.push({ type: payload[0], payload });
    offset += 4 + packetLength;
  }
  return packets;
}

clearCardData();
if (setCardData(CARD_CODE, 0, 0x11, 4, 0x10, 0x02, 0, 800, 2000, 0, 0, 0) !== 1) {
  throw new Error("Could not register the bootstrap card.");
}

const handle = create(0x12345678, 0x9abcdef0, 0, 0, 8000, 1, 1);
if (handle <= 0) throw new Error("Could not allocate a duel.");
newCard(handle, 0, 0, CARD_CODE, 0, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE);
newCard(handle, 1, 0, CARD_CODE, 1, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE);
start(handle);

function processUntilPause() {
  const buffers = [];
  let status = 2;
  for (let iteration = 0; iteration < 64 && status === 2; iteration += 1) {
    status = processDuel(handle);
    buffers.push(readBuffer(getMessage, handle));
  }
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const buffer of buffers) {
    combined.set(buffer, offset);
    offset += buffer.byteLength;
  }
  return { status, bytes: combined };
}

function writeResponse(bytes) {
  const pointer = module._malloc(bytes.byteLength);
  try {
    module.HEAPU8.set(bytes, pointer);
    setResponse(handle, pointer, bytes.byteLength);
  } finally {
    module._free(pointer);
  }
}

function uint32Bytes(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

const startup = processUntilPause();
const fixtures = {
  startupMessages: startup.bytes,
  openingHandCard: readBuffer(queryCard, handle, FULL_CARD_QUERY_FLAGS, 0, LOCATION_HAND, 0, 0),
  openingField: readBuffer(queryField, handle),
  emptyMonsterZone: readBuffer(queryCard, handle, FULL_CARD_QUERY_FLAGS, 0, LOCATION_MZONE, 0, 0),
};

// Normal Summon the drawn card and answer every prompt until it reaches the field.
writeResponse(uint32Bytes(0));
for (let attempt = 0; attempt < 4; attempt += 1) {
  const step = processUntilPause();
  const prompt = parsePackets(step.bytes)
    .filter((packet) => packet.type === MSG_SELECT_PLACE || packet.type === MSG_SELECT_POSITION)
    .at(-1);
  if (!prompt) break;
  if (prompt.type === MSG_SELECT_PLACE) {
    fixtures.selectPlacePacket = prompt.payload;
    writeResponse(Uint8Array.from([0, LOCATION_MZONE, 2])); // M3, so the fixture is not sequence 0.
    continue;
  }
  fixtures.selectPositionPacket = prompt.payload;
  const allowed = prompt.payload[6];
  writeResponse(uint32Bytes((allowed & 0x01) !== 0 ? 0x01 : allowed & -allowed));
}

fixtures.summonedMonster = readBuffer(queryCard, handle, FULL_CARD_QUERY_FLAGS, 0, LOCATION_MZONE, 2, 0);
fixtures.summonedField = readBuffer(queryField, handle);

destroy(handle);
clearCardData();

// An empty zone legitimately queries as zero bytes; every other fixture must have content.
const ALLOWED_EMPTY = new Set(["emptyMonsterZone"]);
const missing = Object.entries(fixtures)
  .filter(([name]) => !ALLOWED_EMPTY.has(name))
  .filter(([, bytes]) => !bytes || bytes.byteLength === 0);
if (missing.length > 0) {
  throw new Error(`Captured empty fixtures: ${missing.map(([name]) => name).join(", ")}`);
}

const entries = Object.entries(fixtures)
  .map(([name, bytes]) => `  ${name}: "${Buffer.from(bytes).toString("base64")}",`)
  .join("\n");

const source = `// Generated by packages/ocgcore/scripts/capture-fixtures.mjs. Do not edit by hand.
//
// Golden buffers captured from the pinned Project Ignis core
// (ygopro-core@0764db0c75b3d1d574880d365aa3695ab1f13b43) while running the deterministic
// bootstrap duel: draw Mystical Elf, Normal Summon it, place it in M3.
//
// Re-run the capture script after changing the pinned core, the bridge, or the query flags.

const BASE64_FIXTURES = {
${entries}
} as const;

export type OcgcoreFixtureName = keyof typeof BASE64_FIXTURES;

export function ocgcoreFixture(name: OcgcoreFixtureName): Uint8Array {
  return Uint8Array.from(Buffer.from(BASE64_FIXTURES[name], "base64"));
}

export const OCGCORE_FIXTURE_NAMES = Object.keys(BASE64_FIXTURES) as OcgcoreFixtureName[];
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, source);
console.log(`Wrote ${Object.keys(fixtures).length} golden fixtures to ${outputPath}`);
for (const [name, bytes] of Object.entries(fixtures)) {
  console.log(`  ${name}: ${bytes.byteLength} bytes`);
}
