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
            The worker now loads a real card record, creates deterministic decks, decodes ocgcore&apos;s idle-command packet,
            and publishes both the queried board and legal action through immutable engine snapshots.
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
            <div><p>Milestone 06</p><h2 id="engine-bridge-title">First legal ocgcore action</h2></div>
            <span>{ready ? "Ready" : snapshot.phase}</span>
          </div>
          <dl className="engine-facts">
            <div><dt>Duel scope</dt><dd>Deterministic one-card decks</dd></div>
            <div><dt>Execution</dt><dd>Web Worker + real WASM</dd></div>
            <div><dt>Board source</dt><dd>{snapshot.board ? "OCG field queries" : "Waiting"}</dd></div>
            <div><dt>Legal action</dt><dd>{snapshot.prompt?.label ?? "No supported action"}</dd></div>
            <div><dt>Core API</dt><dd>{snapshot.engineVersion === null ? "Not loaded" : snapshot.engineVersion.toFixed(1)}</dd></div>
            <div><dt>Process status</dt><dd>{ready ? processStatus : "Waiting"}</dd></div>
          </dl>
          <div className="simulator-actions">
            <button type="button" onClick={() => void runRequest((engine) => engine.restart())} disabled={requestPending || snapshot.phase === "starting"}>
              {snapshot.phase === "starting" ? "Initializing…" : "Restart engine"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!ready || requestPending || !snapshot.prompt}
              onClick={() => snapshot.prompt && void runRequest((engine) => engine.performAction(snapshot.prompt!.id))}
            >
              {requestPending ? "Processing…" : snapshot.prompt?.label ?? "No supported action"}
            </button>
          </div>
          <div className="simulator-note">
            <strong>Honest scope:</strong> the card, opening draw, hand query, legal prompt, response encoding, and summon are
            all owned by ocgcore. Mystical Elf is a deliberately scriptless bootstrap card; Mitsurugi Lua effects come next.
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
        <h2>Replace the scriptless bootstrap card with real Mitsurugi card data and Lua scripts.</h2>
        <p>
          The full browser-to-core action loop is now established. The next vertical slice adds the script resolver and a
          minimal Pure Mitsurugi opening, then maps its effect prompts onto the same typed action interface.
        </p>
      </section>
    </section>
  );
}
