import { useEffect, useRef, useState } from "react";
import {
  INITIAL_ENGINE_SNAPSHOT,
  type EngineActionPrompt,
  type EngineEvent,
  type EngineLogLevel,
  type EngineSnapshot,
} from "../../src/simulator/engine-protocol.js";
import {
  WorkerDuelEngine,
  type DuelEngine,
  type EngineWorkerPort,
} from "../../src/simulator/worker-duel-engine.js";
import { isFullyAnchored } from "../../src/simulator/board-interaction.js";
import { SimulatorBoardPreview, boardInteractionFor } from "./SimulatorBoardPreview";
import "./simulator.css";

interface DisplayLogEntry {
  id: number;
  level: EngineLogLevel;
  message: string;
  detail?: string;
}

interface ChoiceResolverProps {
  prompt: EngineActionPrompt | null;
  pending: boolean;
  /** True when every legal option is already tappable on the board itself. */
  handledOnBoard: boolean;
  onChoose(promptId: string, optionId: string): void;
}

const INITIAL_LOG: DisplayLogEntry = {
  id: 1,
  level: "info",
  message: "Simulator route mounted",
  detail: "Preparing the real Project Ignis duel engine in an isolated worker.",
};

const PROCESS_STATUS_NAMES = ["End", "Awaiting response", "Continue"] as const;

function ChoiceResolver({ prompt, pending, handledOnBoard, onChoose }: ChoiceResolverProps) {
  return (
    <section className={`simulator-choice-resolver choice-${prompt?.kind ?? "waiting"}`} aria-live="polite">
      <header>
        <div>
          <p className="eyebrow">Resolve engine choice</p>
          <h2>{prompt?.title ?? "Waiting for ocgcore"}</h2>
        </div>
        <span>{prompt?.kind ?? "waiting"}</span>
      </header>
      <p className="choice-detail">
        {prompt?.detail ?? "The next legal action or mandatory choice will appear here without the UI guessing for you."}
      </p>
      {prompt && handledOnBoard && (
        <p className="choice-on-board">
          Highlighted on the board above — tap the {prompt.kind === "zone" ? "zone" : "card"} you want.
        </p>
      )}
      {prompt && !handledOnBoard && (
        <div className="choice-options">
          {prompt.options.map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={pending}
              onClick={() => onChoose(prompt.id, option.id)}
            >
              <strong>{option.label}</strong>
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
        </div>
      )}
      {pending && <p className="choice-progress">Sending choice to ocgcore…</p>}
    </section>
  );
}

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

  function chooseOption(promptId: string, optionId: string): void {
    void runRequest((engine) => engine.performAction(promptId, optionId));
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
  const field = snapshot.field;
  const interaction = boardInteractionFor(snapshot.prompt, requestPending, chooseOption);
  // Only drop the button list when the board can offer every option, so a prompt with an
  // unanchored option (a battle position, say) is never left unreachable.
  const everyOptionOnBoard = Boolean(interaction) && isFullyAnchored(snapshot.prompt);

  return (
    <section className="simulator-page">
      <header className="simulator-hero">
        <div>
          <p className="eyebrow">Project Ignis ocgcore · live WebAssembly worker</p>
          <h1>Simulator</h1>
          <p>
            The board is now the primary surface. Every engine pause becomes an explicit action, zone, or position choice
            directly underneath it instead of being silently auto-resolved.
          </p>
        </div>
        <div className={`simulator-status simulator-status-${snapshot.phase}`}>
          <span aria-hidden="true" />
          <div><small>Engine status</small><strong>{snapshot.statusMessage}</strong></div>
        </div>
      </header>

      <SimulatorBoardPreview frame={snapshot.board} interaction={interaction} />

      <ChoiceResolver
        prompt={snapshot.prompt}
        pending={requestPending}
        handledOnBoard={everyOptionOnBoard}
        onChoose={chooseOption}
      />

      <div className="simulator-grid">
        <section className="simulator-panel" aria-labelledby="engine-bridge-title">
          <div className="simulator-panel-heading">
            <div><p>Milestone 08</p><h2 id="engine-bridge-title">Direct board interaction</h2></div>
            <span>{ready ? "Ready" : snapshot.phase}</span>
          </div>
          <dl className="engine-facts">
            <div><dt>Duel scope</dt><dd>Deterministic one-card decks</dd></div>
            <div><dt>Execution</dt><dd>Web Worker + real WASM</dd></div>
            <div>
              <dt>Turn · phase</dt>
              <dd>{field ? `Turn ${field.turnCount} · ${field.phaseName}` : "Waiting"}</dd>
            </div>
            <div>
              <dt>Cards located</dt>
              <dd>{field ? `${field.cards.length} across both players` : "Waiting"}</dd>
            </div>
            <div>
              <dt>Life points</dt>
              <dd>{field ? `${field.players[0].lp.toLocaleString()} · ${field.players[1].lp.toLocaleString()}` : "Waiting"}</dd>
            </div>
            <div><dt>Chain</dt><dd>{field ? (field.chain.length === 0 ? "No Chain" : `${field.chain.length} link(s)`) : "Waiting"}</dd></div>
            <div><dt>Current choice</dt><dd>{snapshot.prompt?.title ?? "No choice pending"}</dd></div>
            <div><dt>Core API</dt><dd>{snapshot.engineVersion === null ? "Not loaded" : snapshot.engineVersion.toFixed(1)}</dd></div>
            <div><dt>Process status</dt><dd>{ready ? processStatus : "Waiting"}</dd></div>
          </dl>
          <div className="simulator-actions simulator-actions-single">
            <button type="button" onClick={() => void runRequest((engine) => engine.restart())} disabled={requestPending || snapshot.phase === "starting"}>
              {snapshot.phase === "starting" ? "Initializing…" : "Restart engine"}
            </button>
          </div>
          <div className="simulator-note">
            <strong>Choice contract:</strong> ocgcore owns the legal options and says which card or zone each one belongs to.
            The interface only highlights those targets and sends the selected response bytes back to the active prompt.
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

      <section className="simulator-next">
        <p className="eyebrow">Next checkpoint</p>
        <h2>Use these same board targets for real Mitsurugi effects, targets, chains, and card selections.</h2>
        <p>
          Every option the engine anchors to a card or a zone is now made on the board itself. The next layer carries the same
          targeting model into card lists, yes-or-no effects, chain windows, and multi-select prompts from the actual
          Mitsurugi scripts.
        </p>
      </section>
    </section>
  );
}
