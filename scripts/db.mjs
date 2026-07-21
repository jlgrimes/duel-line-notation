import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { loadFileCombos } from "../dist/server/catalog-files.js";
import { fetchOpenComboCodex } from "./open-combo-codex.mjs";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  if (process.argv.includes("--optional")) {
    console.log("No database configured; catalog will use the server-side file fallback.");
    process.exit(0);
  }
  throw new Error("Set DATABASE_URL (or POSTGRES_URL) before running the database setup.");
}

const sql = neon(connectionString);
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
for (const statement of schema.split(/;\s*(?:\n|$)/).map((value) => value.trim()).filter(Boolean)) {
  await sql.query(statement);
}

const localCombos = await loadFileCombos();
let importedCombos = [];
try {
  const imported = await fetchOpenComboCodex();
  importedCombos = imported.combos;
  console.log(`Open Combo Codex snapshot ${imported.revision.slice(0, 7)}: ${importedCombos.length} guides found.`);
} catch (error) {
  console.warn("Open Combo Codex import skipped; existing database guides were preserved.", error);
}

for (const combo of [...localCombos, ...importedCombos]) {
  await sql.query(`
    INSERT INTO combos (
      id, deck_slug, line_slug, deck_name, title, summary, summon, accent, format,
      source_label, source_url, representative_card_name, hand_size, step_count, content_type,
      difficulty, source_license, manifest, line, guide, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb,NOW())
    ON CONFLICT (id) DO UPDATE SET
      deck_name = EXCLUDED.deck_name, title = EXCLUDED.title, summary = EXCLUDED.summary,
      summon = EXCLUDED.summon, accent = EXCLUDED.accent, format = EXCLUDED.format,
      source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
      representative_card_name = EXCLUDED.representative_card_name, hand_size = EXCLUDED.hand_size,
      step_count = EXCLUDED.step_count, content_type = EXCLUDED.content_type,
      difficulty = EXCLUDED.difficulty, source_license = EXCLUDED.source_license,
      manifest = EXCLUDED.manifest, line = EXCLUDED.line, guide = EXCLUDED.guide, updated_at = NOW()
  `, [
    combo.id, combo.deckSlug, combo.lineSlug, combo.deckName, combo.title, combo.summary,
    combo.summon, combo.accent, combo.format, combo.sourceLabel, combo.sourceUrl,
    combo.representativeCardName, combo.handSize, combo.stepCount, combo.contentType,
    combo.difficulty ?? null, combo.sourceLicense ?? null, JSON.stringify(combo.manifest), combo.line ?? null,
    combo.guide ? JSON.stringify(combo.guide) : null,
  ]);
}

console.log(`Database ready: ${localCombos.length} DLN routes and ${importedCombos.length} guide routes upserted.`);
