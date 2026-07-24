import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const modulePath = resolve(distRoot, "ocgcore.js");
const wasmPath = resolve(distRoot, "ocgcore.wasm");

const CARD_CODE = 15025844; // Mystical Elf
const LOCATION_DECK = 0x01;
const LOCATION_HAND = 0x02;
const POS_FACEDOWN_DEFENSE = 0x08;
const QUERY_CODE = 0x01;
const MSG_NEW_TURN = 40;
const MSG_SELECT_IDLECMD = 11;

let stage = "checking artifacts";
let handle = 0;
let module;
let destroy;
let clearCardData;

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
        .slice(0, 8)
        .join("\n")
    : "";
  return `${name}: ${message}${stack ? `\n${stack}` : ""}`;
}

function parsePackets(bytes) {
  const packets = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    assert.ok(offset + 4 <= bytes.byteLength, `Truncated packet header at ${offset}`);
    const packetLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    assert.ok(packetLength >= 1, `Invalid packet length ${packetLength}`);
    const packetEnd = offset + 4 + packetLength;
    assert.ok(packetEnd <= bytes.byteLength, `Packet ending at ${packetEnd} exceeds buffer length ${bytes.byteLength}`);
    const payload = bytes.slice(offset + 4, packetEnd);
    packets.push({ type: payload[0], payload, packetLength });
    offset = packetEnd;
  }
  return packets;
}

function readQueryUint32(bytes, wantedFlag) {
  let offset = 0;
  while (offset + 6 <= bytes.byteLength) {
    const segmentLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
    const segmentEnd = offset + 2 + segmentLength;
    assert.ok(segmentLength >= 4 && segmentEnd <= bytes.byteLength, `Malformed query segment at ${offset}`);
    const flag = new DataView(bytes.buffer, bytes.byteOffset + offset + 2, 4).getUint32(0, true);
    if (flag === wantedFlag) {
      assert.ok(segmentLength >= 8, `Query flag ${wantedFlag} has no uint32 payload`);
      return new DataView(bytes.buffer, bytes.byteOffset + offset + 6, 4).getUint32(0, true);
    }
    if (flag === 0x80000000) break;
    offset = segmentEnd;
  }
  throw new Error(`Query flag ${wantedFlag} was not present`);
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
  const setCardData = module.cwrap("dln_ocg_set_card_data", "number", Array(12).fill("number"));
  clearCardData = module.cwrap("dln_ocg_clear_card_data", null, []);
  const create = module.cwrap("dln_ocg_create", "number", Array(7).fill("number"));
  destroy = module.cwrap("dln_ocg_destroy", "number", ["number"]);
  const newCard = module.cwrap("dln_ocg_new_card", "number", Array(8).fill("number"));
  const start = module.cwrap("dln_ocg_start", "number", ["number"]);
  const processDuel = module.cwrap("dln_ocg_process", "number", ["number"]);
  const getMessage = module.cwrap("dln_ocg_get_message", "number", ["number", "number"]);
  const queryCount = module.cwrap("dln_ocg_query_count", "number", ["number", "number", "number"]);
  const queryCard = module.cwrap("dln_ocg_query_card", "number", Array(7).fill("number"));
  const queryField = module.cwrap("dln_ocg_query_field", "number", ["number", "number"]);

  const readBuffer = (reader, ...arguments_) => {
    const lengthPointer = module._malloc(4);
    try {
      module.HEAPU32[lengthPointer >>> 2] = 0;
      const pointer = reader(...arguments_, lengthPointer);
      const length = module.HEAPU32[lengthPointer >>> 2];
      if (pointer <= 0 || length <= 0) return new Uint8Array();
      return module.HEAPU8.slice(pointer, pointer + length);
    } finally {
      module._free(lengthPointer);
    }
  };

  announce("reading ocgcore API version");
  assert.equal(versionMajor(), 11, "Unexpected ocgcore API major version");
  assert.equal(versionMinor(), 0, "Unexpected ocgcore API minor version");

  announce("registering Mystical Elf card data");
  assert.equal(setCardData(
    CARD_CODE,
    0,
    0x11,
    4,
    0x10,
    0x02,
    0,
    800,
    2000,
    0,
    0,
    0,
  ), 1, "Could not register card data");

  announce("allocating duel");
  handle = create(
    0x12345678,
    0x9abcdef0,
    0,
    0,
    8000,
    1,
    1,
  );
  assert.ok(handle > 0, "OCG_CreateDuel did not return a duel handle");

  announce("loading deterministic decks");
  assert.equal(newCard(handle, 0, 0, CARD_CODE, 0, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE), 1);
  assert.equal(newCard(handle, 1, 0, CARD_CODE, 1, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE), 1);

  announce("starting duel");
  assert.equal(start(handle), 1, "OCG_StartDuel failed");

  announce("processing until the first legal-action prompt");
  let status = 2;
  let idlePacket = null;
  const messageTypes = [];
  for (let iteration = 0; iteration < 32; iteration += 1) {
    status = processDuel(handle);
    assert.ok([0, 1, 2].includes(status), `Unexpected duel status ${status}`);
    const messageBytes = readBuffer(getMessage, handle);
    for (const packet of parsePackets(messageBytes)) {
      messageTypes.push(packet.type);
      if (packet.type === MSG_SELECT_IDLECMD) idlePacket = packet;
    }
    if (status !== 2) break;
  }

  assert.ok(messageTypes.includes(MSG_NEW_TURN), `Missing MSG_NEW_TURN; received ${messageTypes.join(", ")}`);
  assert.equal(status, 1, `Expected ocgcore to await a response, received status ${status}`);
  assert.ok(idlePacket, `Missing MSG_SELECT_IDLECMD; received ${messageTypes.join(", ")}`);

  announce("decoding normal-summon action");
  const idleView = new DataView(idlePacket.payload.buffer, idlePacket.payload.byteOffset, idlePacket.payload.byteLength);
  assert.equal(idlePacket.payload[0], MSG_SELECT_IDLECMD);
  assert.equal(idlePacket.payload[1], 0, "Expected player 0 to receive the idle prompt");
  const summonCount = idleView.getUint32(2, true);
  assert.equal(summonCount, 1, "Expected exactly one normal-summon action");
  const summonCode = idleView.getUint32(6, true);
  const summonController = idlePacket.payload[10];
  const summonLocation = idlePacket.payload[11];
  const summonSequence = idleView.getUint32(12, true);
  assert.equal(summonCode, CARD_CODE);
  assert.equal(summonController, 0);
  assert.equal(summonLocation, LOCATION_HAND);
  assert.equal(summonSequence, 0);

  announce("querying real field state");
  assert.equal(queryCount(handle, 0, LOCATION_HAND), 1, "Player 0 should have one card in hand");
  const cardQuery = readBuffer(queryCard, handle, QUERY_CODE, 0, LOCATION_HAND, 0, 0);
  assert.equal(readQueryUint32(cardQuery, QUERY_CODE), CARD_CODE, "Hand query returned the wrong card code");
  const fieldQuery = readBuffer(queryField, handle);
  assert.ok(fieldQuery.byteLength > 0, "Field query returned no data");

  console.log(JSON.stringify({
    apiVersion: `${versionMajor()}.${versionMinor()}`,
    status,
    messageTypes,
    legalAction: {
      kind: "normal-summon",
      code: summonCode,
      controller: summonController,
      location: summonLocation,
      sequence: summonSequence,
      responseValue: 0,
    },
    field: {
      player0HandCount: queryCount(handle, 0, LOCATION_HAND),
      queriedCardCode: readQueryUint32(cardQuery, QUERY_CODE),
      fieldQueryBytes: fieldQuery.byteLength,
    },
  }, null, 2));

  announce("destroying duel");
  assert.equal(destroy(handle), 1, "OCG_DestroyDuel failed");
  handle = 0;
  clearCardData();
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
  if (clearCardData) {
    try {
      clearCardData();
    } catch {
      // Preserve the original failure.
    }
  }
}
