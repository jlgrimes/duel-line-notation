import { neon } from "@neondatabase/serverless";
import type { ComboDetail, ComboSummary } from "../src/catalog-model.js";
import type { ComboTag } from "../src/combo-tags.js";
import { COMBO_TAG_GROUPS } from "../src/combo-tags.js";
import type { DeckManifest } from "../src/model.js";
import { loadFileCombos } from "./catalog-files.js";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export async function listCombos(query = ""): Promise<{ combos: ComboSummary[]; backend: "database" | "file-fallback" }> {
  if (!connectionString) return { combos: filterFileCombos(await loadFileCombos(), query).map(toSummary), backend: "file-fallback" };
  const sql = neon(connectionString);
  const search = `%${query.trim()}%`;
  const rows = await sql.query(`
    SELECT id, deck_slug, line_slug, deck_name, title, summary, summon, accent, format,
      source_label, source_url, representative_card_name, hand_size, step_count,
      content_type, difficulty, source_license, tags
    FROM combos
    WHERE $1 = '%%' OR deck_name ILIKE $1 OR title ILIKE $1 OR summary ILIKE $1 OR summon ILIKE $1 OR tags::text ILIKE $1
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
      source_label, source_url, representative_card_name, hand_size, step_count,
      content_type, difficulty, source_license, tags, manifest, line, guide
    FROM combos WHERE id = $1 LIMIT 1
  `, [id]) as DatabaseCombo[];
  const row = rows[0];
  return row ? {
    combo: {
      ...fromDatabaseSummary(row),
      manifest: asManifest(row.manifest),
      ...(row.line ? { line: row.line } : {}),
      ...(row.guide ? { guide: asGuide(row.guide) } : {}),
    },
    backend: "database",
  } : { backend: "database" };
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
  content_type: "dln" | "guide";
  difficulty?: string | null;
  source_license?: string | null;
  tags?: unknown;
  manifest?: unknown;
  line?: string | null;
  guide?: unknown;
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
    contentType: row.content_type,
    ...(row.difficulty ? { difficulty: row.difficulty } : {}),
    ...(row.source_license ? { sourceLicense: row.source_license } : {}),
    tags: asTags(row.tags),
  };
}

function toSummary({ manifest: _manifest, line: _line, guide: _guide, ...summary }: ComboDetail): ComboSummary {
  return summary;
}

function filterFileCombos(combos: ComboDetail[], query: string): ComboDetail[] {
  const normalized = query.trim().toLowerCase();
  return combos.filter((combo) => [combo.deckName, combo.title, combo.summary, combo.summon].join(" ").toLowerCase().includes(normalized));
}

function asManifest(value: unknown): DeckManifest {
  return (typeof value === "string" ? JSON.parse(value) : value) as DeckManifest;
}

function asGuide(value: unknown): NonNullable<ComboDetail["guide"]> {
  return (typeof value === "string" ? JSON.parse(value) : value) as NonNullable<ComboDetail["guide"]>;
}

function asTags(value: unknown): ComboTag[] {
  const parsed = (typeof value === "string" ? JSON.parse(value) : value) as unknown;
  const allowed = new Set<string>(COMBO_TAG_GROUPS.flatMap((group) => [...group.tags]));
  return Array.isArray(parsed) ? parsed.filter((tag): tag is ComboTag => typeof tag === "string" && allowed.has(tag)) : [];
}
