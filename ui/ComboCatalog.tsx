import { useMemo, useState } from "react";
import { COMBO_TAG_GROUPS, groupForTag, type ComboTag, type ComboTagGroup } from "../src/combo-tags.js";
import type { DeckManifest } from "../src/model.js";
import { useCardScans } from "./card-service";
import type { ComboSource, ComboSummary } from "./data";

interface ComboCatalogProps {
  combos: ComboSummary[];
  sources: ComboSource[];
  format: string;
  loading?: boolean;
  error?: string;
  onOpen: (combo: ComboSummary) => void;
}

export function comboPath(combo: ComboSummary): string {
  return `/combos/${combo.deckSlug}/${combo.lineSlug}`;
}

export function ComboCatalog({ combos, sources, format, loading = false, error, onOpen }: ComboCatalogProps) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Partial<Record<ComboTagGroup, ComboTag>>>({});
  const normalized = query.trim().toLowerCase();
  const catalogManifest = useMemo<DeckManifest>(() => ({
    schemaVersion: 1,
    slug: "combo-catalog",
    name: "Combo Catalog",
    cards: Object.fromEntries(combos.map((combo, index) => [`C${index}`, { name: combo.representativeCardName, kind: "monster" as const }])),
  }), [combos]);
  const { scans } = useCardScans(catalogManifest);
  const presentTags = new Set(combos.flatMap((combo) => combo.tags));
  const activeTags = Object.values(selectedTags).filter((tag): tag is ComboTag => tag !== undefined);
  const visible = combos.filter((combo) =>
    [combo.deckName, combo.title, combo.summon, combo.summary, ...combo.tags].join(" ").toLowerCase().includes(normalized)
    && activeTags.every((tag) => combo.tags.includes(tag)),
  );

  function toggleTag(tag: ComboTag) {
    const group = groupForTag(tag);
    setSelectedTags((selected) => ({ ...selected, [group]: selected[group] === tag ? undefined : tag }));
  }

  return (
    <section className="catalog-page" aria-label="Combo catalog">
      <header className="catalog-header">
        <div><p className="eyebrow">{format}</p><h1>Combo Library</h1></div>
        <label className="catalog-search"><span>Search combos</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Deck, starter, summon type…" /></label>
      </header>

      <section className="catalog-filters" aria-label="Filter combo routes">
        {COMBO_TAG_GROUPS.map((group) => {
          const tags = group.tags.filter((tag) => presentTags.has(tag));
          if (tags.length === 0) return null;
          return <div className="filter-group" key={group.id}><span>{group.label}</span><div>{tags.map((tag) => <button type="button" className={selectedTags[group.id] === tag ? "active" : ""} aria-pressed={selectedTags[group.id] === tag} onClick={() => toggleTag(tag)} key={tag}>{tag}<small>{combos.filter((combo) => combo.tags.includes(tag)).length}</small></button>)}</div></div>;
        })}
        {activeTags.length > 0 && <button type="button" className="clear-filters" onClick={() => setSelectedTags({})}>Clear filters</button>}
      </section>

      <div className="catalog-count"><strong>{loading ? "—" : visible.length}</strong> combo route{visible.length === 1 ? "" : "s"}</div>
      <div className="catalog-grid">
        {visible.map((combo) => {
          const scan = scans[combo.representativeCardName];
          return (
            <a className="combo-product" style={{ "--product-accent": combo.accent } as React.CSSProperties} href={`#${comboPath(combo)}`} onClick={(event) => { event.preventDefault(); onOpen(combo); }} key={combo.id}>
              <div className="product-cover">
                {scan ? <img src={scan.imageUrl} alt="" loading="lazy" /> : <span>{combo.deckName.slice(0, 2).toUpperCase()}</span>}
                <i>{combo.summon}</i>
              </div>
              <div className="product-copy">
                <small>{combo.deckName}</small>
                <h2>{combo.title}</h2>
                <p>{combo.summary}</p>
                <div className="product-tags">{combo.tags.filter((tag) => groupForTag(tag) !== "commitment").slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="product-stats"><span>{combo.handSize}-card start</span><span>{combo.stepCount} steps</span><span>{combo.contentType === "dln" ? "DLN" : "Guide"}</span></div>
              </div>
              <b aria-hidden="true">→</b>
            </a>
          );
        })}
        {loading && <div className="catalog-empty">Loading combo catalog…</div>}
        {!loading && error && <div className="catalog-empty">{error}</div>}
        {!loading && !error && visible.length === 0 && <div className="catalog-empty">No combos match that search.</div>}
      </div>

      <footer className="source-shelf">
        <span>More combo catalogs</span>
        <div>{sources.filter((source) => source.status !== "supplemental").map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.name} ↗</a>)}</div>
      </footer>
    </section>
  );
}
