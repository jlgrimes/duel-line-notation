import { useEffect, useRef, useState } from "react";
import type {
  EngineLogEntry,
  EnginePhase,
  EngineWorkerRequest,
  EngineWorkerResponse,
} from "./engine-types";
import "./simulator.css";

const INITIAL_LOG: EngineLogEntry = {
  id: 1,
  level: "info",
  message: "Simulator route mounted",
  detail: "Preparing a browser worker and WebAssembly engine boundary.",
};

export function SimulatorPage() {
  const workerRef = useRef<Worker | null>(null);
  const nextLogId = useRef(2);
  const [phase, setPhase] = useState<EnginePhase>("idle");
  const [statusMessage, setStatusMessage] = useState("Waiting to initialize");
  const [entries, setEntries] = useState<EngineLogEntry[]>([INITIAL_LOG]);
  const [engineVersion, setEngineVersion] = useState<number>();
  const [stepValue, setStepValue] = useState(0);

  function appendLog(entry: Omit<EngineLogEntry, "id">): void {
    const id = nextLogId.current;
    nextLogId.current += 1;
    setEntries((current) => [...current, { ...entry, id }]);
  }

  function send(request: EngineWorkerRequest): void {
    workerRef.current?.postMessage(request);
  }

  function initialize(): void {
    setEngineVersion(undefined);
    setStepValue(0);
    send({ type: "reset" });
    send({ type: "initialize" });
  }

  useEffect(() => {
    const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<EngineWorkerResponse>) => {
      const message = event.data;

      if (message.type === "status") {
        setPhase(message.phase);
        setStatusMessage(message.message);
        return;
      }

      if (message.type === "log") {
        appendLog(message.detail === undefined
          ? { level: message.level, message: message.message }
          : { level: message.level, message: message.message, detail: message.detail });
        return;
      }

      if (message.type === "initialized") {
        setEngineVersion(message.engineVersion);
        return;
      }

      if (message.type === "step-result") {
        setStepValue(message.next);
        appendLog({
          level: "success",
          message: "WASM process step completed",
          detail: `State ${message.previous} → ${message.next}`,
        });
        return;
      }

      setPhase("error");
      setStatusMessage(message.message);
    };

    worker.onerror = () => {
      setPhase("error");
      setStatusMessage("The engine worker crashed");
      appendLog({
        level: "error",
        message: "Worker runtime error",
        detail: "The browser could not complete the simulator worker request.",
      });
    };

    worker.postMessage({ type: "initialize" } satisfies EngineWorkerRequest);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const ready = phase === "ready";

  return (
    <section className="simulator-page">
      <header className="simulator-hero">
        <div>
          <p className="eyebrow">Pure Mitsurugi · engine spike</p>
          <h1>Simulator</h1>
          <p>
            A browser-first rules sandbox. This first milestone proves the visible React → Web Worker →
            WebAssembly loop before the smoke module is replaced with ocgcore and the real Mitsurugi scripts.
          </p>
        </div>
        <div className={`simulator-status simulator-status-${phase}`}>
          <span aria-hidden="true" />
          <div>
            <small>Engine status</small>
            <strong>{statusMessage}</strong>
          </div>
        </div>
      </header>

      <div className="simulator-grid">
        <section className="simulator-panel" aria-labelledby="engine-bridge-title">
          <div className="simulator-panel-heading">
            <div>
              <p>Milestone 01</p>
              <h2 id="engine-bridge-title">Browser engine bridge</h2>
            </div>
            <span>{ready ? "Ready" : phase}</span>
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
              <dt>Smoke ABI</dt>
              <dd>{engineVersion === undefined ? "Not loaded" : `Version ${engineVersion}`}</dd>
            </div>
            <div>
              <dt>Current test state</dt>
              <dd>{stepValue}</dd>
            </div>
          </dl>

          <div className="simulator-actions">
            <button type="button" onClick={initialize} disabled={phase === "starting"}>
              {phase === "starting" ? "Initializing…" : "Restart engine"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!ready}
              onClick={() => send({ type: "process-step", state: stepValue })}
            >
              Process one WASM step
            </button>
          </div>

          <div className="simulator-note">
            <strong>Honest scope:</strong> this page is currently running a 100-byte WebAssembly bridge smoke
            module, not ocgcore. The next implementation step is replacing that module with a pinned ocgcore build
            while preserving this worker protocol and on-screen status surface.
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
        <h2>Normal Summon Aramasa and show the legal search prompt on this screen.</h2>
        <p>
          That checkpoint will require the real core, the Pure Mitsurugi card manifest, Lua procedure scripts,
          cards.cdb data, and the first decoded ocgcore prompt messages.
        </p>
      </section>
    </section>
  );
}
