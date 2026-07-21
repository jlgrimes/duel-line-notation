import type { CardDefinition, DeckManifest, LineDocument } from "./model.js";

export type VisualZone = "H" | "D" | "F" | "G" | "B" | "X";

export interface VisualCard {
  id: string;
  alias: string;
  name: string;
  kind: CardDefinition["kind"];
  level?: number;
  zone: VisualZone;
  faceUp: boolean;
}

export interface CardMovement {
  cardId: string;
  alias: string;
  from: VisualZone;
  to: VisualZone;
}

export interface PlaybackFrame {
  key: string;
  stepNumber: number;
  chainLink?: number;
  chainSize?: number;
  chainPhase?: "activation" | "resolution";
  label: string;
  expression: string;
  lp: number;
  cards: VisualCard[];
  activeAliases: string[];
  movements: CardMovement[];
}

export interface PlaybackSequence {
  frames: PlaybackFrame[];
  declaredEnd: string;
}

const MOVEMENT = /\b([A-Z][A-Z0-9_]*)(?:#[A-Z0-9]+)?:([HDFGBX])>([HDFGBX])\b/g;
const GENERIC_MOVEMENT = /\b(DRAW|BAN)\s+([HDFGBX])>([HDFGBX])\b/g;
const CARD_REFERENCE = /\b([A-Z][A-Z0-9_]{1,})(?:#[A-Z0-9]+)?\b/g;

export function buildPlayback(document: LineDocument, manifest: DeckManifest): PlaybackSequence {
  let serial = 0;
  let state = parseState(document.start, manifest, () => ++serial);
  const frames: PlaybackFrame[] = [{
    key: "start",
    stepNumber: 0,
    label: "Opening state",
    expression: document.start,
    lp: state.lp,
    cards: cloneCards(state.cards),
    activeAliases: [],
    movements: [],
  }];

  for (const step of document.steps) {
    if (step.kind === "action") {
      const applied = applyExpression(state, step.expression, manifest, () => ++serial);
      state = applied.state;
      frames.push({
        key: `step-${step.number}`,
        stepNumber: step.number,
        label: describeExpression(step.expression),
        expression: step.expression,
        lp: state.lp,
        cards: cloneCards(state.cards),
        activeAliases: referencedCards(step.expression, manifest),
        movements: applied.movements,
      });
      continue;
    }

    for (const link of step.links) {
      const parts = splitChainExpression(link.expression);
      const applied = applyExpression(state, parts.activation, manifest, () => ++serial);
      state = applied.state;
      frames.push({
        key: `step-${step.number}-cl-${link.number}-activation`,
        stepNumber: step.number,
        chainLink: link.number,
        chainSize: step.links.length,
        chainPhase: "activation",
        label: `Build Chain · Chain Link ${link.number}`,
        expression: link.expression,
        lp: state.lp,
        cards: cloneCards(state.cards),
        activeAliases: referencedCards(link.expression, manifest),
        movements: applied.movements,
      });
    }

    const resolving = [...step.links].reverse();
    for (const link of resolving) {
      const parts = splitChainExpression(link.expression);
      const applied = applyExpression(state, parts.resolution, manifest, () => ++serial);
      state = applied.state;
      frames.push({
        key: `step-${step.number}-cl-${link.number}-resolution`,
        stepNumber: step.number,
        chainLink: link.number,
        chainSize: step.links.length,
        chainPhase: "resolution",
        label: `Resolve Chain Link ${link.number}`,
        expression: link.expression,
        lp: state.lp,
        cards: cloneCards(state.cards),
        activeAliases: referencedCards(link.expression, manifest),
        movements: applied.movements,
      });
    }
  }

  return { frames, declaredEnd: document.end };
}

function splitChainExpression(expression: string): { activation: string; resolution: string } {
  const arrow = expression.indexOf("=>");
  if (arrow === -1) return { activation: expression, resolution: expression };
  return {
    activation: expression.slice(0, arrow).trim(),
    resolution: expression.slice(arrow + 2).trim(),
  };
}

function parseState(
  expression: string,
  manifest: DeckManifest,
  nextSerial: () => number,
): { lp: number; cards: VisualCard[] } {
  const lp = Number(expression.match(/\bLP=(\d+)/)?.[1] ?? 8000);
  const cards: VisualCard[] = [];
  const zonePattern = /\b([HDFGBX])=\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = zonePattern.exec(expression)) !== null) {
    const zone = match[1] as VisualZone;
    const aliases = (match[2] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    for (const annotated of aliases) {
      const [alias = annotated, levelText] = annotated.split("@");
      cards.push(createCard(alias, zone, manifest, nextSerial(), levelText ? Number(levelText) : undefined));
    }
  }

  return { lp, cards };
}

function applyExpression(
  previous: { lp: number; cards: VisualCard[] },
  expression: string,
  manifest: DeckManifest,
  nextSerial: () => number,
): { state: { lp: number; cards: VisualCard[] }; movements: CardMovement[] } {
  const cards = cloneCards(previous.cards);
  const movements: CardMovement[] = [];
  let match: RegExpExecArray | null;

  MOVEMENT.lastIndex = 0;
  while ((match = MOVEMENT.exec(expression)) !== null) {
    const alias = match[1]!;
    const from = match[2] as VisualZone;
    const to = match[3] as VisualZone;
    let card = cards.find((candidate) => candidate.alias === alias && candidate.zone === from);
    if (!card) {
      card = createCard(alias, from, manifest, nextSerial());
      cards.push(card);
    }
    card.zone = to;
    card.faceUp = to !== "D" && to !== "X";
    movements.push({ cardId: card.id, alias, from, to });
  }

  GENERIC_MOVEMENT.lastIndex = 0;
  while ((match = GENERIC_MOVEMENT.exec(expression)) !== null) {
    const from = match[2] as VisualZone;
    const to = match[3] as VisualZone;
    const alias = match[1] === "DRAW" ? "DRAW" : "UNKNOWN";
    const card = createCard(alias, to, manifest, nextSerial());
    cards.push(card);
    movements.push({ cardId: card.id, alias, from, to });
  }

  const damage = [...expression.matchAll(/\bDMG\s+(\d+)\b/g)]
    .reduce((total, result) => total + Number(result[1]), 0);
  return { state: { lp: Math.max(0, previous.lp - damage), cards }, movements };
}

function createCard(
  alias: string,
  zone: VisualZone,
  manifest: DeckManifest,
  serial: number,
  annotatedLevel?: number,
): VisualCard {
  const definition = manifest.cards[alias];
  const level = annotatedLevel ?? definition?.level;
  return {
    id: `${alias.toLowerCase()}-${serial}`,
    alias,
    name: definition?.name ?? (alias === "DRAW" ? "Drawn card" : "Unknown card"),
    kind: definition?.kind ?? "token",
    ...(level === undefined ? {} : { level }),
    zone,
    faceUp: zone !== "D" && zone !== "X" && alias !== "UNKNOWN",
  };
}

function referencedCards(expression: string, manifest: DeckManifest): string[] {
  const aliases = new Set<string>();
  CARD_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CARD_REFERENCE.exec(expression)) !== null) {
    const alias = match[1]!;
    if (manifest.cards[alias]) aliases.add(alias);
  }
  return [...aliases];
}

function describeExpression(expression: string): string {
  const operation = expression.match(/^([A-Z]+)\b/)?.[1];
  const labels: Record<string, string> = {
    NS: "Normal Summon",
    SS: "Special Summon",
    RS: "Ritual Summon",
    FS: "Fusion Summon",
    SY: "Synchro Summon",
    LS: "Link Summon",
    XS: "Xyz Summon",
    SET: "Set card",
    ACT: "Activate",
    ATK: "Declare attack",
  };
  return operation ? labels[operation] ?? "Resolve effect" : "Resolve effect";
}

function cloneCards(cards: VisualCard[]): VisualCard[] {
  return cards.map((card) => ({ ...card }));
}
