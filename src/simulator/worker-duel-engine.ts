import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineCommand,
  type EngineEvent,
  type EngineSnapshot,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from "./engine-protocol.js";

export interface EngineWorkerPort {
  onmessage: ((event: { data: EngineWorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: EngineWorkerRequest): void;
  terminate(): void;
}

export type EngineEventListener = (event: EngineEvent) => void;

export interface DuelEngine {
  snapshot(): EngineSnapshot;
  subscribe(listener: EngineEventListener): () => void;
  initialize(): Promise<EngineSnapshot>;
  processStep(state?: number): Promise<EngineSnapshot>;
  performAction(promptId: string, optionId: string): Promise<EngineSnapshot>;
  reset(): Promise<EngineSnapshot>;
  restart(): Promise<EngineSnapshot>;
  destroy(): void;
}

type PendingRequest = {
  resolve: (snapshot: EngineSnapshot) => void;
  reject: (error: Error) => void;
};

function copySnapshot(snapshot: EngineSnapshot): EngineSnapshot {
  return structuredClone(snapshot);
}

export class WorkerDuelEngine implements DuelEngine {
  private readonly worker: EngineWorkerPort;
  private readonly listeners = new Set<EngineEventListener>();
  private readonly pending = new Map<number, PendingRequest>();
  private currentSnapshot = copySnapshot(INITIAL_ENGINE_SNAPSHOT);
  private nextRequestId = 1;
  private destroyed = false;

  constructor(worker: EngineWorkerPort) {
    this.worker = worker;
    this.worker.onmessage = (event) => this.handleResponse(event.data);
    this.worker.onerror = () => this.handleWorkerFailure("The engine worker crashed.");
  }

  snapshot(): EngineSnapshot {
    return copySnapshot(this.currentSnapshot);
  }

  subscribe(listener: EngineEventListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): Promise<EngineSnapshot> {
    this.currentSnapshot = {
      ...this.currentSnapshot,
      phase: "starting",
      statusMessage: "Starting engine worker…",
      engineVersion: null,
      stepValue: 0,
      board: null,
      prompt: null,
    };
    this.emit({ type: "status", phase: "starting", message: this.currentSnapshot.statusMessage });
    return this.dispatch({ type: "initialize" });
  }

  processStep(state = this.currentSnapshot.stepValue): Promise<EngineSnapshot> {
    return this.dispatch({ type: "process-step", state });
  }

  performAction(promptId: string, optionId: string): Promise<EngineSnapshot> {
    return this.dispatch({ type: "perform-action", promptId, optionId });
  }

  reset(): Promise<EngineSnapshot> {
    return this.dispatch({ type: "reset" });
  }

  async restart(): Promise<EngineSnapshot> {
    await this.reset();
    return this.initialize();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.rejectPending(new Error("The duel engine was destroyed."));
    this.listeners.clear();
  }

  private dispatch(command: EngineCommand): Promise<EngineSnapshot> {
    this.assertActive();
    const requestId = this.nextRequestId++;
    return new Promise<EngineSnapshot>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, command });
    });
  }

  private handleResponse(response: EngineWorkerResponse): void {
    if (this.destroyed) return;
    this.currentSnapshot = copySnapshot(response.snapshot);
    for (const event of response.events) this.emit(event);
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(this.snapshot());
    else pending.reject(new Error(response.error));
  }

  private handleWorkerFailure(message: string): void {
    if (this.destroyed) return;
    this.currentSnapshot = { ...this.currentSnapshot, phase: "error", statusMessage: message, prompt: null };
    this.emit({ type: "log", level: "error", message: "Worker runtime error", detail: message });
    this.emit({ type: "status", phase: "error", message });
    this.rejectPending(new Error(message));
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("The duel engine has been destroyed.");
  }
}
