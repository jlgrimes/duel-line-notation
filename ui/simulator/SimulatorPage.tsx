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
  detail: "Preparing a typed duel-engine adapter backed by a browser worker and WebAssembly.",
};

export function SimulatorPage() {
  const engineRef = useRef<DuelEngine | null>(null);
  const nextLogId = useRef(2);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({ ...INITIAL_ENGINE_SNAPSHOT });
  const [entries, setEntries] = useState<DisplayLogEntry[]>([INITIAL_LOG]);
  const [requestPending, setRequestPending] = useState(false);

  function appendLog(entry: Omit<DisplayLogEntry, "id">): void {
    const id = nextLogId.current;
    nextLogId.current += 1;
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
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
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

  return (
    <section className="simulator-page">
      <header className="simulator-hero">
        <div>
          <p className="eyebrow">Pure Mitsurugi · typed engine adapter</p>
          <h1>Simulator</h1>
          <p>
            The screen now talks to a reusable DuelEngine interface. Worker request IDs, WebAssembly calls,
            snapshots, errors, and domain events stay behind that adapter so the UI will not depend on ocgcore's
            eventual binary protocol.
          </p>
        </div>
        <div className={`simulator-status simulator-status-${snapshot.phase}`}>
          <span aria-hidden="true" />
          <div>
            <small>Engine status</small>
            <strong>{snapshot.statusMessage}</strong>
          </div>
        </div>
      </header>

      <div className="simulator-grid">
        <section className="simulator-panel" aria-labelledby="engine-bridge-title">
          <div className="simulator-panel-heading">
            <div>
              <p>Milestone 02</p>
              <h2 id="engine-bridge-title">Typed duel-engine boundary</h2>
            </div>
            <span>{ready ? "Ready" : snapshot.phase}</span>
          </div>

          <dl className="engine-facts">
            <div>
              <dt>Deck scope</dt>
              <dd>Pure Mitsurugi only</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>Web Worker + WASM</dd>
            </div>
            <div>
              <dt>Adapter</dt>
              <dd>Typed snapshots + events</dd>
            </div>
            <div>
              <dt>Smoke ABI</dt>
              <dd>{snapshot.engineVersion === null ? "Not loaded" : `Version ${snapshot.engineVersion}`}</dd>
            </div>
            <div>
              <dt>Current test state</dt>
              <dd>{snapshot.stepValue}</dd>
            </div>
          </dl>

          <div className="simulator-actions">
            <button
              type="button"
              onClick={() => void runRequest((engine) => engine.restart())}
              disabled={requestPending || snapshot.phase === "starting"}
            >
              {snapshot.phase === "starting" ? "Initializing…" : "Restart engine"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!ready || requestPending}
              onClick={() => void runRequest((engine) => engine.processStep())}
            >
              {requestPending ? "Processing…" : "Process one WASM step"}
            </button>
          </div>

          <div className="simulator-note">
            <strong>Honest scope:</strong> this still runs the 100-byte WebAssembly smoke module, not ocgcore. The
            difference is architectural: the next engine can replace the runtime without rewriting React or exposing
            raw worker messages to the screen.
          </div>
        </section>

        <section className="simulator-panel simulator-log-panel" aria-labelledby="engine-log-title">
          <div className="simulator-panel-heading">
            <div>
              <p>On-screen output</p>
              <h2 id="engine-log-title">Engine event log</h2>
            </div>
            <span>{entries.length} events</span>
          </div>

          <ol className="simulator-log" aria-live="polite" aria-relevant="additions">
            {entries.map((entry) => (
              <li key={entry.id} className={`log-${entry.level}`}>
                <span>{String(entry.id).padStart(2, "0")}</span>
                <div>
                  <strong>{entry.message}</strong>
                  {entry.detail && <p>{entry.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="simulator-next">
        <p className="eyebrow">Next checkpoint</p>
        <h2>Swap the smoke runtime for ocgcore and display Aramasa's first legal prompt.</h2>
        <p>
          The UI is now insulated from the transport. Phase 3 can focus on the actual core build, Lua scripts,
          cards.cdb data, and decoding the first ocgcore messages into these shared engine events and snapshots.
        </p>
      </section>
    </section>
  );
}
