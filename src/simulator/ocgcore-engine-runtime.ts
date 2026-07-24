import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineCommand,
  type EngineEvent,
  type EngineSnapshot,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from "./engine-protocol.js";

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
  start(handle: number): number;
  process(handle: number): number;
  getMessage(handle: number, lengthPointer: number): number;
  setResponse(handle: number, responsePointer: number, length: number): number;
}

export interface OcgcorePacketSummary {
  totalBytes: number;
  packetBytes: number;
  messageType: number;
  messageName: string;
}

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
};

function copySnapshot(snapshot: EngineSnapshot): EngineSnapshot {
  return structuredClone(snapshot);
}

export function summarizeFirstOcgcorePacket(bytes: Uint8Array): OcgcorePacketSummary {
  if (bytes.byteLength < 5) {
    throw new Error(`Malformed ocgcore message buffer: expected at least 5 bytes, received ${bytes.byteLength}.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packetBytes = view.getUint32(0, true);
  if (packetBytes < 1 || packetBytes + 4 > bytes.byteLength) {
    throw new Error(`Malformed ocgcore packet length ${packetBytes} in ${bytes.byteLength}-byte buffer.`);
  }

  const messageType = bytes[4];
  return {
    totalBytes: bytes.byteLength,
    packetBytes,
    messageType,
    messageName: MESSAGE_NAMES[messageType] ?? `MSG_${messageType}`,
  };
}

function bindModule(module: OcgcoreModule): OcgcoreBindings {
  return {
    versionMajor: module.cwrap("dln_ocg_version_major", "number", []) as OcgcoreBindings["versionMajor"],
    versionMinor: module.cwrap("dln_ocg_version_minor", "number", []) as OcgcoreBindings["versionMinor"],
    create: module.cwrap("dln_ocg_create", "number", ["number", "number", "number", "number", "number", "number", "number"]) as OcgcoreBindings["create"],
    destroy: module.cwrap("dln_ocg_destroy", "number", ["number"]) as OcgcoreBindings["destroy"],
    start: module.cwrap("dln_ocg_start", "number", ["number"]) as OcgcoreBindings["start"],
    process: module.cwrap("dln_ocg_process", "number", ["number"]) as OcgcoreBindings["process"],
    getMessage: module.cwrap("dln_ocg_get_message", "number", ["number", "number"]) as OcgcoreBindings["getMessage"],
    setResponse: module.cwrap("dln_ocg_set_response", "number", ["number", "number", "number"]) as OcgcoreBindings["setResponse"],
  };
}

export class OcgcoreEngineRuntime {
  private currentSnapshot = copySnapshot(INITIAL_ENGINE_SNAPSHOT);
  private module: OcgcoreModule | null = null;
  private bindings: OcgcoreBindings | null = null;
  private duelHandle = 0;

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
      this.currentSnapshot = { ...this.currentSnapshot, phase: "error", statusMessage: message };
      events.push(
        { type: "log", level: "error", message: "ocgcore worker failed", detail: message },
        { type: "status", phase: "error", message },
      );
      return { requestId: request.requestId, ok: false, snapshot: this.snapshot(), events, error: message };
    }
  }

  private async execute(command: EngineCommand, events: EngineEvent[]): Promise<void> {
    if (command.type === "initialize") return this.initialize(events);
    if (command.type === "process-step") return this.processStep(events);
    this.reset(events);
  }

  private async initialize(events: EngineEvent[]): Promise<void> {
    this.destroyDuel();
    this.module = null;
    this.bindings = null;
    this.currentSnapshot = {
      phase: "starting",
      statusMessage: "Loading real ocgcore…",
      engineVersion: null,
      stepValue: 0,
      board: null,
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
    this.module = await imported.default({
      locateFile(file) {
        return file.endsWith(".wasm") ? wasmUrl : new URL(`/ocgcore/${file}`, globalThis.location.origin).href;
      },
      onAbort(reason) {
        abortReason = reason;
      },
    });
    if (abortReason !== null) {
      throw new Error(`ocgcore aborted while loading: ${String(abortReason)}`);
    }

    this.bindings = bindModule(this.module);
    const major = this.bindings.versionMajor();
    const minor = this.bindings.versionMinor();
    if (major !== 11 || minor !== 0) {
      throw new Error(`Unsupported ocgcore API ${major}.${minor}; expected 11.0.`);
    }
    events.push({ type: "log", level: "success", message: "Real ocgcore WASM loaded", detail: `Project Ignis API ${major}.${minor}.` });

    this.duelHandle = this.bindings.create(
      0x12345678,
      0x9abcdef0,
      0,
      0,
      8000,
      0,
      1,
    );
    if (this.duelHandle <= 0) {
      throw new Error("ocgcore could not allocate a duel.");
    }
    events.push({ type: "log", level: "success", message: "Duel allocated", detail: `Engine handle ${this.duelHandle}.` });

    if (this.bindings.start(this.duelHandle) !== 1) {
      throw new Error("ocgcore rejected the duel start request.");
    }

    const processStatus = this.bindings.process(this.duelHandle);
    const packet = this.readMessage();
    const summary = summarizeFirstOcgcorePacket(packet);
    if (summary.messageType !== 4) {
      throw new Error(`Expected MSG_START (4), received ${summary.messageName} (${summary.messageType}).`);
    }

    this.currentSnapshot = {
      phase: "ready",
      statusMessage: "Real ocgcore startup packet received",
      engineVersion: major + minor / 100,
      stepValue: processStatus,
      board: null,
    };
    events.push(
      { type: "log", level: "success", message: "MSG_START received", detail: `${summary.packetBytes}-byte packet inside a ${summary.totalBytes}-byte framed buffer.` },
      { type: "initialized", engineVersion: this.currentSnapshot.engineVersion },
      { type: "status", phase: "ready", message: this.currentSnapshot.statusMessage },
    );
  }

  private processStep(events: EngineEvent[]): void {
    if (!this.bindings || this.duelHandle <= 0) {
      throw new Error("Initialize ocgcore before processing another step.");
    }

    const previous = this.currentSnapshot.stepValue;
    const next = this.bindings.process(this.duelHandle);
    this.currentSnapshot = { ...this.currentSnapshot, stepValue: next };
    events.push(
      { type: "step-result", previous, next },
      { type: "log", level: "success", message: "ocgcore process call completed", detail: `Status ${previous} → ${next}.` },
    );
  }

  private readMessage(): Uint8Array {
    if (!this.module || !this.bindings || this.duelHandle <= 0) {
      throw new Error("Cannot read an ocgcore message before duel allocation.");
    }

    const lengthPointer = this.module._malloc(4);
    try {
      this.module.HEAPU32[lengthPointer >>> 2] = 0;
      const messagePointer = this.bindings.getMessage(this.duelHandle, lengthPointer);
      const messageLength = this.module.HEAPU32[lengthPointer >>> 2];
      if (messagePointer <= 0 || messageLength <= 0) {
        throw new Error("ocgcore produced no startup message.");
      }
      return this.module.HEAPU8.slice(messagePointer, messagePointer + messageLength);
    } finally {
      this.module._free(lengthPointer);
    }
  }

  private reset(events: EngineEvent[]): void {
    this.destroyDuel();
    this.module = null;
    this.bindings = null;
    this.currentSnapshot = {
      phase: "idle",
      statusMessage: "Engine reset",
      engineVersion: null,
      stepValue: 0,
      board: null,
    };
    events.push(
      { type: "status", phase: "idle", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Engine reset", detail: "The real duel instance was destroyed and can be initialized again." },
    );
  }

  private destroyDuel(): void {
    if (this.bindings && this.duelHandle > 0) {
      this.bindings.destroy(this.duelHandle);
    }
    this.duelHandle = 0;
  }
}
