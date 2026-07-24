import assert from "node:assert/strict";
import test from "node:test";
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from "../src/simulator/engine-protocol.js";
import { SmokeEngineRuntime } from "../src/simulator/smoke-engine-runtime.js";
import {
  WorkerDuelEngine,
  type EngineWorkerPort,
} from "../src/simulator/worker-duel-engine.js";

class LoopbackWorker implements EngineWorkerPort {
  onmessage: ((event: { data: EngineWorkerResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly requests: EngineWorkerRequest[] = [];
  terminated = false;
  private readonly runtime = new SmokeEngineRuntime();

  postMessage(message: EngineWorkerRequest): void {
    this.requests.push(message);
    queueMicrotask(() => {
      void this.runtime.handle(message)
        .then((response) => this.onmessage?.({ data: response }))
        .catch((error: unknown) => this.onerror?.(error));
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

test("typed duel engine initializes and returns defensive snapshots", async () => {
  const worker = new LoopbackWorker();
  const engine = new WorkerDuelEngine(worker);
  const events: string[] = [];
  engine.subscribe((event) => events.push(event.type));

  const snapshot = await engine.initialize();

  assert.equal(snapshot.phase, "ready");
  assert.equal(snapshot.engineVersion, 1);
  assert.equal(snapshot.stepValue, 0);
  assert.deepEqual(worker.requests.map((request) => request.requestId), [1]);
  assert.ok(events.includes("initialized"));
  assert.ok(events.includes("status"));
  assert.ok(events.includes("log"));

  snapshot.stepValue = 999;
  assert.equal(engine.snapshot().stepValue, 0);
  engine.destroy();
  assert.equal(worker.terminated, true);
});

test("typed duel engine correlates commands and supports restart", async () => {
  const worker = new LoopbackWorker();
  const engine = new WorkerDuelEngine(worker);

  await engine.initialize();
  assert.equal((await engine.processStep()).stepValue, 1);
  assert.equal((await engine.processStep()).stepValue, 2);

  const restarted = await engine.restart();
  assert.equal(restarted.phase, "ready");
  assert.equal(restarted.engineVersion, 1);
  assert.equal(restarted.stepValue, 0);
  assert.deepEqual(
    worker.requests.map(({ requestId, command }) => [requestId, command.type]),
    [
      [1, "initialize"],
      [2, "process-step"],
      [3, "process-step"],
      [4, "reset"],
      [5, "initialize"],
    ],
  );

  engine.destroy();
});

test("typed duel engine rejects failed runtime commands and exposes error state", async () => {
  const worker = new LoopbackWorker();
  const engine = new WorkerDuelEngine(worker);
  const logMessages: string[] = [];
  engine.subscribe((event) => {
    if (event.type === "log") logMessages.push(event.message);
  });

  await assert.rejects(engine.processStep(), /Initialize the engine/);
  assert.equal(engine.snapshot().phase, "error");
  assert.ok(logMessages.includes("Engine worker failed"));

  const recovered = await engine.restart();
  assert.equal(recovered.phase, "ready");
  engine.destroy();
});
