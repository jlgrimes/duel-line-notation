import { useMemo, useState } from "react";
import type { ComboSource, DeckFixture } from "./data";

interface ComboLibraryProps {
  fixtures: DeckFixture[];
  sources: ComboSource[];
  auditedAsOf: string;
  onOpenLine: (slug: string) => void;
}

const STATUS_LABELS: Record<ComboSource["status"], string> = {
  "source-backed": "Replay source",
  "import-ready": "Import-ready",
  discovery: "Discovery",
  supplemental: "Supporting data",
};

export function ComboLibrary({ fixtures, sources, auditedAsOf, onOpenLine }: ComboLibraryProps) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filteredSources = useMemo(() => sources.filter((source) => {
    const haystack = [source.name, source.kind, source.description, source.scale, ...source.tags].join(" ").toLowerCase();
    return haystack.includes(normalized);
  }), [normalized, sources]);
  const filteredFixtures = useMemo(() => fixtures.filter((fixture) => {
    const haystack = [fixture.name, fixture.lineTitle, fixture.summon, fixture.summary].join(" ").toLowerCase();
    return haystack.includes(normalized);
  }), [fixtures, normalized]);

  return (
    <section className="combo-library" aria-label="Yu-Gi-Oh combo library">
      <div className="library-hero">
        <div>
          <p className="eyebrow">Combo source registry</p>
          <h2>Find a route. Preserve where it came from.</h2>
          <p>This is the catalog layer around DLN: current local lines plus larger combo websites, separated by provenance and reuse status.</p>
        </div>
        <div className="library-stats" aria-label="Library statistics">
          <span><strong>{fixtures.length}</strong> DLN routes</span>
          <span><strong>{sources.length}</strong> external catalogs</span>
          <span><strong>{sources.filter((source) => source.status === "import-ready").length}</strong> open import source</span>
        </div>
      </div>

      <label className="library-search">
        <span>Search decks, engines, or source types</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Mitsurugi, replay, end board…" type="search" />
      </label>

      <div className="library-section-heading">
        <div><span>In this repository</span><h3>Playable DLN routes</h3></div>
        <p>These six are authored fixtures for the notation and visualizer. They still need route-by-route replay verification.</p>
      </div>
      <div className="route-grid">
        {filteredFixtures.map((fixture) => (
          <article className="route-card" key={fixture.slug}>
            <div className="route-card-top"><span style={{ background: fixture.accent }} /><small>{fixture.summon}</small></div>
            <h4>{fixture.name}</h4>
            <p>{fixture.lineTitle}</p>
            <div className="provenance-badges"><i>DLN authored</i><i className="needs-review">Needs replay check</i></div>
            <button onClick={() => onOpenLine(fixture.slug)}>Open in Line Lab <span>→</span></button>
          </article>
        ))}
        {filteredFixtures.length === 0 && <EmptyResult />}
      </div>

      <div className="library-section-heading source-heading">
        <div><span>Across the web</span><h3>Combo websites and datasets</h3></div>
        <p>Counts are an audited snapshot from {auditedAsOf}. Links stay external until a route can be imported legally and attributed precisely.</p>
      </div>
      <div className="source-grid">
        {filteredSources.map((source) => <SourceCard source={source} key={source.id} />)}
        {filteredSources.length === 0 && <EmptyResult />}
      </div>

      <div className="provenance-pipeline">
        <span>Publication path</span>
        <ol>
          <li><b>01</b><strong>Discover</strong><small>Locate the original route</small></li>
          <li><b>02</b><strong>Cite</strong><small>Record author, URL, and format</small></li>
          <li><b>03</b><strong>Transcribe</strong><small>Translate observable actions to DLN</small></li>
          <li><b>04</b><strong>Validate</strong><small>Check zones, costs, and Chain order</small></li>
          <li><b>05</b><strong>Replay-check</strong><small>Compare every step to the source</small></li>
          <li><b>06</b><strong>Publish</strong><small>Attach an explicit verification badge</small></li>
        </ol>
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: ComboSource }) {
  return (
    <article className={`source-card status-${source.status}`}>
      <div className="source-card-header">
        <span>{STATUS_LABELS[source.status]}</span>
        <small>{source.kind}</small>
      </div>
      <h4>{source.name}</h4>
      <strong className="source-scale">{source.scale}</strong>
      <p>{source.description}</p>
      <div className="source-terms">
        <span><b>Reuse</b>{source.license}</span>
        <span><b>DLN policy</b>{source.importPolicy}</span>
      </div>
      <div className="source-tags">{source.tags.map((tag) => <i key={tag}>{tag}</i>)}</div>
      <div className="source-actions">
        <a href={source.url} target="_blank" rel="noreferrer">Visit catalog ↗</a>
        {source.aboutUrl && <a href={source.aboutUrl} target="_blank" rel="noreferrer">Method / source ↗</a>}
      </div>
    </article>
  );
}

function EmptyResult() {
  return <div className="library-empty">No catalog entries match that search.</div>;
}
