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
const LOCATION_MZONE = 0x04;
const POS_FACEDOWN_DEFENSE = 0x08;
const QUERY_CODE = 0x01;
const MSG_SELECT_IDLECMD = 11;
const MSG_SELECT_PLACE = 18;
const MSG_SELECT_POSITION = 19;
const MSG_NEW_TURN = 40;

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

function uint32Bytes(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
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
  const setResponse = module.cwrap("dln_ocg_set_response", "number", ["number", "number", "number"]);
  const queryCount = module.cwrap("dln_ocg_query_count", "number", ["number", "number", "number"]);
  const queryCard = module.cwrap("dln_ocg_query_card", "number", Array(7).fill("number"));
  const queryField = module.cwrap("dln_ocg_query_field", "number", ["number", "number"]);
  const setCardSetcodes = module.cwrap("dln_ocg_set_card_setcodes", "number", Array(3).fill("number"));
  const setScript = module.cwrap("dln_ocg_set_script", "number", Array(4).fill("number"));
  const clearScripts = module.cwrap("dln_ocg_clear_scripts", null, []);
  const scriptCount = module.cwrap("dln_ocg_script_count", "number", []);
  const loadScript = module.cwrap("dln_ocg_load_script", "number", Array(3).fill("number"));
  const takeScriptLog = module.cwrap("dln_ocg_take_script_log", "number", ["number"]);
  const takeEngineLog = module.cwrap("dln_ocg_take_engine_log", "number", ["number"]);

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

  const writeResponse = (bytes) => {
    const pointer = module._malloc(bytes.byteLength);
    try {
      module.HEAPU8.set(bytes, pointer);
      assert.equal(setResponse(handle, pointer, bytes.byteLength), 1, "OCG_DuelSetResponse failed");
    } finally {
      module._free(pointer);
    }
  };

  const processUntilPause = () => {
    const packets = [];
    let status = 2;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      status = processDuel(handle);
      assert.ok([0, 1, 2].includes(status), `Unexpected duel status ${status}`);
      packets.push(...parsePackets(readBuffer(getMessage, handle)));
      if (status !== 2) return { status, packets };
    }
    throw new Error("ocgcore did not pause within 32 process calls");
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
  handle = create(0x12345678, 0x9abcdef0, 0, 0, 8000, 1, 1);
  assert.ok(handle > 0, "OCG_CreateDuel did not return a duel handle");

  announce("loading deterministic decks");
  assert.equal(newCard(handle, 0, 0, CARD_CODE, 0, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE), 1);
  assert.equal(newCard(handle, 1, 0, CARD_CODE, 1, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE), 1);

  announce("starting duel");
  assert.equal(start(handle), 1, "OCG_StartDuel failed");

  announce("processing until the first legal-action prompt");
  const startup = processUntilPause();
  const messageTypes = startup.packets.map((packet) => packet.type);
  const idlePacket = startup.packets.findLast((packet) => packet.type === MSG_SELECT_IDLECMD) ?? null;
  assert.ok(messageTypes.includes(MSG_NEW_TURN), `Missing MSG_NEW_TURN; received ${messageTypes.join(", ")}`);
  assert.equal(startup.status, 1, `Expected ocgcore to await a response, received status ${startup.status}`);
  assert.ok(idlePacket, `Missing MSG_SELECT_IDLECMD; received ${messageTypes.join(", ")}`);

  announce("decoding normal-summon action");
  const idleView = new DataView(idlePacket.payload.buffer, idlePacket.payload.byteOffset, idlePacket.payload.byteLength);
  assert.equal(idlePacket.payload[1], 0, "Expected player 0 to receive the idle prompt");
  assert.equal(idleView.getUint32(2, true), 1, "Expected exactly one normal-summon action");
  assert.equal(idleView.getUint32(6, true), CARD_CODE);
  assert.equal(idlePacket.payload[10], 0);
  assert.equal(idlePacket.payload[11], LOCATION_HAND);
  assert.equal(idleView.getUint32(12, true), 0);

  announce("submitting normal-summon action");
  writeResponse(uint32Bytes(0));

  const choiceTrace = [];
  for (let choiceIndex = 0; choiceIndex < 4 && queryCount(handle, 0, LOCATION_MZONE) === 0; choiceIndex += 1) {
    const result = processUntilPause();
    choiceTrace.push(...result.packets.map((packet) => packet.type));
    if (queryCount(handle, 0, LOCATION_MZONE) > 0) break;

    const prompt = result.packets.findLast((packet) => packet.type === MSG_SELECT_PLACE || packet.type === MSG_SELECT_POSITION);
    assert.ok(prompt, `Expected a place or position prompt; received ${result.packets.map((packet) => packet.type).join(", ")}`);

    if (prompt.type === MSG_SELECT_PLACE) {
      announce("resolving monster-zone choice");
      assert.equal(prompt.payload[1], 0, "Expected player 0 place prompt");
      assert.equal(prompt.payload[2], 1, "Expected one place selection");
      const unavailable = new DataView(prompt.payload.buffer, prompt.payload.byteOffset, prompt.payload.byteLength).getUint32(3, true);
      assert.equal(unavailable & 1, 0, "M1 should be legal on an empty board");
      writeResponse(Uint8Array.from([0, LOCATION_MZONE, 0]));
      continue;
    }

    announce("resolving battle-position choice");
    const allowed = prompt.payload[6];
    const selectedPosition = (allowed & 0x01) !== 0 ? 0x01 : allowed & -allowed;
    assert.ok(selectedPosition > 0, `No legal position in mask ${allowed}`);
    writeResponse(uint32Bytes(selectedPosition));
  }

  announce("verifying the selected card moved");
  assert.equal(queryCount(handle, 0, LOCATION_HAND), 0, "Player 0 hand should be empty after the summon");
  assert.equal(queryCount(handle, 0, LOCATION_MZONE), 1, "Player 0 should have one monster on the field");
  const monsterQuery = readBuffer(queryCard, handle, QUERY_CODE, 0, LOCATION_MZONE, 0, 0);
  assert.equal(readQueryUint32(monsterQuery, QUERY_CODE), CARD_CODE, "M1 query returned the wrong card code");
  const fieldQuery = readBuffer(queryField, handle);
  assert.ok(fieldQuery.byteLength > 0, "Field query returned no data");

  announce("exercising the script resolver");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const withBytes = (values, run) => {
    const pointers = values.map((value) => {
      const bytes = encoder.encode(value);
      const pointer = module._malloc(Math.max(1, bytes.byteLength));
      module.HEAPU8.set(bytes, pointer);
      return { pointer, length: bytes.byteLength };
    });
    try {
      return run(...pointers.flatMap(({ pointer, length }) => [pointer, length]));
    } finally {
      for (const { pointer } of pointers) module._free(pointer);
    }
  };

  // Creating a duel makes the core probe c0.lua for its internal temporary card, so that
// miss is expected and is dropped here rather than being hidden inside the bridge.
  const readLog = (reader) => decoder
    .decode(readBuffer(reader))
    .split("\n")
    .filter(Boolean)
    .filter((entry) => !entry.endsWith(" c0.lua"));

  assert.equal(scriptCount(), 0, "The script registry should start empty");

  // A script that compiles and runs, one that cannot compile, and one never registered:
  // the three outcomes the resolver has to keep distinguishable.
  assert.equal(
    withBytes(["dln-smoke.lua", "local marker = 1 + 1"], (...args) => setScript(...args)),
    1,
    "Could not register a script",
  );
  assert.equal(
    withBytes(["dln-broken.lua", "this is not lua"], (...args) => setScript(...args)),
    1,
    "Could not register the malformed script",
  );
  assert.equal(scriptCount(), 2, "Both scripts should be registered");

  assert.equal(
    withBytes(["dln-smoke.lua"], (pointer, length) => loadScript(handle, pointer, length)),
    1,
    "A valid script should load and run",
  );
  assert.equal(
    withBytes(["dln-broken.lua"], (pointer, length) => loadScript(handle, pointer, length)),
    0,
    "A malformed script must fail rather than appear to load",
  );
  assert.equal(
    withBytes(["dln-absent.lua"], (pointer, length) => loadScript(handle, pointer, length)),
    0,
    "An unregistered script must fail",
  );

  const scriptTrace = readLog(takeScriptLog);
  assert.deepEqual(
    scriptTrace,
    ["OK dln-smoke.lua", "FAIL dln-broken.lua", "MISS dln-absent.lua"],
    `Script log did not distinguish the three outcomes: ${scriptTrace.join(" | ")}`,
  );
  assert.deepEqual(readLog(takeScriptLog), [], "Reading the script log should drain it");

  const engineTrace = readLog(takeEngineLog);
  assert.ok(
    engineTrace.some((entry) => entry.includes("dln-broken.lua")),
    `The Lua error for the malformed script was not surfaced: ${engineTrace.join(" | ")}`,
  );

  announce("registering card set codes");
  assert.equal(setCardSetcodes(CARD_CODE, 0, 0), 1, "Clearing set codes on a known card should succeed");
  const setcodePointer = module._malloc(4);
  try {
    // Only HEAPU8 is exported, so the uint16 values are written a byte at a time.
    module.HEAPU8.set(Uint8Array.from([0x34, 0x12, 0x78, 0x56]), setcodePointer);
    assert.equal(setCardSetcodes(CARD_CODE, setcodePointer, 2), 1, "Could not register set codes");
  } finally {
    module._free(setcodePointer);
  }
  assert.equal(setCardSetcodes(1, 0, 0), 0, "Set codes for an unregistered card must be rejected");

  console.log(JSON.stringify({
    apiVersion: `${versionMajor()}.${versionMinor()}`,
    startupMessageTypes: messageTypes,
    choiceMessageTypes: choiceTrace,
    resolvedAction: "Normal Summon Mystical Elf to M1",
    field: {
      player0HandCount: queryCount(handle, 0, LOCATION_HAND),
      player0MonsterCount: queryCount(handle, 0, LOCATION_MZONE),
      queriedCardCode: readQueryUint32(monsterQuery, QUERY_CODE),
      fieldQueryBytes: fieldQuery.byteLength,
    },
    scriptResolver: {
      registered: scriptCount(),
      outcomes: scriptTrace,
      engineLogEntries: engineTrace.length,
    },
  }, null, 2));

  announce("destroying duel");
  assert.equal(destroy(handle), 1, "OCG_DestroyDuel failed");
  handle = 0;
  clearCardData();
  clearScripts();
  assert.equal(scriptCount(), 0, "Clearing the registry should remove every script");
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

