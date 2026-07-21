import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { loadFileCombos } from "../dist/server/catalog-files.js";

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

const combos = await loadFileCombos();
for (const combo of combos) {
  await sql.query(`
    INSERT INTO combos (
      id, deck_slug, line_slug, deck_name, title, summary, summon, accent, format,
      source_label, source_url, representative_card_name, hand_size, step_count, manifest, line, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,NOW())
    ON CONFLICT (id) DO UPDATE SET
      deck_name = EXCLUDED.deck_name, title = EXCLUDED.title, summary = EXCLUDED.summary,
      summon = EXCLUDED.summon, accent = EXCLUDED.accent, format = EXCLUDED.format,
      source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
      representative_card_name = EXCLUDED.representative_card_name, hand_size = EXCLUDED.hand_size,
      step_count = EXCLUDED.step_count, manifest = EXCLUDED.manifest, line = EXCLUDED.line, updated_at = NOW()
  `, [
    combo.id, combo.deckSlug, combo.lineSlug, combo.deckName, combo.title, combo.summary,
    combo.summon, combo.accent, combo.format, combo.sourceLabel, combo.sourceUrl,
    combo.representativeCardName, combo.handSize, combo.stepCount, JSON.stringify(combo.manifest), combo.line,
  ]);
}

console.log(`Database ready: ${combos.length} combos upserted.`);
