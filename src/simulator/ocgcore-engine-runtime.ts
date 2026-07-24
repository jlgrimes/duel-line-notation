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
import {
  FULL_CARD_QUERY_FLAGS,
  LOCATION_DECK,
  LOCATION_EXTRA,
  LOCATION_GRAVE,
  LOCATION_HAND,
  LOCATION_MZONE,
  LOCATION_REMOVED,
  LOCATION_SZONE,
  MSG_NEW_PHASE,
  MSG_NEW_TURN,
  MSG_SELECT_IDLECMD,
  MSG_SELECT_PLACE,
  MSG_SELECT_POSITION,
  PHASE_DRAW,
  POS_FACEDOWN_DEFENSE,
  QUERYABLE_LOCATIONS,
  messageName,
} from "./engine-constants.js";
import {
  decodeCardQuery,
  decodeFieldQuery,
  parsePackets,
  type OcgcorePacket,
  type QueriedField,
} from "./engine-query.js";
import {
  buildBoardFrame,
  buildEngineFieldState,
  diffFieldStates,
  type EngineCardRegistry,
  type EngineFieldState,
  type QueriedCardAtAddress,
} from "./engine-state.js";
import type { PlaybackFrame } from "../visualizer.js";

export { summarizeFirstOcgcorePacket, type OcgcorePacketSummary } from "./engine-query.js";

export interface OcgcoreModule {
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

/**
 * How the runtime obtains an instantiated core. The browser worker uses the default
 * same-origin loader; tests inject a loader that reads the published artifacts from
 * disk, so the class under test is the one that actually ships.
 */
export type OcgcoreModuleLoader = () => Promise<OcgcoreModule>;

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
  queryField(handle: number, lengthPointer: number): number;
}

interface SupportedChoice {
  optionId: string;
  response: Uint8Array;
}

interface SupportedPrompt {
  prompt: EngineActionPrompt;
  choices: SupportedChoice[];
}

const CARD_CODE = 15025844;
const CARD_NAME = "Mystical Elf";
const CARD_ALIAS = "ELF";

/**
 * The only card the simulator currently registers. Section 7 of the checklist replaces
 * this with a real card database and script resolver; until then the board builder reads
 * names from this registry and falls back to engine-derived values for anything else.
 */
const BOOTSTRAP_CARD_REGISTRY: EngineCardRegistry = {
  [CARD_CODE]: { alias: CARD_ALIAS, name: CARD_NAME, kind: "monster", level: 4 },
};

const VIEWER = 0;

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

/** Loads the CI-published core from the origin serving the app. */
async function loadSameOriginModule(): Promise<OcgcoreModule> {
  const moduleUrl = new URL("/ocgcore/ocgcore.js", globalThis.location.origin).href;
  const wasmUrl = new URL("/ocgcore/ocgcore.wasm", globalThis.location.origin).href;
  const imported = await import(/* @vite-ignore */ moduleUrl) as { default?: OcgcoreFactory };
  if (typeof imported.default !== "function") {
    throw new Error("The published ocgcore module does not expose its Emscripten factory.");
  }

  let abortReason: unknown = null;
  const loaded = await imported.default({
    locateFile(file) {
      return file.endsWith(".wasm") ? wasmUrl : new URL(`/ocgcore/${file}`, globalThis.location.origin).href;
    },
    onAbort(reason) {
      abortReason = reason;
    },
  });
  if (abortReason !== null) throw new Error(`ocgcore aborted while loading: ${String(abortReason)}`);
  return loaded;
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
    queryField: module.cwrap("dln_ocg_query_field", "number", ["number", "number"]) as OcgcoreBindings["queryField"],
  };
}

export class OcgcoreEngineRuntime {
  private currentSnapshot = copySnapshot(INITIAL_ENGINE_SNAPSHOT);
  private module: OcgcoreModule | null = null;
  private bindings: OcgcoreBindings | null = null;
  private duelHandle = 0;
  private pendingPrompt: SupportedPrompt | null = null;
  private fieldState: EngineFieldState | null = null;
  private turnPlayer = 0;
  private turnCount = 0;
  private phase = PHASE_DRAW;
  private stepNumber = 0;
  private readonly loadModule: OcgcoreModuleLoader;

  constructor(loadModule: OcgcoreModuleLoader = loadSameOriginModule) {
    this.loadModule = loadModule;
  }

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
    this.fieldState = null;
    this.turnPlayer = 0;
    this.turnCount = 0;
    this.phase = PHASE_DRAW;
    this.stepNumber = 0;
    this.currentSnapshot = {
      phase: "starting",
      statusMessage: "Loading real ocgcore…",
      engineVersion: null,
      stepValue: 0,
      board: null,
      field: null,
      prompt: null,
    };
    events.push(
      { type: "status", phase: "starting", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Engine worker started", detail: "Loading the CI-built Project Ignis core from the same origin." },
    );

    const loadedModule = await this.loadModule();
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

    const { board, state } = this.captureState();
    const engineVersion = major + minor / 100;
    this.currentSnapshot = {
      phase: "ready",
      statusMessage: this.pendingPrompt.prompt.title,
      engineVersion,
      stepValue: processed.status,
      board,
      field: state,
      prompt: this.pendingPrompt.prompt,
    };
    events.push(
      { type: "log", level: "success", message: "Full engine state queried", detail: this.describeState() },
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
    const previousState = this.fieldState;
    const promptTitle = this.pendingPrompt.prompt.title;
    this.writeResponse(selected.response);
    this.pendingPrompt = null;

    const processed = this.processUntilPause();
    const nextPrompt = this.findSupportedPrompt(processed.packets);
    this.pendingPrompt = nextPrompt;

    this.stepNumber += 1;
    const { board, state } = this.captureState();
    const transitions = diffFieldStates(previousState, state);
    const statusMessage = nextPrompt?.prompt.title ?? board.label;

    this.currentSnapshot = {
      ...this.currentSnapshot,
      phase: "ready",
      statusMessage,
      stepValue: processed.status,
      board,
      field: state,
      prompt: nextPrompt?.prompt ?? null,
    };
    events.push(
      { type: "step-result", previous, next: processed.status },
      { type: "log", level: "success", message: selectedOption.label, detail: `Resolved “${promptTitle}” through the real ocgcore response buffer.` },
      { type: "log", level: "success", message: "Core packets processed", detail: processed.packets.map((packet) => messageName(packet.type)).join(" → ") || "No packets" },
      {
        type: "log",
        level: "success",
        message: "State diff observed",
        detail: transitions.length === 0
          ? "No card changed location or position."
          : transitions.map((transition) => `${transition.kind} #${transition.code}`).join(", "),
      },
      { type: "board-updated", frameKey: board.key },
      { type: "status", phase: "ready", message: statusMessage },
    );
  }

  /**
   * Queries everything the engine knows, normalizes it, and projects the viewer's board.
   *
   * The previous state is passed through so card instance ids survive the move and the
   * frame's movements are derived from the observed diff.
   */
  private captureState(): { board: PlaybackFrame; state: EngineFieldState; previous: EngineFieldState | null } {
    const previous = this.fieldState;
    const field = this.queryField();
    const state = buildEngineFieldState({
      field,
      cards: this.queryAllCards(field),
      turnPlayer: this.turnPlayer,
      turnCount: this.turnCount,
      phase: this.phase,
      previous,
    });
    this.fieldState = state;
    const board = buildBoardFrame(state, {
      viewer: VIEWER,
      stepNumber: this.stepNumber,
      registry: BOOTSTRAP_CARD_REGISTRY,
      previous,
    });
    return { board, state, previous };
  }

  private describeState(): string {
    const state = this.fieldState;
    if (!state) return "No state has been queried yet.";
    const player = state.players[VIEWER];
    return `${state.phaseName}, turn ${state.turnCount}. `
      + `LP ${player.lp} · deck ${player.deckCount} · hand ${player.handCount} · GY ${player.graveCount}. `
      + `${state.cards.length} card${state.cards.length === 1 ? "" : "s"} located across both players.`;
  }

  /**
   * Walks every player, every queryable location, and every sequence within it.
   *
   * Zone-shaped locations are sparse, so their occupancy comes from the field query and
   * only the occupied sequences are queried. List-shaped locations are dense, so their
   * count is enough. Xyz materials are queried underneath the monster holding them.
   */
  private queryAllCards(field: QueriedField): QueriedCardAtAddress[] {
    const entries: QueriedCardAtAddress[] = [];
    field.players.forEach((player, controller) => {
      for (const location of QUERYABLE_LOCATIONS) {
        for (const sequence of this.sequencesFor(player, location)) {
          const card = this.queryCardAt(controller, location, sequence, 0);
          if (!card) continue;
          entries.push({ card, address: { controller, location, sequence, overlaySequence: null } });

          if (location !== LOCATION_MZONE) continue;
          const overlayCount = player.monsterZones[sequence]?.overlayCount ?? 0;
          for (let overlaySequence = 0; overlaySequence < overlayCount; overlaySequence += 1) {
            const material = this.queryCardAt(controller, location, sequence, overlaySequence);
            if (!material) continue;
            entries.push({ card: material, address: { controller, location, sequence, overlaySequence } });
          }
        }
      }
    });
    return entries;
  }

  private sequencesFor(player: QueriedField["players"][number], location: number): number[] {
    if (location === LOCATION_MZONE) {
      return player.monsterZones.flatMap((slot, sequence) => (slot.occupied ? [sequence] : []));
    }
    if (location === LOCATION_SZONE) {
      return player.spellZones.flatMap((slot, sequence) => (slot.occupied ? [sequence] : []));
    }
    const counts: Readonly<Record<number, number>> = {
      [LOCATION_DECK]: player.deckCount,
      [LOCATION_HAND]: player.handCount,
      [LOCATION_GRAVE]: player.graveCount,
      [LOCATION_REMOVED]: player.banishedCount,
      [LOCATION_EXTRA]: player.extraCount,
    };
    return Array.from({ length: counts[location] ?? 0 }, (_, sequence) => sequence);
  }

  private queryCardAt(controller: number, location: number, sequence: number, overlaySequence: number) {
    if (!this.bindings || this.duelHandle <= 0) throw new Error("Cannot query cards before duel allocation.");
    const bytes = this.readBuffer(this.bindings.queryCard, [
      this.duelHandle,
      FULL_CARD_QUERY_FLAGS,
      controller,
      location,
      sequence,
      overlaySequence,
    ]);
    return decodeCardQuery(bytes);
  }

  private queryField(): QueriedField {
    if (!this.bindings || this.duelHandle <= 0) throw new Error("Cannot query the field before duel allocation.");
    return decodeFieldQuery(this.readBuffer(this.bindings.queryField, [this.duelHandle]));
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
      if (status !== 2) break;
      if (iteration === 63) throw new Error("ocgcore did not reach a stable prompt within 64 process calls.");
    }
    this.trackTurnAndPhase(packets);
    return { status, packets };
  }

  /**
   * Turn and phase are not part of any query, so they are read from the packet stream:
   * `MSG_NEW_TURN` carries the turn player as one byte, `MSG_NEW_PHASE` the phase as two.
   */
  private trackTurnAndPhase(packets: OcgcorePacket[]): void {
    for (const packet of packets) {
      if (packet.type === MSG_NEW_TURN && packet.payload.byteLength >= 2) {
        this.turnPlayer = packet.payload[1]!;
        this.turnCount += 1;
        continue;
      }
      if (packet.type === MSG_NEW_PHASE && packet.payload.byteLength >= 3) {
        this.phase = new DataView(packet.payload.buffer, packet.payload.byteOffset, packet.payload.byteLength)
          .getUint16(1, true);
      }
    }
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

  /** The display name for a code, using the registry when it knows one. */
  private nameFor(code: number): string {
    return BOOTSTRAP_CARD_REGISTRY[code]?.name ?? `Card #${code}`;
  }

  private decodeIdleCommand(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 16 || payload[1] !== VIEWER) return null;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const summonCount = view.getUint32(2, true);
    if (summonCount < 1) return null;
    const code = view.getUint32(6, true);
    const controller = payload[10]!;
    const location = payload[11]!;
    const sequence = view.getUint32(12, true);
    if (controller !== VIEWER || location !== LOCATION_HAND) return null;

    const optionId = `normal-summon-${code}-${sequence}`;
    const name = this.nameFor(code);
    return {
      prompt: {
        id: "idle-command-player-0",
        title: "Choose an action",
        detail: `${name} is in your hand. Pick one of the legal actions reported by ocgcore.`,
        kind: "action",
        cardCode: code,
        options: [{ id: optionId, label: `Normal Summon ${name}`, detail: "Begin a real Normal Summon through the engine." }],
      },
      choices: [{ optionId, response: uint32Response(0) }],
    };
  }

  private decodePlaceChoice(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 7) return null;
    const player = payload[1]!;
    const count = payload[2]!;
    if (player !== VIEWER || count !== 1) return null;
    const unavailable = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(3, true);
    const options: EnginePromptOption[] = [];
    const choices: SupportedChoice[] = [];
    for (let sequence = 0; sequence < 5; sequence += 1) {
      if ((unavailable & (1 << sequence)) !== 0) continue;
      const optionId = `monster-zone-${sequence}`;
      options.push({
        id: optionId,
        label: `M${sequence + 1}`,
        detail: `Place the card in Main Monster Zone ${sequence + 1}.`,
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
        cardCode: null,
        options,
      },
      choices,
    };
  }

  private decodePositionChoice(packet: OcgcorePacket): SupportedPrompt | null {
    const payload = packet.payload;
    if (payload.byteLength < 7 || payload[1] !== VIEWER) return null;
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
    this.fieldState = null;
    this.turnCount = 0;
    this.stepNumber = 0;
    this.currentSnapshot = {
      phase: "idle",
      statusMessage: "Engine reset",
      engineVersion: null,
      stepValue: 0,
      board: null,
      field: null,
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

/** Exported so tests and future deck loaders can reuse the same card identities. */
export { BOOTSTRAP_CARD_REGISTRY };
