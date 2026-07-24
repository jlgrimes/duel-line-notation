/**
 * Builds a card bundle: the ocgcore-shaped records and the Lua scripts for one declared
 * card set.
 *
 *   node scripts/build.mjs                 # every deck under decks/
 *   node scripts/build.mjs mitsurugi       # one deck
 *
 * Output goes to `dist/<slug>.json`, which is ignored by git. The bundle is derived from
 * third-party sources with their own licensing; read README.md before distributing one.
 *
 * The database stores several fields packed into other columns, which this unpacks into
 * the separate fields `OCG_CardData` declares. Those conventions are verified against
 * known cards by test/card-bundle.test.ts.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(packageRoot, "vendor");
const deckRoot = resolve(packageRoot, "decks");
const distRoot = resolve(packageRoot, "dist");
const lock = JSON.parse(readFileSync(resolve(packageRoot, "carddata.lock.json"), "utf8"));

// The unpacking rules live in src/simulator/card-bundle.ts and are pinned by
// test/card-bundle.test.ts, so the build and the runtime cannot drift apart on them.
const { unpackCardRow } = await import("../../../dist/src/simulator/card-bundle.js")
  .catch(() => {
    throw new Error("Run npm run build:cli first: the build reuses the shared unpacking rules.");
  });

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  throw new Error("node:sqlite is unavailable. This build step needs Node.js 22.5 or newer.");
}

const databasePath = resolve(vendorRoot, "carddb", lock.cardDatabase.file);
const scriptRoot = resolve(vendorRoot, "cardscripts");
if (!existsSync(databasePath) || !existsSync(scriptRoot)) {
  throw new Error("Pinned sources are missing. Run npm run carddata:fetch first.");
}

/**
 * The shared library layer: every `.lua` at the root of the script collection, as opposed
 * to the per-card scripts in its subdirectories.
 *
 * All of them are needed, not just the two a host explicitly loads. `constant.lua` and
 * `utility.lua` pull in the rest — counter constants, archetype set codes, and the summon
 * procedure libraries — and a card script that reaches a missing one fails at run time.
 */
function sharedScriptNames() {
  return readdirSync(scriptRoot)
    .filter((name) => name.endsWith(".lua"))
    .sort();
}

/** The two the host must push in itself; the rest are pulled in by these. */
const ENTRY_SCRIPTS = ["constant.lua", "utility.lua"];

function findScript(name) {
  for (const directory of ["", "official", "pre-errata", "pre-release", "goat"]) {
    const path = resolve(scriptRoot, directory, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}

function buildDeck(deckPath) {
  const deck = JSON.parse(readFileSync(deckPath, "utf8"));
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const query = database.prepare(
    "select datas.*, texts.name from datas join texts on texts.id = datas.id where datas.id = ?",
  );

  const cards = [];
  const scripts = {};
  const missing = [];

  for (const shared of sharedScriptNames()) {
    const source = findScript(shared);
    if (source === null) throw new Error(`The pinned script collection is missing ${shared}.`);
    scripts[shared] = source;
  }
  for (const entry of ENTRY_SCRIPTS) {
    if (!(entry in scripts)) throw new Error(`The pinned script collection is missing ${entry}.`);
  }

  // The core probes this for its internal temporary card on every duel; an empty script
  // keeps that out of the miss log.
  scripts["c0.lua"] = "-- intentionally empty: the core probes c0.lua for its temp card\n";

  for (const entry of deck.cards) {
    const row = query.get(entry.code);
    if (!row) {
      missing.push(`${entry.code} (${entry.name}) is not in the pinned database`);
      continue;
    }
    const card = unpackCardRow(row);
    if (entry.name && entry.name !== card.name) {
      missing.push(`${entry.code} is "${card.name}" in the pinned database, not "${entry.name}"`);
      continue;
    }

    const scriptName = `c${entry.code}.lua`;
    const source = findScript(scriptName);
    if (source === null) {
      missing.push(`${entry.code} (${card.name}) has no ${scriptName}`);
      continue;
    }
    scripts[scriptName] = source;
    cards.push(card);
  }

  database.close();

  if (missing.length > 0) {
    throw new Error(`Could not build ${deck.slug}:\n  - ${missing.join("\n  - ")}`);
  }

  return {
    slug: deck.slug,
    name: deck.name,
    sources: {
      cardDatabase: { ...lock.cardDatabase },
      cardScripts: { ...lock.cardScripts },
    },
    // The host loads these two after creating a duel; the core resolves everything else.
    entryScripts: ENTRY_SCRIPTS,
    cards,
    scripts,
  };
}

const requested = process.argv.slice(2);
const deckFiles = readdirSync(deckRoot)
  .filter((name) => name.endsWith(".json"))
  .filter((name) => requested.length === 0 || requested.includes(name.replace(/\.json$/, "")));

if (deckFiles.length === 0) {
  throw new Error(`No decks matched${requested.length > 0 ? ` ${requested.join(", ")}` : ""}.`);
}

/**
 * Also writes a flat form the native bridge harness can read with plain file I/O, so the
 * real records and real scripts can be driven through the real core without a JSON parser
 * and without waiting for a WebAssembly build.
 */
function writeNativeFixture(bundle) {
  const nativeRoot = resolve(distRoot, `${bundle.slug}.native`);
  mkdirSync(nativeRoot, { recursive: true });

  const rows = bundle.cards.map((card) => [
    card.code,
    card.alias,
    card.type,
    card.level,
    card.attribute,
    card.race,
    card.attack,
    card.defense,
    card.leftScale,
    card.rightScale,
    card.linkMarker,
    card.setcodes.join(","),
  ].join("\t"));
  writeFileSync(resolve(nativeRoot, "cards.tsv"), `${rows.join("\n")}\n`);

  const names = Object.keys(bundle.scripts);
  for (const name of names) writeFileSync(resolve(nativeRoot, name), bundle.scripts[name]);
  // A manifest, so the harness does not need a directory walk to find the scripts.
  writeFileSync(resolve(nativeRoot, "scripts.txt"), `${names.join("\n")}\n`);
  return nativeRoot;
}

mkdirSync(distRoot, { recursive: true });
for (const file of deckFiles) {
  const bundle = buildDeck(resolve(deckRoot, file));
  const outputPath = resolve(distRoot, `${bundle.slug}.json`);
  writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  const nativeRoot = writeNativeFixture(bundle);
  const scriptCount = Object.keys(bundle.scripts).length;
  console.log(`${bundle.slug}: ${bundle.cards.length} cards, ${scriptCount} scripts -> ${outputPath}`);
  console.log(`${bundle.slug}: native fixture -> ${nativeRoot}`);
}
