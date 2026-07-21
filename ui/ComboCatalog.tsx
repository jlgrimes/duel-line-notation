import { useMemo, useState } from "react";
import type { DeckManifest } from "../src/model.js";
import { useCardScans } from "./card-service";
import type { ComboSource, DeckFixture } from "./data";

interface ComboCatalogProps {
  fixtures: DeckFixture[];
  sources: ComboSource[];
  format: string;
  onOpen: (fixture: DeckFixture) => void;
}

export function comboPath(fixture: DeckFixture): string {
  const lineSlug = fixture.line.match(/^@line\s+([^\s]+)$/m)?.[1] ?? "line";
  return `/combos/${fixture.slug}/${lineSlug}`;
}

export function ComboCatalog({ fixtures, sources, format, onOpen }: ComboCatalogProps) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const cards = useMemo(() => fixtures.map((fixture) => ({ fixture, representative: representativeCard(fixture) })), [fixtures]);
  const catalogManifest = useMemo<DeckManifest>(() => ({
    schemaVersion: 1,
    slug: "combo-catalog",
    name: "Combo Catalog",
    cards: Object.fromEntries(cards.flatMap(({ representative }, index) => representative ? [[`C${index}`, representative]] : [])),
  }), [cards]);
  const { scans } = useCardScans(catalogManifest);
  const visible = cards.filter(({ fixture }) => [fixture.name, fixture.lineTitle, fixture.summon, fixture.summary].join(" ").toLowerCase().includes(normalized));

  return (
    <section className="catalog-page" aria-label="Combo catalog">
      <header className="catalog-header">
        <div><p className="eyebrow">{format}</p><h1>Combo Library</h1></div>
        <label className="catalog-search"><span>Search combos</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Deck, starter, summon type…" /></label>
      </header>

      <div className="catalog-count"><strong>{visible.length}</strong> playable combo{visible.length === 1 ? "" : "s"}</div>
      <div className="catalog-grid">
        {visible.map(({ fixture, representative }) => {
          const scan = representative ? scans[representative.name] : undefined;
          const steps = fixture.line.match(/^\d+\s/gm)?.length ?? 0;
          const hand = fixture.line.match(/@start[^\n]*H=\[([^\]]*)\]/)?.[1]?.split(",").filter(Boolean).length ?? 0;
          return (
            <a className="combo-product" style={{ "--product-accent": fixture.accent } as React.CSSProperties} href={`#${comboPath(fixture)}`} onClick={(event) => { event.preventDefault(); onOpen(fixture); }} key={fixture.slug}>
              <div className="product-cover">
                {scan ? <img src={scan.imageUrl} alt="" loading="lazy" /> : <span>{fixture.name.slice(0, 2).toUpperCase()}</span>}
                <i>{fixture.summon}</i>
              </div>
              <div className="product-copy">
                <small>{fixture.name}</small>
                <h2>{fixture.lineTitle}</h2>
                <div><span>{hand}-card start</span><span>{steps} steps</span></div>
              </div>
              <b aria-hidden="true">→</b>
            </a>
          );
        })}
        {visible.length === 0 && <div className="catalog-empty">No combos match that search.</div>}
      </div>

      <footer className="source-shelf">
        <span>More combo catalogs</span>
        <div>{sources.filter((source) => source.status !== "supplemental").map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.name} ↗</a>)}</div>
      </footer>
    </section>
  );
}

function representativeCard(fixture: DeckFixture) {
  const alias = fixture.line.match(/@start[^\n]*H=\[\s*([A-Z][A-Z0-9_]*)/)?.[1];
  return alias ? fixture.manifest.cards[alias] : undefined;
}
