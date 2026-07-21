import { useEffect, useMemo, useState } from "react";
import { parseLine, ParseError } from "../src/parser.js";
import { validateLine } from "../src/semantic.js";
import type { Diagnostic, LineDocument } from "../src/model.js";
import type { ComboDetailResponse, ComboListResponse } from "../src/catalog-model.js";
import { comboSources, metaSnapshot, type ComboDetail, type ComboSummary } from "./data";
import { ComboCatalog, comboPath } from "./ComboCatalog";
import { DuelVisualizer } from "./DuelVisualizer";
import { GuideSteps, GuideVisualizer } from "./GuideVisualizer";
import { useWorkspace } from "./workspace-store";

function analyze(source: string, combo: ComboDetail): { document?: LineDocument; diagnostics: Diagnostic[] } {
  try {
    const document = parseLine(source, `${combo.lineSlug}.dln`);
    return { document, diagnostics: validateLine(document, combo.manifest) };
  } catch (error) {
    if (error instanceof ParseError) return { diagnostics: [error.toDiagnostic()] };
    return { diagnostics: [{ source: `${combo.lineSlug}.dln`, message: error instanceof Error ? error.message : String(error) }] };
  }
}

function routeId(): string | undefined {
  const match = window.location.hash.match(/^#\/combos\/([^/]+)\/([^/]+)$/);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

export function App() {
  const { state, dispatch } = useWorkspace();
  const { selectedId, detailView, drafts } = state;
  const { combos, loading: catalogLoading, error: catalogError } = state.catalog;
  const { combo, loading: detailLoading, error: detailError } = state.detail;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: "catalogLoading" });
    fetch("/api/combos", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the combo catalog.");
        return response.json() as Promise<ComboListResponse>;
      })
      .then((response) => dispatch({ type: "catalogLoaded", combos: response.combos }))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) dispatch({ type: "catalogFailed", message: error instanceof Error ? error.message : "Could not load the combo catalog." }); });
    return () => controller.abort();
  }, [dispatch]);

  useEffect(() => {
    if (!selectedId) { dispatch({ type: "detailCleared" }); return; }
    const controller = new AbortController();
    dispatch({ type: "detailLoading" });
    fetch(`/api/combos?id=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error("That combo was not found.");
        if (!response.ok) throw new Error("Could not load this combo.");
        return response.json() as Promise<ComboDetailResponse>;
      })
      .then((response) => dispatch({ type: "detailLoaded", combo: response.combo }))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) dispatch({ type: "detailFailed", message: error instanceof Error ? error.message : "Could not load this combo." }); });
    return () => controller.abort();
  }, [dispatch, selectedId]);

  useEffect(() => {
    const onRouteChange = () => {
      dispatch({ type: "routeChanged", id: routeId() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onRouteChange);
    return () => window.removeEventListener("hashchange", onRouteChange);
  }, [dispatch]);

  const source = combo?.line ? drafts[combo.id] ?? combo.line : "";
  const editorResult = useMemo(() => combo?.line ? analyze(source, combo) : { diagnostics: [] as Diagnostic[] }, [source, combo]);
  const publishedResult = useMemo(() => combo?.line ? analyze(combo.line, combo) : { diagnostics: [] as Diagnostic[] }, [combo]);
  const clean = editorResult.diagnostics.length === 0;

  function openCombo(summary: ComboSummary) {
    dispatch({ type: "routeChanged", id: summary.id });
    window.location.hash = comboPath(summary);
  }

  function browseCombos() {
    dispatch({ type: "routeChanged" });
    window.location.hash = "/combos";
  }

  function updateSource(value: string) {
    if (combo) dispatch({ type: "draftChanged", id: combo.id, source: value });
  }

  function resetSource() {
    if (!combo) return;
    dispatch({ type: "draftReset", id: combo.id });
  }

  async function copySource() {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const selectedSummary = combos.find((item) => item.id === selectedId);
  const accent = combo?.accent ?? selectedSummary?.accent ?? "#87a7ff";
  return (
    <main className="app-shell" style={{ "--accent": accent } as React.CSSProperties}>
      <header className="topbar">
        <button className="brand brand-button" onClick={browseCombos} aria-label="Browse Duel Line Notation combos">
          <span className="brand-mark">D<span>/</span>LN</span><span className="brand-sub">Combo Library</span>
        </button>
        <nav className="topnav" aria-label="Primary navigation"><button className={!selectedId ? "active" : ""} onClick={browseCombos}>Browse combos</button></nav>
        <a className="github-link" href="https://github.com/jlgrimes/duel-line-notation" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
      </header>

      {!selectedId ? (
        <ComboCatalog combos={combos} sources={comboSources} format={combos[0]?.format ?? metaSnapshot.format} loading={catalogLoading} error={catalogError} onOpen={openCombo} />
      ) : detailLoading ? (
        <DetailMessage message="Loading combo…" onBack={browseCombos} />
      ) : !combo ? (
        <DetailMessage message={detailError ?? "That combo was not found."} onBack={browseCombos} />
      ) : (
        <section className="combo-detail">
          <button className="detail-back" onClick={browseCombos}>← All combos</button>
          <header className="detail-header">
            <div><p className="eyebrow">{combo.deckName} · {combo.summon}</p><h1>{combo.title}</h1><p>{combo.summary}</p></div>
            <div className="detail-source"><span>{combo.contentType === "dln" ? "Authored DLN route" : `${combo.sourceLicense ?? "Community"} guide`}</span><a href={combo.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a></div>
          </header>

          <nav className="detail-modes" aria-label="Combo views">
            <button className={detailView === "visual" ? "active" : ""} onClick={() => dispatch({ type: "viewChanged", view: "visual" })}><span>01</span> Visual</button>
            {combo.contentType === "dln" ? <>
              <button className={detailView === "notation" ? "active" : ""} onClick={() => dispatch({ type: "viewChanged", view: "notation" })}><span>02</span> Notation</button>
              <button className={detailView === "trace" ? "active" : ""} onClick={() => dispatch({ type: "viewChanged", view: "trace" })}><span>03</span> Trace</button>
            </> : <button className={detailView === "guide" ? "active" : ""} onClick={() => dispatch({ type: "viewChanged", view: "guide" })}><span>02</span> Steps</button>}
          </nav>

          {detailView === "visual" && (combo.contentType === "dln" ? <DuelVisualizer document={publishedResult.document} manifest={combo.manifest} diagnostics={publishedResult.diagnostics.length} /> : <GuideVisualizer combo={combo} />)}
          {detailView === "guide" && combo.guide && <GuideSteps combo={combo} />}
          {detailView === "notation" && combo.contentType === "dln" && (
            <div className="lab-grid notation-layout">
              <section className="editor-panel" aria-label="DLN editor">
                <div className="panel-toolbar"><div className="file-tab"><span className="file-dot" />{editorResult.document?.name ?? "untitled"}.dln</div><div className="toolbar-actions"><button onClick={resetSource}>Reset</button><button onClick={copySource}>{copied ? "Copied" : "Copy"}</button></div></div>
                <div className="editor-wrap"><div className="line-numbers" aria-hidden="true">{source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea value={source} onChange={(event) => updateSource(event.target.value)} spellCheck={false} aria-label="Edit Duel Line Notation" /></div>
                <div className={`statusbar ${clean ? "valid" : "invalid"}`}><span><i /> {clean ? "Valid DLN" : `${editorResult.diagnostics.length} issue${editorResult.diagnostics.length === 1 ? "" : "s"}`}</span><span>{source.split("\n").length} lines · v0.1</span></div>
              </section>
              <aside className="inspector notation-cards" aria-label="Card aliases"><div className="inspector-section cards-section"><div className="section-title"><span>Alias dictionary</span><b>{Object.keys(combo.manifest.cards).length} cards</b></div><div className="alias-list">{Object.entries(combo.manifest.cards).map(([alias, card]) => <div className="alias-row" key={alias}><code>{alias}</code><span><strong>{card.name}</strong><small>{card.kind}{card.level ? ` · Level ${card.level}` : ""}</small></span></div>)}</div></div></aside>
            </div>
          )}
          {detailView === "trace" && combo.contentType === "dln" && (
            <section className="trace-detail" aria-label="Execution trace">
              <div className="section-title"><span>Execution trace</span><b>{editorResult.document?.steps.length ?? 0} steps</b></div>
              {editorResult.diagnostics.length > 0 && <div className="diagnostics">{editorResult.diagnostics.map((diagnostic, index) => <div key={`${diagnostic.message}-${index}`}><strong>{diagnostic.line ? `L${diagnostic.line}` : "ERR"}</strong>{diagnostic.message}</div>)}</div>}
              {editorResult.document && <div className="trace trace-wide"><StateNode label="Start" value={editorResult.document.start} />{editorResult.document.steps.map((step) => <div className={`trace-step ${step.kind}`} key={step.number}><span className="step-number">{step.number}</span>{step.kind === "action" ? <code>{step.expression}</code> : <div className="chain-block"><strong>CHAIN <small>resolves ↑</small></strong>{[...step.links].reverse().map((link) => <code key={link.number}><b>CL{link.number}</b> {link.expression}</code>)}</div>}</div>)}<StateNode label="End" value={editorResult.document.end} end /></div>}
            </section>
          )}
        </section>
      )}
    </main>
  );
}

function DetailMessage({ message, onBack }: { message: string; onBack: () => void }) {
  return <section className="combo-detail"><button className="detail-back" onClick={onBack}>← All combos</button><div className="catalog-empty">{message}</div></section>;
}

function StateNode({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return <div className={`state-node ${end ? "end" : ""}`}><span>{label}</span><code>{value}</code></div>;
}
