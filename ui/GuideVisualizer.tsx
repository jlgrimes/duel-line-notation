import { useEffect, useMemo, useState } from "react";
import type { ComboDetail } from "./data";
import { useCardScans } from "./card-service";

export function GuideVisualizer({ combo }: { combo: ComboDetail }) {
  const guide = combo.guide!;
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { scans, loading } = useCardScans(combo.manifest);
  const step = guide.steps[stepIndex] ?? "Review the opening hand and end board.";
  const activeCards = useMemo(() => guide.cardNames.filter((name) => mentioned(step, name)), [guide.cardNames, step]);

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [combo.id]);

  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= guide.steps.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStepIndex((current) => current + 1), 1900);
    return () => window.clearTimeout(timer);
  }, [guide.steps.length, playing, stepIndex]);

  function togglePlayback() {
    if (stepIndex >= guide.steps.length - 1) {
      setStepIndex(0);
      window.setTimeout(() => setPlaying(true), 60);
    } else {
      setPlaying((current) => !current);
    }
  }

  const progress = guide.steps.length <= 1 ? 100 : stepIndex / (guide.steps.length - 1) * 100;
  return (
    <section className="guide-visualizer" aria-label="Visual combo guide">
      <div className="duel-toolbar">
        <div className="playback-copy"><span>Guide preview · Step {stepIndex + 1} of {guide.steps.length}</span><strong>{step}</strong></div>
        <div className="playback-controls">
          <button className="icon-control" onClick={() => { setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }} disabled={stepIndex === 0} aria-label="Previous step">←</button>
          <button className="play-control" onClick={togglePlayback}>{playing ? "Pause" : stepIndex === guide.steps.length - 1 ? "Replay" : "Play"}</button>
          <button className="icon-control" onClick={() => { setPlaying(false); setStepIndex((current) => Math.min(guide.steps.length - 1, current + 1)); }} disabled={stepIndex === guide.steps.length - 1} aria-label="Next step">→</button>
        </div>
      </div>

      <div className="guide-stage">
        <div className="guide-opening"><span>Opening</span>{guide.starterCards.map((card) => <i key={card}>{card}</i>)}</div>
        <div className="guide-card-grid">
          {guide.cardNames.map((name, index) => {
            const scan = scans[name];
            const active = activeCards.includes(name);
            return (
              <article className={`guide-card ${active ? "active" : ""}`} key={name} style={{ "--guide-order": index } as React.CSSProperties}>
                <div>{scan ? <img src={scan.imageUrl} alt={name} draggable={false} /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
                <small>{name}</small>
              </article>
            );
          })}
        </div>
        <div className="guide-current-step"><span>{String(stepIndex + 1).padStart(2, "0")}</span><p>{step}</p></div>
      </div>

      <div className="guide-timeline">
        <div className="guide-progress"><i style={{ width: `${progress}%` }} /></div>
        <div><span>{loading ? "Resolving card scans…" : `${Object.keys(scans).length} scans loaded`}</span><strong>End board</strong><p>{guide.endBoard}</p></div>
      </div>
    </section>
  );
}

export function GuideSteps({ combo }: { combo: ComboDetail }) {
  const guide = combo.guide!;
  return (
    <section className="guide-steps" aria-label="Structured combo steps">
      <div className="guide-facts">
        <span><small>Difficulty</small>{combo.difficulty ?? "Unrated"}</span>
        <span><small>Turn</small>{guide.turnPreference ?? "Either"}</span>
        <span><small>Contributor</small>@{guide.contributor}</span>
        <span><small>License</small>{combo.sourceLicense ?? "Source terms"}</span>
      </div>
      {guide.prerequisites.length > 0 && <div className="guide-prerequisites"><strong>Start with</strong>{guide.prerequisites.map((item) => <span key={item}>{item}</span>)}</div>}
      <ol>{guide.steps.map((step, index) => <li key={`${step}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><p>{step}</p></li>)}</ol>
      <div className="guide-result"><span>End board</span><p>{guide.endBoard}</p></div>
      {guide.variants.length > 0 && <div className="guide-variants"><span>Variants</span>{guide.variants.map((variant) => <p key={variant}>{variant}</p>)}</div>}
    </section>
  );
}

function mentioned(step: string, cardName: string): boolean {
  const haystack = normalize(step);
  const fullName = normalize(cardName);
  if (haystack.includes(fullName)) return true;
  const distinctive = fullName.split(" ").filter((word) => word.length >= 5 && !["striker", "mitsurugi", "branded"].includes(word));
  return distinctive.some((word) => haystack.includes(word));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
