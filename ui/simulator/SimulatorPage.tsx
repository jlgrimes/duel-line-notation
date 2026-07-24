import { useEffect, useRef, useState } from "react";
import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineEvent,
  type EngineLogLevel,
  type EngineSnapshot,
} from "../../src/simulator/engine-protocol.js";
import {
  WorkerDuelEngine,
  type DuelEngine,
  type EngineWorkerPort,
} from "../../src/simulator/worker-duel-engine.js";
import { SimulatorBoardPreview } from "./SimulatorBoardPreview";
import "./simulator.css";

interface DisplayLogEntry {
  id: number;
  level: EngineLogLevel;
  message: string;
  detail?: string;
}

const INITIAL_LOG: DisplayLogEntry = {
  id: 1,
  level: "info",
  message: "Simulator route mounted",
  detail: "Preparing the real Project Ignis duel engine in an isolated worker.",
};

const PROCESS_STATUS_NAMES = ["End", "Awaiting response", "Continue"] as const;

export function SimulatorPage() {
  const engineRef = useRef<DuelEngine | null>(null);
  const nextLogId = useRef(2);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => structuredClone(INITIAL_ENGINE_SNAPSHOT));
  const [entries, setEntries] = useState<DisplayLogEntry[]>([INITIAL_LOG]);
  const [requestPending, setRequestPending] = useState(false);

  function appendLog(entry: Omit<DisplayLogEntry, "id">): void {
    const id = nextLogId.current++;
    setEntries((current) => [...current, { ...entry, id }]);
  }

  function applyEvent(event: EngineEvent, engine: DuelEngine): void {
    setSnapshot(engine.snapshot());
    if (event.type !== "log") return;
    appendLog(event.detail === null
      ? { level: event.level, message: event.message }
      : { level: event.level, message: event.message, detail: event.detail });
  }

  async function runRequest(request: (engine: DuelEngine) => Promise<EngineSnapshot>): Promise<void> {
    const engine = engineRef.current;
    if (!engine || requestPending) return;
    setRequestPending(true);
    try {
      setSnapshot(await request(engine));
    } catch (error: unknown) {
      setSnapshot(engine.snapshot());
      appendLog({
        level: "error",
        message: "Engine request failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRequestPending(false);
    }
  }

  useEffect(() => {
    const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), { type: "module" });
    const engine = new WorkerDuelEngine(worker as unknown as EngineWorkerPort);
    engineRef.current = engine;
    const unsubscribe = engine.subscribe((event) => applyEvent(event, engine));
    void engine.initialize()
      .then(setSnapshot)
      .catch((error: unknown) => {
        setSnapshot(engine.snapshot());
        appendLog({
          level: "error",
          message: "Engine initialization failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      unsubscribe();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const ready = snapshot.phase === "ready";
  const processStatus = PROCESS_STATUS_NAMES[snapshot.stepValue] ?? `Unknown (${snapshot.stepValue})`;

  return (
    <section className="simulator-page">
      <header className="simulator-hero">
        <div>
          <p className="eyebrow">Project Ignis ocgcore · live WebAssembly worker</p>
          <h1>Simulator</h1>
          <p>
            The simulator now loads the pinned, CI-built duel engine instead of the tiny smoke module. React still sees
            only immutable snapshots and typed events; the native core remains isolated behind the worker boundary.
          </p>
        </div>
        <div className={`simulator-status simulator-status-${snapshot.phase}`}>
          <span aria-hidden="true" />
          <div><small>Engine status</small><strong>{snapshot.statusMessage}</strong></div>
        </div>
      </header>

      <div className="simulator-grid">
        <section className="simulator-panel" aria-labelledby="engine-bridge-title">
          <div className="simulator-panel-heading">
            <div><p>Milestone 05</p><h2 id="engine-bridge-title">Real ocgcore boot</h2></div>
            <span>{ready ? "Ready" : snapshot.phase}</span>
          </div>
          <dl className="engine-facts">
            <div><dt>Duel scope</dt><dd>Empty bootstrap duel</dd></div>
            <div><dt>Execution</dt><dd>Web Worker + real WASM</dd></div>
            <div><dt>Adapter</dt><dd>Typed snapshots + events</dd></div>
            <div><dt>Board source</dt><dd>{snapshot.board ? "Decoded core state" : "Packet decoder pending"}</dd></div>
            <div><dt>Core API</dt><dd>{snapshot.engineVersion === null ? "Not loaded" : snapshot.engineVersion.toFixed(1)}</dd></div>
            <div><dt>Process status</dt><dd>{ready ? processStatus : "Waiting"}</dd></div>
          </dl>
          <div className="simulator-actions">
            <button type="button" onClick={() => void runRequest((engine) => engine.restart())} disabled={requestPending || snapshot.phase === "starting"}>
              {snapshot.phase === "starting" ? "Initializing…" : "Restart engine"}
            </button>
            <button type="button" className="secondary" disabled={!ready || requestPending} onClick={() => void runRequest((engine) => engine.processStep())}>
              {requestPending ? "Processing…" : "Process next core step"}
            </button>
          </div>
          <div className="simulator-note">
            <strong>Honest scope:</strong> this is the real duel engine and its real first framed packet. The bootstrap duel
            intentionally contains no cards yet, so the next vertical slice is loading card data and scripts, then decoding
            core queries into the board snapshot.
          </div>
        </section>

        <section className="simulator-panel simulator-log-panel" aria-labelledby="engine-log-title">
          <div className="simulator-panel-heading">
            <div><p>On-screen output</p><h2 id="engine-log-title">Engine event log</h2></div>
            <span>{entries.length} events</span>
          </div>
          <ol className="simulator-log" aria-live="polite" aria-relevant="additions">
            {entries.map((entry) => (
              <li key={entry.id} className={`log-${entry.level}`}>
                <span>{String(entry.id).padStart(2, "0")}</span>
                <div><strong>{entry.message}</strong>{entry.detail && <p>{entry.detail}</p>}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <SimulatorBoardPreview frame={snapshot.board} />

      <section className="simulator-next">
        <p className="eyebrow">Next checkpoint</p>
        <h2>Load real card records and scripts, then project ocgcore field queries into the shared DuelBoard.</h2>
        <p>
          The engine binary, worker isolation, lifecycle, and packet boundary are now real. The next layer supplies the card
          database and Lua script resolver needed to create a Pure Mitsurugi opening and expose its legal actions.
        </p>
      </section>
    </section>
  );
}
