import { useEffect, useMemo, useState } from "react";
import { parseLine, ParseError } from "../src/parser.js";
import { validateLine } from "../src/semantic.js";
import type { Diagnostic, LineDocument } from "../src/model.js";
import { comboSources, fixtures, metaSnapshot, sourceAudit, type DeckFixture } from "./data";
import { DuelVisualizer } from "./DuelVisualizer";
import { ComboLibrary } from "./ComboLibrary";

type MobilePanel = "code" | "trace" | "cards";
type WorkspaceView = "notation" | "duel" | "library";

function analyze(source: string, fixture: DeckFixture): { document?: LineDocument; diagnostics: Diagnostic[] } {
  try {
    const document = parseLine(source, `${fixture.slug}.dln`);
    return { document, diagnostics: validateLine(document, fixture.manifest) };
  } catch (error) {
    if (error instanceof ParseError) return { diagnostics: [error.toDiagnostic()] };
    return { diagnostics: [{ source: `${fixture.slug}.dln`, message: error instanceof Error ? error.message : String(error) }] };
  }
}

export function App() {
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]!.slug);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("dln-line-lab-drafts");
    if (!saved) return {};
    try { return JSON.parse(saved) as Record<string, string>; } catch { return {}; }
  });
  const [panel, setPanel] = useState<MobilePanel>("code");
  const [view, setView] = useState<WorkspaceView>("notation");
  const [copied, setCopied] = useState(false);
  const fixture = fixtures.find((item) => item.slug === selectedSlug) ?? fixtures[0]!;
  const source = drafts[fixture.slug] ?? fixture.line;
  const result = useMemo(() => analyze(source, fixture), [source, fixture]);
  const clean = result.diagnostics.length === 0;

  useEffect(() => {
    localStorage.setItem("dln-line-lab-drafts", JSON.stringify(drafts));
  }, [drafts]);

  function selectDeck(slug: string) {
    setSelectedSlug(slug);
    setPanel("code");
  }

  function openLine(slug: string) {
    selectDeck(slug);
    setView("notation");
  }

  function updateSource(value: string) {
    setDrafts((current) => ({ ...current, [fixture.slug]: value }));
  }

  function resetSource() {
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

  return (
    <main className="app-shell" style={{ "--accent": fixture.accent } as React.CSSProperties}>
      <header className="topbar">
        <a className="brand" href="https://github.com/jlgrimes/duel-line-notation" aria-label="Duel Line Notation on GitHub">
          <span className="brand-mark">D<span>/</span>LN</span>
          <span className="brand-sub">Line Lab</span>
        </a>
        <div className="format-stamp">
          <span className="pulse" />
          {metaSnapshot.format}
          <span className="muted">as of {metaSnapshot.asOf}</span>
        </div>
        <a className="github-link" href="https://github.com/jlgrimes/duel-line-notation" target="_blank" rel="noreferrer">
          View source <span aria-hidden="true">↗</span>
        </a>
      </header>

      <div className="workspace">
        <aside className="deck-rail" aria-label="Current top decks">
          <div className="rail-heading">
            <p>Current field</p>
            <span>{metaSnapshot.scope}</span>
          </div>
          <nav className="deck-list">
            {fixtures.map((deck, index) => (
              <button
                className={`deck-button ${deck.slug === fixture.slug ? "active" : ""}`}
                key={deck.slug}
                onClick={() => selectDeck(deck.slug)}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="deck-button-copy">
                  <strong>{deck.name}</strong>
                  <span>{deck.summon} · {deck.tops} tops</span>
                  <span className="share-track"><i style={{ width: `${deck.share / fixtures[0]!.share * 100}%`, background: deck.accent }} /></span>
                </span>
                <b>{deck.share.toFixed(1)}%</b>
              </button>
            ))}
          </nav>
          <a className="source-note" href={metaSnapshot.source} target="_blank" rel="noreferrer">
            Tournament snapshot ↗
          </a>
        </aside>

        <section className="lab">
          <div className="deck-header">
            <div>
              <p className="eyebrow">{fixture.summon} system / {fixture.share.toFixed(2)}% of tops</p>
              <h1>{fixture.name}</h1>
              <p>{fixture.summary}</p>
            </div>
            <div className="line-meta">
              <span>Authored reference fixture</span>
              <strong>{fixture.lineTitle}</strong>
              <a href={fixture.sourceUrl} target="_blank" rel="noreferrer">{fixture.sourceLabel} ↗</a>
              <small>Needs route-by-route replay verification</small>
            </div>
          </div>

          <div className="view-tabs" role="tablist" aria-label="Line Lab views">
            <button role="tab" aria-selected={view === "notation"} className={view === "notation" ? "active" : ""} onClick={() => setView("notation")}>
              <span>01</span> Notation Lab
            </button>
            <button role="tab" aria-selected={view === "duel"} className={view === "duel" ? "active" : ""} onClick={() => setView("duel")}>
              <span>02</span> Duel View <i>New</i>
            </button>
            <button role="tab" aria-selected={view === "library"} className={view === "library" ? "active" : ""} onClick={() => setView("library")}>
              <span>03</span> Combo Library
            </button>
          </div>

          {view === "notation" ? (
            <>
              <div className="mobile-tabs" role="tablist" aria-label="Sandbox panels">
                {(["code", "trace", "cards"] as MobilePanel[]).map((item) => (
                  <button key={item} className={panel === item ? "active" : ""} onClick={() => setPanel(item)}>{item}</button>
                ))}
              </div>

              <div className="lab-grid">
                <section className={`editor-panel panel-${panel}`} aria-label="DLN editor">
              <div className="panel-toolbar">
                <div className="file-tab"><span className="file-dot" />{result.document?.name ?? "untitled"}.dln</div>
                <div className="toolbar-actions">
                  <button onClick={resetSource}>Reset</button>
                  <button onClick={copySource}>{copied ? "Copied" : "Copy"}</button>
                </div>
              </div>
              <div className="editor-wrap">
                <div className="line-numbers" aria-hidden="true">
                  {source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
                </div>
                <textarea
                  value={source}
                  onChange={(event) => updateSource(event.target.value)}
                  spellCheck={false}
                  aria-label="Edit Duel Line Notation"
                />
              </div>
              <div className={`statusbar ${clean ? "valid" : "invalid"}`}>
                <span><i /> {clean ? "Valid DLN" : `${result.diagnostics.length} issue${result.diagnostics.length === 1 ? "" : "s"}`}</span>
                <span>{source.split("\n").length} lines · v0.1</span>
              </div>
                </section>

                <aside className={`inspector panel-${panel}`} aria-label="Parsed line inspector">
              <div className="inspector-section trace-section">
                <div className="section-title"><span>Execution trace</span><b>{result.document?.steps.length ?? 0} steps</b></div>
                {result.diagnostics.length > 0 && (
                  <div className="diagnostics">
                    {result.diagnostics.map((diagnostic, index) => (
                      <div key={`${diagnostic.message}-${index}`}><strong>{diagnostic.line ? `L${diagnostic.line}` : "ERR"}</strong>{diagnostic.message}</div>
                    ))}
                  </div>
                )}
                {result.document && (
                  <div className="trace">
                    <StateNode label="Start" value={result.document.start} />
                    {result.document.steps.map((step) => (
                      <div className={`trace-step ${step.kind}`} key={step.number}>
                        <span className="step-number">{step.number}</span>
                        {step.kind === "action" ? (
                          <code>{step.expression}</code>
                        ) : (
                          <div className="chain-block">
                            <strong>CHAIN <small>resolves ↑</small></strong>
                            {[...step.links].reverse().map((link) => <code key={link.number}><b>CL{link.number}</b> {link.expression}</code>)}
                          </div>
                        )}
                      </div>
                    ))}
                    <StateNode label="End" value={result.document.end} end />
                  </div>
                )}
              </div>

              <div className="inspector-section cards-section">
                <div className="section-title"><span>Alias dictionary</span><b>{Object.keys(fixture.manifest.cards).length} cards</b></div>
                <div className="alias-list">
                  {Object.entries(fixture.manifest.cards).map(([alias, card]) => (
                    <div className="alias-row" key={alias}>
                      <code>{alias}</code>
                      <span><strong>{card.name}</strong><small>{card.kind}{card.level ? ` · Level ${card.level}` : ""}</small></span>
                    </div>
                  ))}
                </div>
              </div>
                </aside>
              </div>
            </>
          ) : view === "duel" ? (
            <DuelVisualizer document={result.document} manifest={fixture.manifest} diagnostics={result.diagnostics.length} />
          ) : (
            <ComboLibrary fixtures={fixtures} sources={comboSources} auditedAsOf={sourceAudit.auditedAsOf} onOpenLine={openLine} />
          )}
        </section>
      </div>
    </main>
  );
}

function StateNode({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return (
    <div className={`state-node ${end ? "end" : ""}`}>
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
