import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ComboDetail } from "../src/catalog-model.js";
import type { DeckManifest } from "../src/model.js";

interface MetaDeck {
  slug: string;
  accent: string;
  summon: string;
}

interface CatalogDeck {
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  lines: Record<string, { title: string }>;
}

export async function loadFileCombos(root = process.cwd()): Promise<ComboDetail[]> {
  const [meta, catalog, verifiedGuides] = await Promise.all([
    readJson<{ format: string; decks: MetaDeck[] }>(join(root, "decks/meta.json")),
    readJson<{ decks: Record<string, CatalogDeck> }>(join(root, "decks/catalog.json")),
    readJson<ComboDetail[]>(join(root, "decks/verified-guides.json")),
  ]);

  const combos = await Promise.all(meta.decks.flatMap((deck) => {
    const details = catalog.decks[deck.slug];
    if (!details) return [];
    return [loadDeckCombos(root, meta.format, deck, details)];
  }));
  return [...combos.flat(), ...verifiedGuides]
    .sort((left, right) => left.deckName.localeCompare(right.deckName) || left.title.localeCompare(right.title));
}

async function loadDeckCombos(root: string, format: string, deck: MetaDeck, details: CatalogDeck): Promise<ComboDetail[]> {
  const deckRoot = join(root, "decks", deck.slug);
  const [manifest, filenames] = await Promise.all([
    readJson<DeckManifest>(join(deckRoot, "deck.json")),
    readdir(join(deckRoot, "lines")),
  ]);

  return Promise.all(filenames.filter((filename) => filename.endsWith(".dln")).map(async (filename) => {
    const line = await readFile(join(deckRoot, "lines", filename), "utf8");
    const lineSlug = line.match(/^@line\s+([^\s]+)$/m)?.[1] ?? filename.replace(/\.dln$/, "");
    const startAliases = line.match(/@start[^\n]*H=\[([^\]]*)\]/)?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const representative = manifest.cards[startAliases[0] ?? ""];
    return {
      id: `${deck.slug}/${lineSlug}`,
      deckSlug: deck.slug,
      lineSlug,
      deckName: manifest.name,
      title: details.lines[lineSlug]?.title ?? titleCase(lineSlug),
      summary: details.summary,
      summon: deck.summon,
      accent: deck.accent,
      format,
      sourceLabel: details.sourceLabel,
      sourceUrl: details.sourceUrl,
      representativeCardName: representative?.name ?? Object.values(manifest.cards)[0]?.name ?? manifest.name,
      handSize: startAliases.length,
      stepCount: line.match(/^\d+\s/gm)?.length ?? 0,
      contentType: "dln",
      manifest,
      line,
    } satisfies ComboDetail;
  }));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function titleCase(value: string): string {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
