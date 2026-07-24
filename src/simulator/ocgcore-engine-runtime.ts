import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineActionPrompt,
  type EngineCommand,
  type EngineEvent,
  type EnginePromptOption,
  type EngineSnapshot,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from "./engine-protocol.js";
import type { PlaybackFrame, VisualFieldSlot } from "../visualizer.js";

interface OcgcoreModule {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  cwrap(
    name: string,
    returnType: "number" | null,
    argumentTypes: Array<"number">,
  ): (...arguments_: number[]) => number;
}

interface OcgcoreFactoryOptions {
  locateFile(file: string): string;
  onAbort?(reason: unknown): void;
}

type OcgcoreFactory = (options: OcgcoreFactoryOptions) => Promise<OcgcoreModule>;

interface OcgcoreBindings {
  versionMajor(): number;
  versionMinor(): number;
  setCardData(
    code: number,
    alias: number,
    type: number,
    level: number,
    attribute: number,
    raceLow: number,
    raceHigh: number,
    attack: number,
    defense: number,
    leftScale: number,
    rightScale: number,
    linkMarker: number,
  ): number;
  clearCardData(): number;
  create(
    seedLow: number,
    seedHigh: number,
    flagsLow: number,
    flagsHigh: number,
    startingLifePoints: number,
    startingDrawCount: number,
    drawCountPerTurn: number,
  ): number;
  destroy(handle: number): number;
  newCard(
    handle: number,
    team: number,
    duelist: number,
    code: number,
    controller: number,
    location: number,
    sequence: number,
    position: number,
  ): number;
  start(handle: number): number;
  process(handle: number): number;
  getMessage(handle: number, lengthPointer: number): number;
  setResponse(handle: number, responsePointer: number, length: number): number;
  queryCount(handle: number, team: number, location: number): number;
  queryCard(
    handle: number,
    flags: number,
    controller: number,
    location: number,
    sequence: number,
    overlaySequence: number,
    lengthPointer: number,
  ): number;
}

interface OcgcorePacket {
  type: number;
  payload: Uint8Array;
  packetBytes: number;
}

interface SupportedChoice {
  optionId: string;
  response: Uint8Array;
}

interface SupportedPrompt {
  prompt: EngineActionPrompt;
  choices: SupportedChoice[];
}

interface QueriedCard {
  code: number;
  position: number;
  sequence: number;
}

export interface OcgcorePacketSummary {
  totalBytes: number;
  packetBytes: number;
  messageType: number;
  messageName: string;
}

const CARD_CODE = 15025844;
const CARD_NAME = "Mystical Elf";
const CARD_ALIAS = "ELF";

const LOCATION_DECK = 0x01;
const LOCATION_HAND = 0x02;
const LOCATION_MZONE = 0x04;
const POS_FACEUP = 0x05;
const POS_FACEDOWN_DEFENSE = 0x08;
const QUERY_CODE = 0x01;
const QUERY_POSITION = 0x02;

const MSG_SELECT_IDLECMD = 11;
const MSG_SELECT_PLACE = 18;
const MSG_SELECT_POSITION = 19;
const MSG_NEW_TURN = 40;

const MESSAGE_NAMES: Readonly<Record<number, string>> = {
  1: "MSG_RETRY",
  2: "MSG_HINT",
  3: "MSG_WAITING",
  4: "MSG_START",
  5: "MSG_WIN",
  6: "MSG_UPDATE_DATA",
  7: "MSG_UPDATE_CARD",
  8: "MSG_REQUEST_DECK",
  10: "MSG_SELECT_BATTLECMD",
  11: "MSG_SELECT_IDLECMD",
  12: "MSG_SELECT_EFFECTYN",
  13: "MSG_SELECT_YESNO",
  14: "MSG_SELECT_OPTION",
  15: "MSG_SELECT_CARD",
  18: "MSG_SELECT_PLACE",
  19: "MSG_SELECT_POSITION",
  40: "MSG_NEW_TURN",
  41: "MSG_NEW_PHASE",
  50: "MSG_MOVE",
  60: "MSG_SUMMONING",
  61: "MSG_SUMMONED",
  90: "MSG_DRAW",
};

const POSITION_OPTIONS = [
  { value: 0x01, label: "Face-up Attack", detail: "Summon the monster in Attack Position." },
  { value: 0x02, label: "Face-down Attack", detail: "Use face-down Attack Position when the rules allow it." },
  { value: 0x04, label: "Face-up Defense", detail: "Summon the monster in Defense Position." },
  { value: 0x08, label: "Face-down Defense", detail: "Set the monster in Defense Position." },
] as const;

function copySnapshot(snapshot: EngineSnapshot): EngineSnapshot {
  return structuredClone(snapshot);
}

function numberArguments(count: number): Array<"number"> {
  return Array.from({ length: count }, () => "number" as const);
}

function uint32Response(value: number): Uint8Array {
  const response = new Uint8Array(4);
  new DataView(response.buffer).setUint32(0, value >>> 0, true);
  return response;
}

function parsePackets(bytes: Uint8Array): OcgcorePacket[] {
  const packets: OcgcorePacket[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 4 > bytes.byteLength) {
      throw new Error(`Truncated ocgcore packet header at byte ${offset}.`);
    }
    const packetBytes = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    if (packetBytes < 1 || offset + 4 + packetBytes > bytes.byteLength) {
      throw new Error(`Malformed ocgcore packet length ${packetBytes} at byte ${offset}.`);
    }
    const payload = bytes.slice(offset + 4, offset + 4 + packetBytes);
    packets.push({ type: payload[0]!, payload, packetBytes });
    offset += 4 + packetBytes;
  }
  return packets;
}

export function summarizeFirstOcgcorePacket(bytes: Uint8Array): OcgcorePacketSummary {
  const first = parsePackets(bytes)[0];
  if (!first) throw new Error("ocgcore produced an empty message buffer.");
  return {
    totalBytes: bytes.byteLength,
    packetBytes: first.packetBytes,
    messageType: first.type,
    messageName: MESSAGE_NAMES[first.type] ?? `MSG_${first.type}`,
  };
}

function queryUint32(bytes: Uint8Array, wantedFlag: number): number {
  let offset = 0;
  while (offset + 6 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    const segmentLength = view.getUint16(0, true);
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentLength < 4 || segmentEnd > bytes.byteLength) {
      throw new Error(`Malformed ocgcore query segment at byte ${offset}.`);
    }
    const flag = view.getUint32(2, true);
    if (flag === wantedFlag) {
      if (segmentLength < 8) throw new Error(`Query flag ${wantedFlag} has no uint32 payload.`);
      return view.getUint32(6, true);
    }
    if (flag === 0x80000000) break;
    offset = segmentEnd;
  }
  throw new Error(`ocgcore query did not include flag ${wantedFlag}.`);
}

function bindModule(module: OcgcoreModule): OcgcoreBindings {
  return {
    versionMajor: module.cwrap("dln_ocg_version_major", "number", []) as OcgcoreBindings["versionMajor"],
    versionMinor: module.cwrap("dln_ocg_version_minor", "number", []) as OcgcoreBindings["versionMinor"],
    setCardData: module.cwrap("dln_ocg_set_card_data", "number", numberArguments(12)) as OcgcoreBindings["setCardData"],
    clearCardData: module.cwrap("dln_ocg_clear_card_data", null, []) as OcgcoreBindings["clearCardData"],
    create: module.cwrap("dln_ocg_create", "number", numberArguments(7)) as OcgcoreBindings["create"],
    destroy: module.cwrap("dln_ocg_destroy", "number", ["number"]) as OcgcoreBindings["destroy"],
    newCard: module.cwrap("dln_ocg_new_card", "number", numberArguments(8)) as OcgcoreBindings["newCard"],
    start: module.cwrap("dln_ocg_start", "number", ["number"]) as OcgcoreBindings["start"],
    process: module.cwrap("dln_ocg_process", "number", ["number"]) as OcgcoreBindings["process"],
    getMessage: module.cwrap("dln_ocg_get_message", "number", ["number", "number"]) as OcgcoreBindings["getMessage"],
    setResponse: module.cwrap("dln_ocg_set_response", "number", ["number", "number", "number"]) as OcgcoreBindings["setResponse"],
    queryCount: module.cwrap("dln_ocg_query_count", "number", ["number", "number", "number"]) as OcgcoreBindings["queryCount"],
    queryCard: module.cwrap("dln_ocg_query_card", "number", numberArguments(7)) as OcgcoreBindings["queryCard"],
  };
}

export class OcgcoreEngineRuntime {
  private currentSnapshot = copySnapshot(INITIAL_ENGINE_SNAPSHOT);
  private module: OcgcoreModule | null = null;
  private bindings: OcgcoreBindings | null = null;
  private duelHandle = 0;
  private pendingPrompt: SupportedPrompt | null = null;

  snapshot(): EngineSnapshot {
    return copySnapshot(this.currentSnapshot);
  }

  async handle(request: EngineWorkerRequest): Promise<EngineWorkerResponse> {
    const events: EngineEvent[] = [];
    try {
      await this.execute(request.command, events);
      return { requestId: request.requestId, ok: true, snapshot: this.snapshot(), events };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.currentSnapshot = { ...this.currentSnapshot, phase: "error", statusMessage: message, prompt: null };
      events.push(
        { type: "log", level: "error", message: "ocgcore worker failed", detail: message },
        { type: "status", phase: "error", message },
      );
      return { requestId: request.requestId, ok: false, snapshot: this.snapshot(), events, error: message };
    }
  }

  private async execute(command: EngineCommand, events: EngineEvent[]): Promise<void> {
    if (command.type === "initialize") return this.initialize(events);
    if (command.type === "perform-action") return this.performAction(command.promptId, command.optionId, events);
    if (command.type === "process-step") {
      const firstOption = this.pendingPrompt?.prompt.options[0];
      if (!this.pendingPrompt || !firstOption) {
        throw new Error("ocgcore is waiting, but no supported choice is available.");
      }
      return this.performAction(this.pendingPrompt.prompt.id, firstOption.id, events);
    }
    this.reset(events);
  }

  private async initialize(events: EngineEvent[]): Promise<void> {
    this.destroyDuel();
    this.module = null;
    this.bindings = null;
    this.pendingPrompt = null;
    this.currentSnapshot = {
      phase: "starting",
      statusMessage: "Loading real ocgcore…",
      engineVersion: null,
      stepValue: 0,
      board: null,
      prompt: null,
    };
    events.push(
      { type: "status", phase: "starting", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Engine worker started", detail: "Loading the CI-built Project Ignis core from the same origin." },
    );

    const moduleUrl = new URL("/ocgcore/ocgcore.js", globalThis.location.origin).href;
    const wasmUrl = new URL("/ocgcore/ocgcore.wasm", globalThis.location.origin).href;
    const imported = await import(/* @vite-ignore */ moduleUrl) as { default?: OcgcoreFactory };
    if (typeof imported.default !== "function") {
      throw new Error("The published ocgcore module does not expose its Emscripten factory.");
    }

    let abortReason: unknown = null;
    const loadedModule = await imported.default({
      locateFile(file) {
        return file.endsWith(".wasm") ? wasmUrl : new URL(`/ocgcore/${file}`, globalThis.location.origin).href;
      },
      onAbort(reason) {
        abortReason = reason;
      },
    });
    if (abortReason !== null) throw new Error(`ocgcore aborted while loading: ${String(abortReason)}`);

    this.module = loadedModule;
    const bindings = bindModule(loadedModule);
    this.bindings = bindings;
    const major = bindings.versionMajor();
    const minor = bindings.versionMinor();
    if (major !== 11 || minor !== 0) {
      throw new Error(`Unsupported ocgcore API ${major}.${minor}; expected 11.0.`);
    }
    events.push({ type: "log", level: "success", message: "Real ocgcore WASM loaded", detail: `Project Ignis API ${major}.${minor}.` });

    bindings.clearCardData();
    if (bindings.setCardData(CARD_CODE, 0, 0x11, 4, 0x10, 0x02, 0, 800, 2000, 0, 0, 0) !== 1) {
      throw new Error(`Could not register ${CARD_NAME} with the engine card reader.`);
    }

    this.duelHandle = bindings.create(0x12345678, 0x9abcdef0, 0, 0, 8000, 1, 1);
    if (this.duelHandle <= 0) throw new Error("ocgcore could not allocate a duel.");
    events.push({ type: "log", level: "success", message: "Duel allocated", detail: `Engine handle ${this.duelHandle}.` });

    if (bindings.newCard(this.duelHandle, 0, 0, CARD_CODE, 0, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE) !== 1
      || bindings.newCard(this.duelHandle, 1, 0, CARD_CODE, 1, LOCATION_DECK, 0, POS_FACEDOWN_DEFENSE) !== 1) {
      throw new Error("ocgcore could not load the deterministic bootstrap decks.");
    }
    if (bindings.start(this.duelHandle) !== 1) throw new Error("ocgcore rejected the duel start request.");

    const processed = this.processUntilPause();
    if (!processed.packets.some((packet) => packet.type === MSG_NEW_TURN)) {
      throw new Error("ocgcore did not emit MSG_NEW_TURN during startup.");
    }
    this.pendingPrompt = this.findSupportedPrompt(processed.packets);
    if (!this.pendingPrompt) {
      throw new Error("ocgcore reached a prompt, but no supported choice was decoded.");
    }

    const board = this.buildBoard(false);
    const engineVersion = major + minor / 100;
    this.currentSnapshot = {
      phase: "ready",
      statusMessage: this.pendingPrompt.prompt.title,
      engineVersion,
      stepValue: processed.status,
      board,
      prompt: this.pendingPrompt.prompt,
    };
    events.push(
      { type: "log", level: "success", message: "Real opening hand queried", detail: `${CARD_NAME} is in player 0's hand according to ocgcore.` },
      { type: "log", level: "success", message: "Engine choice decoded", detail: this.pendingPrompt.prompt.title },
      { type: "initialized", engineVersion },
      { type: "board-updated", frameKey: board.key },
      { type: "status", phase: "ready", message: this.currentSnapshot.statusMessage },
    );
  }

  private performAction(promptId: string, optionId: string, events: EngineEvent[]): void {
    if (!this.bindings || this.duelHandle <= 0 || !this.pendingPrompt) {
      throw new Error("There is no supported ocgcore choice to resolve.");
    }
    if (this.pendingPrompt.prompt.id !== promptId) {
      throw new Error(`The prompt ${promptId} is no longer active.`);
    }
    const selected = this.pendingPrompt.choices.find((choice) => choice.optionId === optionId);
    const selectedOption = this.pendingPrompt.prompt.options.find((option) => option.id === optionId);
    if (!selected || !selectedOption) {
      throw new Error(`The choice ${optionId} is no longer legal.`);
    }

    const previous = this.currentSnapshot.stepValue;
    const hadFieldCard = this.hasFieldCard();
    const promptTitle = this.pendingPrompt.prompt.title;
    this.writeResponse(selected.response);
    this.pendingPrompt = null;

    const processed = this.processUntilPause();
    const nextPrompt = this.findSupportedPrompt(processed.packets);
    this.pendingPrompt = nextPrompt;
    const hasFieldCard = this.hasFieldCard();
    const board = this.buildBoard(!hadFieldCard && hasFieldCard);
    const statusMessage = nextPrompt?.prompt.title
      ?? (hasFieldCard ? `${CARD_NAME} was Normal Summoned by ocgcore` : "Engine choice resolved");

    this.currentSnapshot = {
      ...this.currentSnapshot,
      phase: "ready",
      statusMessage,
      stepValue: processed.status,
      board,
      prompt: nextPrompt?.prompt ?? null,
    };
    const packetNames = processed.packets.map((packet) => MESSAGE_NAMES[packet.type] ?? `MSG_${packet.type}`);
    events.push(
      { type: "step-result", previous, next: processed.status },
      { type: "log", level: "success", message: selectedOption.label, detail: `Resolved “${promptTitle}” through the real ocgcore response buffer.` },
      { type: "log", level: "success", message: "Core packets processed", detail: packetNames.join(" → ") || "No packets" },
      { type: "board-updated", frameKey: board.key },
      { type: "status", phase: "ready", message: statusMessage },
    );
  }

  private processUntilPause(): { status: number; packets: OcgcorePacket[] } {
    if (!this.bindings || this.duelHandle <= 0) {
      throw new Error("Initialize ocgcore before processing the duel.");
    }
    const packets: OcgcorePacket[] = [];
    let status = 2;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      status = this.bindings.process(this.duelHandle);
      if (![0, 1, 2].includes(status)) throw new Error(`ocgcore returned unknown process status ${status}.`);
      packets.push(...parsePackets(this.readBuffer(this.bindings.getMessage, [this.duelHandle])));
      if (status !== 2) return { status, packets };
    }
    throw new Error("ocgcore did not reach a stable prompt within 64 process calls.");
  }

  private findSupportedPrompt(packets: OcgcorePacket[]): SupportedPrompt | null {
    for (let index = packets.length - 1; index >= 0; index -= 1) {
      const packet = packets[index];
      if (!packet) continue;
      const prompt = packet.type === MSG_SELECT_IDLECMD
        ? this.decodeIdleCommand(packet)
        : packet.type === MSG_SELECT_PLACE
          ? this.decodePlaceChoice(packet)
          : packet.type === MSG_SELECT_POSITION
            ? this.decodePositionChoice(packet)
            : null;
      if (prompt) return prompt;
    }
    return null;
  }

  private decodeIdleCommand(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 16 || payload[1] !== 0) return null;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const summonCount = view.getUint32(2, true);
    if (summonCount < 1) return null;
    const code = view.getUint32(6, true);
    const controller = payload[10]!;
    const location = payload[11]!;
    const sequence = view.getUint32(12, true);
    if (code !== CARD_CODE || controller !== 0 || location !== LOCATION_HAND) return null;

    const optionId = `normal-summon-${code}-${sequence}`;
    return {
      prompt: {
        id: "idle-command-player-0",
        title: "Choose an action",
        detail: `${CARD_NAME} is in your hand. Pick one of the legal actions reported by ocgcore.`,
        kind: "action",
        cardCode: code,
        options: [{ id: optionId, label: `Normal Summon ${CARD_NAME}`, detail: "Begin a real Normal Summon through the engine." }],
      },
      choices: [{ optionId, response: uint32Response(0) }],
    };
  }

  private decodePlaceChoice(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 7) return null;
    const player = payload[1]!;
    const count = payload[2]!;
    if (player !== 0 || count !== 1) return null;
    const unavailable = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(3, true);
    const options: EnginePromptOption[] = [];
    const choices: SupportedChoice[] = [];
    for (let sequence = 0; sequence < 5; sequence += 1) {
      if ((unavailable & (1 << sequence)) !== 0) continue;
      const optionId = `monster-zone-${sequence}`;
      options.push({
        id: optionId,
        label: `M${sequence + 1}`,
        detail: `Place ${CARD_NAME} in Main Monster Zone ${sequence + 1}.`,
      });
      choices.push({
        optionId,
        response: Uint8Array.from([player, LOCATION_MZONE, sequence]),
      });
    }
    if (options.length === 0) return null;
    return {
      prompt: {
        id: "select-place-player-0",
        title: "Choose a monster zone",
        detail: "ocgcore is waiting for the exact zone. The selected zone will be sent back as a three-byte place response.",
        kind: "zone",
        cardCode: CARD_CODE,
        options,
      },
      choices,
    };
  }

  private decodePositionChoice(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 7 || payload[1] !== 0) return null;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const code = view.getUint32(2, true);
    const allowedPositions = payload[6]!;
    const options: EnginePromptOption[] = [];
    const choices: SupportedChoice[] = [];
    for (const position of POSITION_OPTIONS) {
      if ((allowedPositions & position.value) === 0) continue;
      const optionId = `position-${position.value}`;
      options.push({ id: optionId, label: position.label, detail: position.detail });
      choices.push({ optionId, response: uint32Response(position.value) });
    }
    if (options.length === 0) return null;
    return {
      prompt: {
        id: `select-position-${code}`,
        title: "Choose a battle position",
        detail: "Only positions included in ocgcore’s legal-position mask are shown.",
        kind: "position",
        cardCode: code,
        options,
      },
      choices,
    };
  }

  private buildBoard(movedToField: boolean): PlaybackFrame {
    if (!this.bindings || this.duelHandle <= 0) {
      throw new Error("Cannot build a board before duel allocation.");
    }
    const handCard = this.bindings.queryCount(this.duelHandle, 0, LOCATION_HAND) > 0
      ? this.tryQueryCard(LOCATION_HAND, 0)
      : null;
    const fieldCard = this.findFieldCard();
    const fieldSlot = fieldCard ? this.fieldSlotForSequence(fieldCard.sequence) : null;

    const cards: PlaybackFrame["cards"] = [];
    if (handCard?.code === CARD_CODE) {
      cards.push({
        id: "ocgcore-mystical-elf",
        alias: CARD_ALIAS,
        name: CARD_NAME,
        kind: "monster",
        level: 4,
        zone: "H",
        faceUp: true,
      });
    }
    if (fieldCard?.code === CARD_CODE && fieldSlot) {
      cards.push({
        id: "ocgcore-mystical-elf",
        alias: CARD_ALIAS,
        name: CARD_NAME,
        kind: "monster",
        level: 4,
        zone: "F",
        fieldSlot,
        faceUp: (fieldCard.position & POS_FACEUP) !== 0,
      });
    }

    return {
      key: fieldCard ? `ocgcore-after-normal-summon-${fieldCard.sequence}` : "ocgcore-opening-hand",
      stepNumber: fieldCard ? 1 : 0,
      label: fieldCard ? `${CARD_NAME} Normal Summoned` : "Real ocgcore opening hand",
      expression: fieldCard && fieldSlot ? `NS ${CARD_ALIAS}:H>F@${fieldSlot}` : `DRAW ${CARD_ALIAS}:D>H`,
      lp: 8000,
      cards,
      activeAliases: fieldCard ? [CARD_ALIAS] : [],
      movements: movedToField && fieldCard
        ? [{ cardId: "ocgcore-mystical-elf", alias: CARD_ALIAS, from: "H", to: "F" }]
        : [],
    };
  }

  private hasFieldCard(): boolean {
    return Boolean(this.bindings && this.duelHandle > 0 && this.bindings.queryCount(this.duelHandle, 0, LOCATION_MZONE) > 0);
  }

  private findFieldCard(): QueriedCard | null {
    if (!this.bindings || this.duelHandle <= 0 || this.bindings.queryCount(this.duelHandle, 0, LOCATION_MZONE) === 0) {
      return null;
    }
    for (let sequence = 0; sequence < 7; sequence += 1) {
      const card = this.tryQueryCard(LOCATION_MZONE, sequence);
      if (card?.code === CARD_CODE) return card;
    }
    return null;
  }

  private fieldSlotForSequence(sequence: number): VisualFieldSlot | null {
    if (sequence >= 0 && sequence < 5) return `M${sequence + 1}` as VisualFieldSlot;
    if (sequence === 5) return "EMZ1";
    if (sequence === 6) return "EMZ2";
    return null;
  }

  private tryQueryCard(location: number, sequence: number): QueriedCard | null {
    if (!this.bindings || this.duelHandle <= 0) return null;
    const bytes = this.readBuffer(this.bindings.queryCard, [
      this.duelHandle,
      QUERY_CODE | QUERY_POSITION,
      0,
      location,
      sequence,
      0,
    ]);
    if (bytes.byteLength === 0) return null;
    try {
      return {
        code: queryUint32(bytes, QUERY_CODE),
        position: queryUint32(bytes, QUERY_POSITION),
        sequence,
      };
    } catch {
      return null;
    }
  }

  private readBuffer(reader: (...arguments_: number[]) => number, arguments_: number[]): Uint8Array {
    if (!this.module) throw new Error("The ocgcore module is not loaded.");
    const lengthPointer = this.module._malloc(4);
    try {
      this.module.HEAPU32[lengthPointer >>> 2] = 0;
      const pointer = reader(...arguments_, lengthPointer);
      const length = this.module.HEAPU32[lengthPointer >>> 2] ?? 0;
      if (pointer <= 0 || length <= 0) return new Uint8Array();
      return this.module.HEAPU8.slice(pointer, pointer + length);
    } finally {
      this.module._free(lengthPointer);
    }
  }

  private writeResponse(response: Uint8Array): void {
    if (!this.module || !this.bindings || this.duelHandle <= 0) {
      throw new Error("Cannot respond before duel allocation.");
    }
    const pointer = this.module._malloc(response.byteLength);
    try {
      this.module.HEAPU8.set(response, pointer);
      if (this.bindings.setResponse(this.duelHandle, pointer, response.byteLength) !== 1) {
        throw new Error("ocgcore rejected the choice response.");
      }
    } finally {
      this.module._free(pointer);
    }
  }

  private reset(events: EngineEvent[]): void {
    this.destroyDuel();
    this.bindings?.clearCardData();
    this.module = null;
    this.bindings = null;
    this.pendingPrompt = null;
    this.currentSnapshot = {
      phase: "idle",
      statusMessage: "Engine reset",
      engineVersion: null,
      stepValue: 0,
      board: null,
      prompt: null,
    };
    events.push(
      { type: "status", phase: "idle", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Engine reset", detail: "The real duel instance was destroyed and can be initialized again." },
    );
  }

  private destroyDuel(): void {
    if (this.bindings && this.duelHandle > 0) this.bindings.destroy(this.duelHandle);
    this.duelHandle = 0;
  }
}
