import type { ComboDetail } from "./data";

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
