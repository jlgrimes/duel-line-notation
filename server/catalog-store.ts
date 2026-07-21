import { neon } from "@neondatabase/serverless";
import type { ComboDetail, ComboSummary } from "../src/catalog-model.js";
import type { DeckManifest } from "../src/model.js";
import { loadFileCombos } from "./catalog-files.js";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export async function listCombos(query = ""): Promise<{ combos: ComboSummary[]; backend: "database" | "file-fallback" }> {
  if (!connectionString) return { combos: filterFileCombos(await loadFileCombos(), query).map(toSummary), backend: "file-fallback" };
  const sql = neon(connectionString);
  const search = `%${query.trim()}%`;
  const rows = await sql.query(`
    SELECT id, deck_slug, line_slug, deck_name, title, summary, summon, accent, format,
      source_label, source_url, representative_card_name, hand_size, step_count
    FROM combos
    WHERE $1 = '%%' OR deck_name ILIKE $1 OR title ILIKE $1 OR summary ILIKE $1 OR summon ILIKE $1
    ORDER BY deck_name, title
  `, [search]) as DatabaseCombo[];
  return { combos: rows.map(fromDatabaseSummary), backend: "database" };
}

export async function getCombo(id: string): Promise<{ combo?: ComboDetail; backend: "database" | "file-fallback" }> {
  if (!connectionString) {
    const combo = (await loadFileCombos()).find((candidate) => candidate.id === id);
    return combo ? { combo, backend: "file-fallback" } : { backend: "file-fallback" };
  }
  const sql = neon(connectionString);
  const rows = await sql.query(`
    SELECT id, deck_slug, line_slug, deck_name, title, summary, summon, accent, format,
      source_label, source_url, representative_card_name, hand_size, step_count, manifest, line
    FROM combos WHERE id = $1 LIMIT 1
  `, [id]) as DatabaseCombo[];
  const row = rows[0];
  return row ? { combo: { ...fromDatabaseSummary(row), manifest: asManifest(row.manifest), line: row.line! }, backend: "database" } : { backend: "database" };
}

interface DatabaseCombo {
  id: string;
  deck_slug: string;
  line_slug: string;
  deck_name: string;
  title: string;
  summary: string;
  summon: string;
  accent: string;
  format: string;
  source_label: string;
  source_url: string;
  representative_card_name: string;
  hand_size: number;
  step_count: number;
  manifest?: unknown;
  line?: string;
}

function fromDatabaseSummary(row: DatabaseCombo): ComboSummary {
  return {
    id: row.id,
    deckSlug: row.deck_slug,
    lineSlug: row.line_slug,
    deckName: row.deck_name,
    title: row.title,
    summary: row.summary,
    summon: row.summon,
    accent: row.accent,
    format: row.format,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    representativeCardName: row.representative_card_name,
    handSize: Number(row.hand_size),
    stepCount: Number(row.step_count),
  };
}

function toSummary({ manifest: _manifest, line: _line, ...summary }: ComboDetail): ComboSummary {
  return summary;
}

function filterFileCombos(combos: ComboDetail[], query: string): ComboDetail[] {
  const normalized = query.trim().toLowerCase();
  return combos.filter((combo) => [combo.deckName, combo.title, combo.summary, combo.summon].join(" ").toLowerCase().includes(normalized));
}

function asManifest(value: unknown): DeckManifest {
  return (typeof value === "string" ? JSON.parse(value) : value) as DeckManifest;
}
