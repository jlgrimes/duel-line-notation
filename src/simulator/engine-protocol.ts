export type EnginePhase = "idle" | "starting" | "ready" | "error";

export type EngineLogLevel = "info" | "success" | "error";

export interface EngineSnapshot {
  phase: EnginePhase;
  statusMessage: string;
  engineVersion: number | null;
  stepValue: number;
}

export type EngineCommand =
  | { type: "initialize" }
  | { type: "process-step"; state: number }
  | { type: "reset" };

export type EngineEvent =
  | { type: "status"; phase: EnginePhase; message: string }
  | { type: "log"; level: EngineLogLevel; message: string; detail: string | null }
  | { type: "initialized"; engineVersion: number }
  | { type: "step-result"; previous: number; next: number };

export interface EngineWorkerRequest {
  requestId: number;
  command: EngineCommand;
}

export type EngineWorkerResponse =
  | {
      requestId: number;
      ok: true;
      snapshot: EngineSnapshot;
      events: EngineEvent[];
    }
  | {
      requestId: number;
      ok: false;
      snapshot: EngineSnapshot;
      events: EngineEvent[];
      error: string;
    };

export const INITIAL_ENGINE_SNAPSHOT: EngineSnapshot = {
  phase: "idle",
  statusMessage: "Waiting to initialize",
  engineVersion: null,
  stepValue: 0,
};
