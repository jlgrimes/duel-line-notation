import type { ComboGuide } from "./catalog-model.js";
import type { CardDefinition, DeckManifest } from "./model.js";
import type { CardMovement, PlaybackFrame, PlaybackSequence, VisualCard, VisualFieldSlot, VisualZone } from "./visualizer.js";

export function buildGuidePlayback(guide: ComboGuide, manifest: DeckManifest): PlaybackSequence {
  const definitions = Object.entries(manifest.cards);
  const starterNames = new Set(guide.starterCards);
  const extraNames = new Set(definitions.flatMap(([, card]) => isExtraDeckCard(card, guide.steps) ? [card.name] : []));
  const cards = definitions.map(([alias, card], index) => createCard(alias, card, extraNames.has(card.name) ? "X" : starterNames.has(card.name) ? "H" : "D", index));
  const frames: PlaybackFrame[] = [{
    key: "guide-start",
    stepNumber: 0,
    label: "Opening state",
    expression: guide.prerequisites.join(" · ") || guide.starterCards.join(" + "),
    lp: 8000,
    cards: cloneCards(cards),
    activeAliases: [],
    movements: [],
  }];

  guide.steps.forEach((step, index) => {
    const active = definitions.filter(([, card]) => mentions(step, card.name)).map(([alias]) => alias);
    const movements: CardMovement[] = [];
    for (const alias of active) {
      const card = cards.find((candidate) => candidate.alias === alias)!;
      const target = inferTarget(step, card, manifest.cards[alias]!);
      if (!target || target === card.zone) continue;
      const from = card.zone;
      if (from === "F") delete card.fieldSlot;
      card.zone = target;
      card.faceUp = target !== "D" && target !== "X";
      if (target === "F") card.fieldSlot = chooseFieldSlot(cards, card, isExtraSummon(step, card.name));
      movements.push({ cardId: card.id, alias, from, to: target });
    }
    frames.push({
      key: `guide-step-${index + 1}`,
      stepNumber: index + 1,
      label: describeStep(step),
      expression: step,
      lp: 8000,
      cards: cloneCards(cards),
      activeAliases: active,
      movements,
    });
  });

  return { frames, declaredEnd: guide.endBoard };
}

function createCard(alias: string, definition: CardDefinition, zone: VisualZone, index: number): VisualCard {
  return {
    id: `guide-${alias.toLowerCase()}-${index}`,
    alias,
    name: definition.name,
    kind: definition.kind,
    ...(definition.level === undefined ? {} : { level: definition.level }),
    zone,
    faceUp: zone === "H",
  };
}

function inferTarget(step: string, card: VisualCard, definition: CardDefinition): VisualZone | undefined {
  const { before, after, context } = cardContext(step, card.name);
  if (/\b(?:normal|special|ritual|fusion|synchro|xyz|link) summon\s*$/.test(before)) return "F";
  if (/\b(?:add|search|searched|recover|recovered|return)\s+(?:a |an |the )?$/.test(before)) return "H";
  if (/\bset\s*$/.test(before)) return "F";
  if (definition.kind !== "monster" && /\bactivate\s*$/.test(before)) return "F";
  if (card.zone === "X" && /\b(?:use|summon|establish|convert|finish)\b/.test(context)) return "F";
  if ((definition.kind !== "monster" || /\bspell\b/.test(context)) && /\b(?:use|resolve|activate)\b/.test(context)) return "F";
  if (/\bbanish(?:ed|ing)?\b/.test(context)) return "B";
  if (/\b(?:using|tribute|tributed|send|sent|destroy|destroyed)\s*$/.test(before) || /^(?:'s quick effect, )?(?:by )?tribut(?:e|ing)|^\s*(?:to |and )?(?:send|destroy)/.test(after)) return card.zone === "D" ? undefined : "G";
  if (/\b(?:add|search|searched|recover|recovered|return)\b/.test(context)) return "H";
  if (/\b(?:normal|special|ritual|fusion|synchro|xyz|link) summon\b/.test(context)) return "F";
  if (/\bset\b/.test(context)) return "F";
  if (definition.kind !== "monster" && /\bactivate\b/.test(context)) return "F";
  return undefined;
}

function cardContext(step: string, name: string): { before: string; after: string; context: string } {
  const lower = step.toLowerCase();
  const at = lower.indexOf(name.toLowerCase());
  if (at < 0) return { before: lower, after: "", context: lower };
  const before = lower.slice(Math.max(0, at - 70), at);
  const after = lower.slice(at + name.length, Math.min(lower.length, at + name.length + 70));
  return { before, after, context: `${before} ${after}` };
}

function isExtraDeckCard(card: CardDefinition, steps: string[]): boolean {
  return card.level === 0 || steps.some((step) => {
    if (isExtraSummon(step, card.name)) return true;
    const { context } = cardContext(step, card.name);
    return /\b(?:link ace|extra monster zone|summon condition|convert into)\b/.test(context);
  });
}

function isExtraSummon(step: string, name: string): boolean {
  const before = step.toLowerCase().split(name.toLowerCase())[0] ?? "";
  return /\b(?:fusion|synchro|xyz|link) summon\s*$/.test(before.slice(-65));
}

function chooseFieldSlot(cards: VisualCard[], card: VisualCard, extraSummon: boolean): VisualFieldSlot {
  const choices: VisualFieldSlot[] = extraSummon
    ? ["EMZ1", "EMZ2", "M1", "M2", "M3", "M4", "M5"]
    : card.kind === "monster"
      ? ["M1", "M2", "M3", "M4", "M5"]
      : ["S1", "S2", "S3", "S4", "S5"];
  return choices.find((slot) => !cards.some((candidate) => candidate !== card && candidate.zone === "F" && candidate.fieldSlot === slot)) ?? choices.at(-1)!;
}

function mentions(step: string, name: string): boolean {
  return step.toLowerCase().includes(name.toLowerCase());
}

function describeStep(step: string): string {
  const label = step.match(/\b(Normal Summon|Special Summon|Ritual Summon|Fusion Summon|Synchro Summon|Xyz Summon|Link Summon|Activate|Set|Search|Add|Attack)\b/i)?.[1];
  return label ?? "Resolve guide step";
}

function cloneCards(cards: VisualCard[]): VisualCard[] {
  return cards.map((card) => ({ ...card }));
}
