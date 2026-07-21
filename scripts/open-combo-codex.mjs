import { parse as parseYaml } from "yaml";

const REPOSITORY = "Siebe-Uy/Open-Combo-Codex";
const COMMIT_URL = `https://api.github.com/repos/${REPOSITORY}/commits/main`;
const ACCENTS = {
  branded: "#b06cff",
  doomz: "#ff6961",
  dracotail: "#d88f5d",
  "kewl-tune": "#ff5c7a",
  mitsurugi: "#ef8354",
  "sky-striker": "#68a7ff",
};
const DECK_NAMES = {
  branded: "Branded",
  doomz: "DoomZ",
  dracotail: "Dracotail",
  "kewl-tune": "Kewl Tune",
  mitsurugi: "Mitsurugi",
  "sky-striker": "Sky Striker",
};
const SUMMONS = {
  branded: "Fusion",
  doomz: "Xyz",
  dracotail: "Fusion",
  "kewl-tune": "Synchro",
  mitsurugi: "Ritual",
  "sky-striker": "Link",
};

export async function fetchOpenComboCodex() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "DLN-Combo-Importer/0.1" };
  const commitResponse = await fetch(COMMIT_URL, { headers });
  if (!commitResponse.ok) throw new Error(`Open Combo Codex revision request failed (${commitResponse.status}).`);
  const revision = (await commitResponse.json()).sha;
  const treeResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/trees/${revision}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error(`Open Combo Codex tree request failed (${treeResponse.status}).`);
  const tree = await treeResponse.json();
  const paths = tree.tree.map((entry) => entry.path).filter((path) => /^content\/combos\/[^/]+\/[^/]+\.md$/.test(path)).sort();
  const documents = await Promise.all(paths.map(async (path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${revision}/${path}`);
    if (!response.ok) throw new Error(`Could not fetch ${path} (${response.status}).`);
    return { path, source: await response.text() };
  }));
  const parsed = documents.map(({ path, source }) => ({ path, data: parseFrontmatter(source) }));
  const cardDefinitions = await resolveCards([...new Set(parsed.flatMap(({ data }) => data.cardNames ?? []))]);
  return {
    revision,
    combos: parsed.map(({ path, data }) => toCombo(path, data, revision, cardDefinitions)),
  };
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("Open Combo Codex document has no YAML frontmatter.");
  return parseYaml(match[1]);
}

function toCombo(path, data, revision, definitions) {
  const engine = String(data.engineId);
  const filename = path.split("/").at(-1).replace(/\.md$/, "");
  const cardNames = array(data.cardNames);
  const starterCards = array(data.starterCards);
  const manifestCards = Object.fromEntries(cardNames.map((name, index) => [`C${index + 1}`, definitions[name] ?? { name, kind: "monster" }]));
  const guide = {
    contributor: String(data.contributor ?? "Open Combo Codex community"),
    starterCards,
    cardNames,
    prerequisites: array(data.prerequisites),
    steps: array(data.steps),
    notes: array(data.notes),
    endBoard: String(data.endBoard ?? "See the source guide for the resulting board."),
    variants: array(data.variants),
    tags: array(data.tags),
    ...(data.turnPreference ? { turnPreference: String(data.turnPreference) } : {}),
    ...(typeof data.otkPotential === "boolean" ? { otkPotential: data.otkPotential } : {}),
  };
  return {
    id: `${engine}/occ-${filename}`,
    deckSlug: engine,
    lineSlug: `occ-${filename}`,
    deckName: DECK_NAMES[engine] ?? titleCase(engine),
    title: String(data.title ?? titleCase(filename)),
    summary: guide.endBoard,
    summon: SUMMONS[engine] ?? "Engine",
    accent: ACCENTS[engine] ?? "#87a7ff",
    format: "Community guide",
    sourceLabel: `Open Combo Codex · @${guide.contributor}`,
    sourceUrl: `https://github.com/${REPOSITORY}/blob/${revision}/${path}`,
    representativeCardName: starterCards[0] ?? cardNames[0] ?? DECK_NAMES[engine] ?? engine,
    handSize: Number(data.cardCount ?? starterCards.length),
    stepCount: guide.steps.length,
    contentType: "guide",
    difficulty: String(data.difficulty ?? "Unrated"),
    sourceLicense: "MIT",
    manifest: { schemaVersion: 1, slug: engine, name: DECK_NAMES[engine] ?? titleCase(engine), cards: manifestCards },
    guide,
  };
}

async function resolveCards(names) {
  const definitions = {};
  try {
    for (const batch of chunk(names, 35)) {
      const url = new URL("https://db.ygoprodeck.com/api/v7/cardinfo.php");
      url.searchParams.set("name", batch.join("|"));
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "DLN-Combo-Importer/0.1" } });
      if (!response.ok) continue;
      const payload = await response.json();
      for (const card of payload.data ?? []) {
        definitions[card.name] = {
          name: card.name,
          kind: card.type.includes("Spell") ? "spell" : card.type.includes("Trap") ? "trap" : "monster",
          ...(card.level === undefined ? {} : { level: card.level }),
        };
      }
    }
  } catch (error) {
    console.warn("Card typing lookup failed; imported guides will use generic monster cards.", error);
  }
  return definitions;
}

function array(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function titleCase(value) {
  return String(value).split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
