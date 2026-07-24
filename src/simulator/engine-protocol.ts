import type { PlaybackFrame } from "../visualizer.js";

export type EnginePhase = "idle" | "starting" | "ready" | "error";

export type EngineLogLevel = "info" | "success" | "error";

export type EnginePromptKind = "action" | "zone" | "position";

export interface EnginePromptOption {
  id: string;
  label: string;
  detail: string | null;
}

export interface EngineActionPrompt {
  id: string;
  title: string;
  detail: string;
  kind: EnginePromptKind;
  cardCode: number | null;
  options: EnginePromptOption[];
}

export interface EngineSnapshot {
  phase: EnginePhase;
  statusMessage: string;
  engineVersion: number | null;
  stepValue: number;
  board: PlaybackFrame | null;
  prompt: EngineActionPrompt | null;
}

export type EngineCommand =
  | { type: "initialize" }
  | { type: "process-step"; state: number }
  | { type: "perform-action"; promptId: string; optionId: string }
  | { type: "reset" };

export type EngineEvent =
  | { type: "status"; phase: EnginePhase; message: string }
  | { type: "log"; level: EngineLogLevel; message: string; detail: string | null }
  | { type: "initialized"; engineVersion: number }
  | { type: "board-updated"; frameKey: string }
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
  board: null,
  prompt: null,
};
