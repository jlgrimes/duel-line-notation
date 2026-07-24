import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { DeckManifest, LineDocument } from "../src/model.js";
import { buildPlayback, type PlaybackSequence } from "../src/visualizer.js";
import { useCardScans } from "./card-service";
import { DuelBoard } from "./DuelBoard";

interface DuelVisualizerProps {
  document?: LineDocument;
  sequence?: PlaybackSequence;
  manifest: DeckManifest;
  inferred?: boolean;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const SPEEDS = [0.6, 1, 1.5, 2];

export function DuelVisualizer({ document, sequence: suppliedSequence, manifest, inferred = false }: DuelVisualizerProps) {
  const sequence = useMemo(
    () => suppliedSequence ?? (document ? buildPlayback(document, manifest) : undefined),
    [document, manifest, suppliedSequence],
  );
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

  if (!sequence || !frame) {
    return (
      <section className="duel-visualizer visualizer-empty">
        <div className="empty-card">!</div>
        <h2>Visualizer unavailable</h2>
        <p>This combo did not produce a playable sequence.</p>
      </section>
    );
  }

  const progress = frames.length <= 1 ? 0 : frameIndex / (frames.length - 1) * 100;

  return (
    <section className="duel-visualizer" aria-label="Animated duel line visualizer">
      <DuelBoard frame={frame} scans={scans} ariaLabel="Animated duel line board" />

      <div className="duel-toolbar">
        <div className="playback-copy" aria-live="polite">
          <span>
            {frame.stepNumber === 0
              ? "Ready"
              : frame.chainLink
                ? `Step ${frame.stepNumber} · CL${frame.chainLink} ${frame.chainPhase === "activation" ? "activates" : "resolves"}`
                : `Step ${frame.stepNumber}`}
          </span>
          <strong>{frame.label}</strong>
        </div>
        <div className="playback-controls">
          <button className="icon-control" onClick={() => transitionTo(frameIndex - 1)} disabled={frameIndex === 0} aria-label="Previous frame">←</button>
          <button className="play-control" onClick={togglePlayback}>{playing ? "Pause" : frameIndex === frames.length - 1 ? "Replay" : "Play"}</button>
          <button className="icon-control" onClick={() => transitionTo(frameIndex + 1)} disabled={frameIndex === frames.length - 1} aria-label="Next frame">→</button>
          <label className="speed-control">
            <span>Speed</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
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
          onChange={(event) => {
            setPlaying(false);
            transitionTo(Number(event.target.value));
          }}
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        />
        <div className="timeline-labels">
          <span>Opening hand</span>
          <strong>{frameIndex + 1} / {frames.length}</strong>
          <span>End board</span>
        </div>
        <div className={`scan-credit ${scansLoading ? "loading" : ""}`}>
          <i /> {inferred
            ? "Positions inferred from the structured guide"
            : scansLoading
              ? "Resolving card scans…"
              : `${Object.keys(scans).length} real card scans loaded`} · Data and images via <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck</a>
        </div>
      </div>
    </section>
  );
}
