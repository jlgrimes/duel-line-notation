import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { DeckManifest, LineDocument } from "../src/model.js";
import { buildPlayback, type PlaybackFrame, type PlaybackSequence, type VisualCard, type VisualFieldSlot, type VisualZone } from "../src/visualizer.js";
import { useCardScans, type CardScan } from "./card-service";

interface DuelVisualizerProps {
  document?: LineDocument;
  sequence?: PlaybackSequence;
  manifest: DeckManifest;
  diagnostics: number;
  inferred?: boolean;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const SPEEDS = [0.6, 1, 1.5, 2];
const CardScanContext = createContext<Record<string, CardScan>>({});

export function DuelVisualizer({ document, sequence: suppliedSequence, manifest, diagnostics, inferred = false }: DuelVisualizerProps) {
  const sequence = useMemo(() => suppliedSequence ?? (document ? buildPlayback(document, manifest) : undefined), [document, manifest, suppliedSequence]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const { scans, loading: scansLoading } = useCardScans(manifest);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [sequence]);

  const frames = sequence?.frames ?? [];
  const frame = frames[frameIndex];

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    if (frameIndex >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => transitionTo(frameIndex + 1), 1500 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, frameIndex, frames.length, speed]);

  function transitionTo(next: number) {
    const bounded = Math.max(0, Math.min(next, frames.length - 1));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const page = window.document as ViewTransitionDocument;
    if (!reducedMotion && page.startViewTransition) {
      page.startViewTransition(() => flushSync(() => setFrameIndex(bounded)));
    } else {
      setFrameIndex(bounded);
    }
  }

  function togglePlayback() {
    if (frameIndex >= frames.length - 1) {
      transitionTo(0);
      window.setTimeout(() => setPlaying(true), 80);
      return;
    }
    setPlaying((current) => !current);
  }

  if (!sequence || !frame || diagnostics > 0) {
    return (
      <section className="duel-visualizer visualizer-empty">
        <div className="empty-card">!</div>
        <h2>Visualizer paused</h2>
        <p>Fix the notation diagnostics first. A valid DLN document is required to calculate card movement.</p>
      </section>
    );
  }

  const progress = frames.length <= 1 ? 0 : frameIndex / (frames.length - 1) * 100;

  return (
    <CardScanContext.Provider value={scans}>
    <section className="duel-visualizer" aria-label="Animated duel line visualizer">
      <div className="duel-canvas">
        <div className="opponent-field" aria-hidden="true">
          <span>Opponent</span>
          <div>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
        </div>

        <div className="life-points"><small>LP</small><strong>{frame.lp.toLocaleString()}</strong></div>

        {frame.chainLink && (
          <div className="chain-resolver">
            <span>{frame.chainPhase === "activation" ? "Building Chain" : "Chain resolving"}</span>
            <div>
              {Array.from({ length: frame.chainSize ?? 0 }, (_, index) => index + 1).reverse().map((link) => (
                <i key={link} className={link === frame.chainLink ? "active" : frame.chainPhase === "resolution" && link > frame.chainLink! ? "resolved" : frame.chainPhase === "activation" && link < frame.chainLink! ? "queued" : ""}>CL{link}</i>
              ))}
            </div>
          </div>
        )}

        <div className="playmat">
          <ExtraMonsterRow frame={frame} />
          <StaticZone label="Field Zone" className="field-zone" />
          <FieldRow cards={frame.cards.filter((card) => card.zone === "F" && card.kind === "monster" && card.fieldSlot?.startsWith("M"))} label="Main Monster Zones" frame={frame} className="monster-zone" slotPrefix="M" />
          <Zone zone="G" label="GY" frame={frame} compact />
          <Zone zone="X" label="Extra Deck" frame={frame} stack compact />
          <FieldRow cards={frame.cards.filter((card) => card.zone === "F" && card.kind !== "monster")} label="Spell & Trap Zones" frame={frame} className="backrow-zone" slotPrefix="S" pendulumEdges />
          <Zone zone="D" label="Deck" frame={frame} stack compact />
          <div className="banished-zone"><Zone zone="B" label="Banished" frame={frame} compact /></div>
        </div>

        <div className="hand-zone">
          <span className="zone-caption">Hand · {frame.cards.filter((card) => card.zone === "H").length}</span>
          <div className="hand-cards">
            {frame.cards.filter((card) => card.zone === "H").map((card) => <DuelCard key={card.id} card={card} frame={frame} />)}
            {!frame.cards.some((card) => card.zone === "H") && <span className="empty-zone-label">Empty hand</span>}
          </div>
        </div>

        <div className="action-callout">
          <span>{frame.movements.length > 0 ? frame.movements.map((move) => `${move.alias} ${move.from}→${move.to}`).join(" · ") : "Effect window"}</span>
          <code>{frame.expression}</code>
        </div>
      </div>

      <div className="duel-toolbar">
        <div className="playback-copy" aria-live="polite">
          <span>{frame.stepNumber === 0 ? "Ready" : frame.chainLink ? `Step ${frame.stepNumber} · CL${frame.chainLink} ${frame.chainPhase === "activation" ? "activates" : "resolves"}` : `Step ${frame.stepNumber}`}</span>
          <strong>{frame.label}</strong>
        </div>
        <div className="playback-controls">
          <button className="icon-control" onClick={() => transitionTo(frameIndex - 1)} disabled={frameIndex === 0} aria-label="Previous frame">←</button>
          <button className="play-control" onClick={togglePlayback}>{playing ? "Pause" : frameIndex === frames.length - 1 ? "Replay" : "Play"}</button>
          <button className="icon-control" onClick={() => transitionTo(frameIndex + 1)} disabled={frameIndex === frames.length - 1} aria-label="Next frame">→</button>
          <label className="speed-control">
            <span>Speed</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select>
          </label>
        </div>
      </div>

      <div className="duel-timeline">
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={Math.max(0, frames.length - 1)}
          value={frameIndex}
          onChange={(event) => { setPlaying(false); transitionTo(Number(event.target.value)); }}
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        />
        <div className="timeline-labels">
          <span>Opening hand</span>
          <strong>{frameIndex + 1} / {frames.length}</strong>
          <span>End board</span>
        </div>
        <div className={`scan-credit ${scansLoading ? "loading" : ""}`}>
          <i /> {inferred ? "Positions inferred from the structured guide" : scansLoading ? "Resolving card scans…" : `${Object.keys(scans).length} real card scans loaded`} · Data and images via <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck</a>
        </div>
      </div>
    </section>
    </CardScanContext.Provider>
  );
}

function FieldRow({ cards, label, frame, className, slotPrefix, pendulumEdges = false }: { cards: VisualCard[]; label: string; frame: PlaybackFrame; className: string; slotPrefix: "M" | "S"; pendulumEdges?: boolean }) {
  return (
    <div className={`field-row ${className}`}>
      <span className="zone-caption">{label}</span>
      <div className="field-slots">
        {Array.from({ length: 5 }, (_, index) => {
          const fieldSlot = `${slotPrefix}${index + 1}` as VisualFieldSlot;
          const card = cards.find((candidate) => candidate.fieldSlot === fieldSlot) ?? cards.find((candidate) => !candidate.fieldSlot);
          return (
          <div className="field-slot" key={index}>
            <span className="field-slot-label">{fieldSlot}{pendulumEdges && (index === 0 || index === 4) ? <small>P</small> : null}</span>
            {card && <DuelCard card={card} frame={frame} />}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ExtraMonsterRow({ frame }: { frame: PlaybackFrame }) {
  return (
    <div className="extra-monster-row">
      <span className="zone-caption">Shared Extra Monster Zones</span>
      <div className="extra-monster-slots">
        {(["EMZ1", "EMZ2"] as VisualFieldSlot[]).map((slot, index) => {
          const card = frame.cards.find((candidate) => candidate.zone === "F" && candidate.fieldSlot === slot);
          return <div className={`field-slot emz-slot emz-${index + 1}`} key={slot}><span className="field-slot-label">EMZ {index + 1}</span>{card && <DuelCard card={card} frame={frame} />}</div>;
        })}
      </div>
    </div>
  );
}

function StaticZone({ label, className }: { label: string; className: string }) {
  return (
    <div className={`static-zone ${className}`}>
      <span className="zone-caption">{label}</span>
      <div className="static-zone-surface"><span>FIELD</span></div>
    </div>
  );
}

function Zone({ zone, label, frame, compact = false, stack = false }: { zone: VisualZone; label: string; frame: PlaybackFrame; compact?: boolean; stack?: boolean }) {
  const cards = frame.cards.filter((card) => card.zone === zone);
  const visible = stack ? cards.slice(-1) : cards.slice(-2);
  return (
    <div className={`side-zone zone-${zone.toLowerCase()} ${compact ? "compact" : ""} ${stack ? "stack" : ""}`}>
      <span className="zone-caption">{label}{cards.length > 0 ? ` · ${cards.length}` : ""}</span>
      <div className="zone-card-stack">
        {visible.map((card) => <DuelCard key={card.id} card={card} frame={frame} faceDown={stack} />)}
        {visible.length === 0 && stack && <div className="card-back"><span>D/LN</span></div>}
        {visible.length === 0 && !stack && <span className="empty-zone-label">Empty</span>}
      </div>
    </div>
  );
}

function DuelCard({ card, frame, faceDown = false }: { card: VisualCard; frame: PlaybackFrame; faceDown?: boolean }) {
  const scans = useContext(CardScanContext);
  const scan = scans[card.name];
  const [scanFailed, setScanFailed] = useState(false);
  const active = frame.activeAliases.includes(card.alias);
  const moving = frame.movements.some((movement) => movement.cardId === card.id);
  const hidden = faceDown || !card.faceUp;
  const showScan = !hidden && scan && !scanFailed;

  useEffect(() => setScanFailed(false), [scan?.imageUrl]);

  return (
    <article
      className={`duel-card card-${card.kind} ${active ? "active" : ""} ${moving ? "moving" : ""} ${hidden ? "face-down" : ""} ${showScan ? "real-scan" : ""}`}
      style={{ viewTransitionName: `card-${card.id}` }}
      title={card.name}
    >
      {hidden ? (
        <div className="card-back"><span>D/LN</span></div>
      ) : showScan ? (
        <>
          <img src={scan.imageUrl} alt={card.name} loading={active ? "eager" : "lazy"} draggable={false} onError={() => setScanFailed(true)} />
          <span className="scan-alias">{card.alias}</span>
        </>
      ) : (
        <>
          <div className="card-name"><span>{card.name}</span>{card.level && <b>★{card.level}</b>}</div>
          <div className="card-art"><span>{card.alias.slice(0, 3)}</span></div>
          <div className="card-text"><b>{card.alias}</b><span>{card.kind}</span></div>
        </>
      )}
    </article>
  );
}
