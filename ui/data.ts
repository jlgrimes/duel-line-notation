import type { DeckManifest } from "../src/model.js";
import meta from "../decks/meta.json";
import sourceRegistry from "../decks/sources.json";
import kewlManifest from "../decks/kewl-tune/deck.json";
import brandedManifest from "../decks/branded/deck.json";
import ritualManifest from "../decks/light-and-darkness-ritual/deck.json";
import elfnoteManifest from "../decks/elfnote/deck.json";
import mitsurugiManifest from "../decks/mitsurugi/deck.json";
import strikerManifest from "../decks/sky-striker/deck.json";
import kewlLine from "../decks/kewl-tune/lines/cue-starter.dln?raw";
import brandedLine from "../decks/branded/lines/aluber-fusion.dln?raw";
import ritualLine from "../decks/light-and-darkness-ritual/lines/records-ritual.dln?raw";
import elfnoteLine from "../decks/elfnote/lines/tinia-setup.dln?raw";
import mitsurugiLine from "../decks/mitsurugi/lines/prayers-habakiri.dln?raw";
import strikerLine from "../decks/sky-striker/lines/raye-cycle.dln?raw";

export interface DeckFixture {
  slug: string;
  name: string;
  share: number;
  tops: number;
  accent: string;
  summon: string;
  summary: string;
  lineTitle: string;
  sourceLabel: string;
  sourceUrl: string;
  manifest: DeckManifest;
  line: string;
}

export interface ComboSource {
  id: string;
  name: string;
  url: string;
  aboutUrl?: string;
  kind: string;
  scale: string;
  description: string;
  license: string;
  importPolicy: string;
  status: "source-backed" | "import-ready" | "discovery" | "supplemental";
  tags: string[];
}

const details: Record<string, Omit<DeckFixture, "slug" | "name" | "share" | "tops" | "accent" | "summon">> = {
  "kewl-tune": {
    summary: "Information-heavy Synchro midrange that reads the opponent's hand and layers interaction across both turns.",
    lineTitle: "Cue one-card setup",
    sourceLabel: "Konami WCQ feature coverage",
    sourceUrl: "https://yugiohblog.konami.com/2026/championships/dragon-duel-championship-round-5-feature-match-simon-b-vs-lee-h/",
    manifest: kewlManifest as DeckManifest,
    line: kewlLine,
  },
  branded: {
    summary: "Fusion resource engine with a high ceiling, recursive follow-up, and many build-specific branches.",
    lineTitle: "Aluber into Mirrorjade",
    sourceLabel: "July 2026 Advanced overview",
    sourceUrl: "https://www.tcgplayer.com/content/article/The-Best-Advanced-Decks-in-Yu-Gi-Oh-Right-Now-Post-Ban/948e13fa-57fd-4839-a15f-04564a63704c/",
    manifest: brandedManifest as DeckManifest,
    line: brandedLine,
  },
  "light-and-darkness-ritual": {
    summary: "Ritual midrange built around Mind Shuffle, graveyard recovery, and modern versions of Yugi's classics.",
    lineTitle: "Records plus Ritual setup",
    sourceLabel: "North America WCQ feature match",
    sourceUrl: "https://yugiohblog.konami.com/2026/championships/2026-north-america-wcq/nawcq-round-15-feature-match-michael-kyle-walters-vs-brayden-michael-davis/",
    manifest: ritualManifest as DeckManifest,
    line: ritualLine,
  },
  elfnote: {
    summary: "Position-sensitive Synchro strategy whose center Main Monster Zone is itself a resource.",
    lineTitle: "Tinia center-zone setup",
    sourceLabel: "North America WCQ feature match",
    sourceUrl: "https://yugiohblog.konami.com/2026/ycs/nawcq-round-8-feature-match-aidan-shaw-harden-vs-jackson-thomas-fulmer/",
    manifest: elfnoteManifest as DeckManifest,
    line: elfnoteLine,
  },
  mitsurugi: {
    summary: "Tribute-driven Ritual engine where paying a cost often searches a card and restores the monster you spent.",
    lineTitle: "Prayers plus Habakiri",
    sourceLabel: "July 2026 Advanced overview",
    sourceUrl: "https://www.tcgplayer.com/content/article/The-Best-Advanced-Decks-in-Yu-Gi-Oh-Right-Now-Post-Ban/948e13fa-57fd-4839-a15f-04564a63704c/",
    manifest: mitsurugiManifest as DeckManifest,
    line: mitsurugiLine,
  },
  "sky-striker": {
    summary: "Spell-dense Link control that cycles one pilot through a toolbox of Extra Deck forms.",
    lineTitle: "Raye battle-phase cycle",
    sourceLabel: "July 2026 TCG tier snapshot",
    sourceUrl: meta.source,
    manifest: strikerManifest as DeckManifest,
    line: strikerLine,
  },
};

export const fixtures: DeckFixture[] = meta.decks.map((entry) => ({
  ...entry,
  name: details[entry.slug]!.manifest.name,
  ...details[entry.slug]!,
}));

export const metaSnapshot = meta;
export const comboSources = sourceRegistry.sources as ComboSource[];
export const sourceAudit = { auditedAsOf: sourceRegistry.auditedAsOf };
