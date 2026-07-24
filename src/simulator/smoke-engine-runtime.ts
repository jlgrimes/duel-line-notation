import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineCommand,
  type EngineEvent,
  type EngineSnapshot,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from "./engine-protocol.js";
import type { PlaybackFrame } from "../visualizer.js";
import {
  SIMULATOR_WASM_SMOKE_BYTES,
  type SimulatorWasmSmokeExports,
} from "../simulator-wasm-smoke.js";

const PURE_MITSURUGI_OPENING: PlaybackFrame = {
  key: "engine-opening-state",
  stepNumber: 0,
  label: "Pure Mitsurugi opening state",
  expression: "Choose a legal action to begin",
  lp: 8000,
  cards: [
    { id: "engine-aramasa", alias: "ARA", name: "Mitsurugi no Miko, Aramasa", kind: "monster", level: 4, zone: "H", faceUp: true },
    { id: "engine-prayers", alias: "PRY", name: "Mitsurugi Prayers", kind: "spell", zone: "H", faceUp: true },
    { id: "engine-habakiri", alias: "HAB", name: "Ame no Habakiri no Mitsurugi", kind: "monster", level: 4, zone: "H", faceUp: true },
    { id: "engine-deck", alias: "DECK", name: "Pure Mitsurugi Deck", kind: "monster", zone: "D", faceUp: false },
    { id: "engine-extra", alias: "EXTRA", name: "Extra Deck", kind: "monster", zone: "X", faceUp: false },
  ],
  activeAliases: [],
  movements: [],
};

function copySnapshot(snapshot: EngineSnapshot): EngineSnapshot {
  return structuredClone(snapshot);
}

export class SmokeEngineRuntime {
  private currentSnapshot = copySnapshot(INITIAL_ENGINE_SNAPSHOT);
  private engine: SimulatorWasmSmokeExports | null = null;

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
        { type: "log", level: "error", message: "Engine worker failed", detail: message },
        { type: "status", phase: "error", message },
      );
      return { requestId: request.requestId, ok: false, snapshot: this.snapshot(), events, error: message };
    }
  }

  private async execute(command: EngineCommand, events: EngineEvent[]): Promise<void> {
    if (command.type === "initialize") return this.initialize(events);
    if (command.type === "process-step") return this.processStep(command.state, events);
    this.reset(events);
  }

  private async initialize(events: EngineEvent[]): Promise<void> {
    this.currentSnapshot = { phase: "starting", statusMessage: "Starting engine worker…", engineVersion: null, stepValue: 0, board: null };
    events.push(
      { type: "status", phase: "starting", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Web Worker started", detail: "The simulator engine is isolated from the React render thread." },
    );

    if (typeof WebAssembly === "undefined") throw new Error("This runtime does not expose WebAssembly.");
    events.push({ type: "log", level: "info", message: "WebAssembly support detected", detail: "Instantiating the bridge smoke module." });

    const result = await WebAssembly.instantiate(SIMULATOR_WASM_SMOKE_BYTES);
    const exports = result.instance.exports as unknown as Partial<SimulatorWasmSmokeExports>;
    if (typeof exports.engine_version !== "function" || typeof exports.process_step !== "function") {
      throw new Error("The WebAssembly module did not expose the expected engine bridge functions.");
    }

    this.engine = exports as SimulatorWasmSmokeExports;
    const engineVersion = this.engine.engine_version();
    this.currentSnapshot = {
      phase: "ready",
      statusMessage: "Engine snapshot ready",
      engineVersion,
      stepValue: 0,
      board: structuredClone(PURE_MITSURUGI_OPENING),
    };
    events.push(
      { type: "log", level: "success", message: "WebAssembly bridge ready", detail: `ABI smoke version ${engineVersion} loaded from ${SIMULATOR_WASM_SMOKE_BYTES.byteLength} bytes.` },
      { type: "log", level: "success", message: "Normalized duel snapshot ready", detail: "The board is now supplied by the engine snapshot instead of simulator UI constants." },
      { type: "initialized", engineVersion },
      { type: "board-updated", frameKey: PURE_MITSURUGI_OPENING.key },
      { type: "status", phase: "ready", message: this.currentSnapshot.statusMessage },
    );
  }

  private processStep(state: number, events: EngineEvent[]): void {
    if (!this.engine) throw new Error("Initialize the engine before processing a step.");
    const next = this.engine.process_step(state);
    this.currentSnapshot = { ...this.currentSnapshot, stepValue: next };
    events.push(
      { type: "step-result", previous: state, next },
      { type: "log", level: "success", message: "WASM process step completed", detail: `State ${state} → ${next}` },
    );
  }

  private reset(events: EngineEvent[]): void {
    this.engine = null;
    this.currentSnapshot = { phase: "idle", statusMessage: "Engine reset", engineVersion: null, stepValue: 0, board: null };
    events.push(
      { type: "status", phase: "idle", message: this.currentSnapshot.statusMessage },
      { type: "log", level: "info", message: "Engine reset", detail: "The worker remains alive and can initialize a fresh module instance." },
    );
  }
}
