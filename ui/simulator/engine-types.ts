export type EnginePhase = "idle" | "starting" | "ready" | "error";

export type EngineLogLevel = "info" | "success" | "error";

export interface EngineLogEntry {
  id: number;
  level: EngineLogLevel;
  message: string;
  detail?: string;
}

export type EngineWorkerRequest =
  | { type: "initialize" }
  | { type: "process-step"; state: number }
  | { type: "reset" };

export type EngineWorkerResponse =
  | { type: "status"; phase: EnginePhase; message: string }
  | { type: "log"; level: EngineLogLevel; message: string; detail?: string }
  | { type: "initialized"; engineVersion: number }
  | { type: "step-result"; previous: number; next: number }
  | { type: "error"; message: string };
