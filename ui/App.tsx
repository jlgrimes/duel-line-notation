import { useEffect, useMemo, useState } from "react";
import { parseLine, ParseError } from "../src/parser.js";
import { validateLine } from "../src/semantic.js";
import type { Diagnostic, LineDocument } from "../src/model.js";
import { comboSources, fixtures, metaSnapshot, type DeckFixture } from "./data";
import { ComboCatalog, comboPath } from "./ComboCatalog";
import { DuelVisualizer } from "./DuelVisualizer";

type DetailView = "visual" | "notation" | "trace";

function analyze(source: string, fixture: DeckFixture): { document?: LineDocument; diagnostics: Diagnostic[] } {
  try {
    const document = parseLine(source, `${fixture.slug}.dln`);
    return { document, diagnostics: validateLine(document, fixture.manifest) };
  } catch (error) {
    if (error instanceof ParseError) return { diagnostics: [error.toDiagnostic()] };
    return { diagnostics: [{ source: `${fixture.slug}.dln`, message: error instanceof Error ? error.message : String(error) }] };
  }
}

function routeSlug(): string | undefined {
  const match = window.location.hash.match(/^#\/combos\/([^/]+)(?:\/[^/]+)?$/);
  return match?.[1];
}

export function App() {
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(() => routeSlug());
  const [detailView, setDetailView] = useState<DetailView>("visual");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("dln-line-lab-drafts");
    if (!saved) return {};
    try { return JSON.parse(saved) as Record<string, string>; } catch { return {}; }
  });
  const [copied, setCopied] = useState(false);
  const fixture = fixtures.find((item) => item.slug === selectedSlug);
  const source = fixture ? drafts[fixture.slug] ?? fixture.line : "";
  const result = useMemo(() => fixture ? analyze(source, fixture) : { diagnostics: [] as Diagnostic[] }, [source, fixture]);
  const clean = result.diagnostics.length === 0;

  useEffect(() => {
    const onRouteChange = () => {
      setSelectedSlug(routeSlug());
      setDetailView("visual");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onRouteChange);
    return () => window.removeEventListener("hashchange", onRouteChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("dln-line-lab-drafts", JSON.stringify(drafts));
  }, [drafts]);

  function openCombo(combo: DeckFixture) {
    setSelectedSlug(combo.slug);
    setDetailView("visual");
    window.location.hash = comboPath(combo);
  }

  function browseCombos() {
    setSelectedSlug(undefined);
    window.location.hash = "/combos";
  }

  function updateSource(value: string) {
    if (!fixture) return;
    setDrafts((current) => ({ ...current, [fixture.slug]: value }));
  }

  function resetSource() {
    if (!fixture) return;
    setDrafts((current) => {
      const next = { ...current };
      delete next[fixture.slug];
      return next;
    });
  }

  async function copySource() {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const accent = fixture?.accent ?? "#87a7ff";
  return (
    <main className="app-shell" style={{ "--accent": accent } as React.CSSProperties}>
      <header className="topbar">
        <button className="brand brand-button" onClick={browseCombos} aria-label="Browse Duel Line Notation combos">
          <span className="brand-mark">D<span>/</span>LN</span>
          <span className="brand-sub">Combo Library</span>
        </button>
        <nav className="topnav" aria-label="Primary navigation">
          <button className={!fixture ? "active" : ""} onClick={browseCombos}>Browse combos</button>
        </nav>
        <a className="github-link" href="https://github.com/jlgrimes/duel-line-notation" target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>

      {!fixture ? (
        <ComboCatalog fixtures={fixtures} sources={comboSources} format={metaSnapshot.format} onOpen={openCombo} />
      ) : (
        <section className="combo-detail">
          <button className="detail-back" onClick={browseCombos}>← All combos</button>

          <header className="detail-header">
            <div>
              <p className="eyebrow">{fixture.name} · {fixture.summon}</p>
              <h1>{fixture.lineTitle}</h1>
              <p>{fixture.summary}</p>
            </div>
            <div className="detail-source">
              <span>Authored DLN route</span>
              <a href={fixture.sourceUrl} target="_blank" rel="noreferrer">Context source ↗</a>
            </div>
          </header>

          <nav className="detail-modes" aria-label="Combo views">
            <button className={detailView === "visual" ? "active" : ""} onClick={() => setDetailView("visual")}><span>01</span> Visual</button>
            <button className={detailView === "notation" ? "active" : ""} onClick={() => setDetailView("notation")}><span>02</span> Notation</button>
            <button className={detailView === "trace" ? "active" : ""} onClick={() => setDetailView("trace")}><span>03</span> Trace</button>
          </nav>

          {detailView === "visual" && (
            <DuelVisualizer document={result.document} manifest={fixture.manifest} diagnostics={result.diagnostics.length} />
          )}

          {detailView === "notation" && (
            <div className="lab-grid notation-layout">
              <section className="editor-panel" aria-label="DLN editor">
                <div className="panel-toolbar">
                  <div className="file-tab"><span className="file-dot" />{result.document?.name ?? "untitled"}.dln</div>
                  <div className="toolbar-actions">
                    <button onClick={resetSource}>Reset</button>
                    <button onClick={copySource}>{copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
                <div className="editor-wrap">
                  <div className="line-numbers" aria-hidden="true">{source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
                  <textarea value={source} onChange={(event) => updateSource(event.target.value)} spellCheck={false} aria-label="Edit Duel Line Notation" />
                </div>
                <div className={`statusbar ${clean ? "valid" : "invalid"}`}>
                  <span><i /> {clean ? "Valid DLN" : `${result.diagnostics.length} issue${result.diagnostics.length === 1 ? "" : "s"}`}</span>
                  <span>{source.split("\n").length} lines · v0.1</span>
                </div>
              </section>

              <aside className="inspector notation-cards" aria-label="Card aliases">
                <div className="inspector-section cards-section">
                  <div className="section-title"><span>Alias dictionary</span><b>{Object.keys(fixture.manifest.cards).length} cards</b></div>
                  <div className="alias-list">
                    {Object.entries(fixture.manifest.cards).map(([alias, card]) => (
                      <div className="alias-row" key={alias}><code>{alias}</code><span><strong>{card.name}</strong><small>{card.kind}{card.level ? ` · Level ${card.level}` : ""}</small></span></div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {detailView === "trace" && (
            <section className="trace-detail" aria-label="Execution trace">
              <div className="section-title"><span>Execution trace</span><b>{result.document?.steps.length ?? 0} steps</b></div>
              {result.diagnostics.length > 0 && <div className="diagnostics">{result.diagnostics.map((diagnostic, index) => <div key={`${diagnostic.message}-${index}`}><strong>{diagnostic.line ? `L${diagnostic.line}` : "ERR"}</strong>{diagnostic.message}</div>)}</div>}
              {result.document && (
                <div className="trace trace-wide">
                  <StateNode label="Start" value={result.document.start} />
                  {result.document.steps.map((step) => (
                    <div className={`trace-step ${step.kind}`} key={step.number}>
                      <span className="step-number">{step.number}</span>
                      {step.kind === "action" ? <code>{step.expression}</code> : (
                        <div className="chain-block"><strong>CHAIN <small>resolves ↑</small></strong>{[...step.links].reverse().map((link) => <code key={link.number}><b>CL{link.number}</b> {link.expression}</code>)}</div>
                      )}
                    </div>
                  ))}
                  <StateNode label="End" value={result.document.end} end />
                </div>
              )}
            </section>
          )}
        </section>
      )}
    </main>
  );
}

function StateNode({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return <div className={`state-node ${end ? "end" : ""}`}><span>{label}</span><code>{value}</code></div>;
}
