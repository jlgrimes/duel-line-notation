import {
  SIMULATOR_WASM_SMOKE_BYTES,
  type SimulatorWasmSmokeExports,
} from "../../src/simulator-wasm-smoke.js";
import type { EngineWorkerRequest, EngineWorkerResponse } from "./engine-types";

type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
  postMessage: (message: EngineWorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;
let engine: SimulatorWasmSmokeExports | undefined;

function post(message: EngineWorkerResponse): void {
  workerScope.postMessage(message);
}

function log(
  level: "info" | "success" | "error",
  message: string,
  detail?: string,
): void {
  post(detail === undefined
    ? { type: "log", level, message }
    : { type: "log", level, message, detail });
}

async function initialize(): Promise<void> {
  post({ type: "status", phase: "starting", message: "Starting engine worker…" });
  log("info", "Web Worker started", "The simulator engine is isolated from the React render thread.");

  if (typeof WebAssembly === "undefined") {
    throw new Error("This browser does not expose WebAssembly.");
  }

  log("info", "WebAssembly support detected", "Instantiating the bridge smoke module.");
  const result = await WebAssembly.instantiate(SIMULATOR_WASM_SMOKE_BYTES);
  const exports = result.instance.exports as unknown as Partial<SimulatorWasmSmokeExports>;

  if (typeof exports.engine_version !== "function" || typeof exports.process_step !== "function") {
    throw new Error("The WebAssembly module did not expose the expected engine bridge functions.");
  }

  engine = exports as SimulatorWasmSmokeExports;
  const engineVersion = engine.engine_version();

  log(
    "success",
    "WebAssembly bridge ready",
    `ABI smoke version ${engineVersion} loaded from ${SIMULATOR_WASM_SMOKE_BYTES.byteLength} bytes.`,
  );
  log(
    "info",
    "Next engine target",
    "Replace this smoke module with a pinned ocgcore build without changing the screen-facing worker protocol.",
  );
  post({ type: "initialized", engineVersion });
  post({ type: "status", phase: "ready", message: "WASM bridge ready" });
}

function processStep(state: number): void {
  if (!engine) {
    throw new Error("Initialize the engine before processing a step.");
  }

  const next = engine.process_step(state);
  post({ type: "step-result", previous: state, next });
}

function reset(): void {
  engine = undefined;
  post({ type: "status", phase: "idle", message: "Engine reset" });
  log("info", "Engine reset", "The worker remains alive and can initialize a fresh module instance.");
}

workerScope.onmessage = (event) => {
  const request = event.data;

  Promise.resolve()
    .then(() => {
      if (request.type === "initialize") return initialize();
      if (request.type === "process-step") return processStep(request.state);
      return reset();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "Engine worker failed", message);
      post({ type: "error", message });
      post({ type: "status", phase: "error", message: "Engine initialization failed" });
    });
};
