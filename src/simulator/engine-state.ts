/**
 * The normalized, immutable duel state that sits between raw `ocgcore` queries and
 * anything that renders. Nothing here calls the engine: the runtime queries the core,
 * hands the decoded buffers to `buildEngineFieldState`, and everything downstream —
 * board frames, movement animation, tests, future trace export — works from the
 * resulting plain value.
 *
 * Two rules this module keeps:
 *
 * 1. Engine truth is recorded as the engine reported it. Visibility is applied later,
 *    per viewer, so hidden information is never baked into the state itself.
 * 2. Card instance identity is resolved by matching consecutive states, so a card keeps
 *    one id as it moves and animations can be derived from observed transitions instead
 *    of being declared by hand.
 */

import {
  LOCATION_DECK,
  LOCATION_EXTRA,
  LOCATION_GRAVE,
  LOCATION_HAND,
  LOCATION_MZONE,
  LOCATION_OVERLAY,
  LOCATION_REMOVED,
  LOCATION_SZONE,
  POS_FACEUP,
  SZONE_FIELD_SEQUENCE,
  TYPE_MONSTER,
  TYPE_SPELL,
  TYPE_TOKEN,
  TYPE_TRAP,
  locationName,
  phaseName,
} from "./engine-constants.js";
import type { EngineCounter, QueriedCard, QueriedField } from "./engine-query.js";
import type { CardDefinition } from "../model.js";
import type { CardMovement, PlaybackFrame, VisualCard, VisualFieldSlot, VisualZone } from "../visualizer.js";

/** Where a queried card was found. The engine reports state, not addresses. */
export interface EngineCardAddress {
  controller: number;
  location: number;
  sequence: number;
  /** Set only for Xyz materials, which live under a monster rather than in a zone. */
  overlaySequence: number | null;
}

export interface EngineCardState extends EngineCardAddress {
  /** Stable across snapshots for as long as the card stays in the duel. */
  instanceId: string;
  code: number;
  /** `QUERY_ALIAS` is the core's `get_code()`, i.e. the name the card currently has. */
  effectiveCode: number;
  owner: number;
  type: number;
  position: number;
  level: number | null;
  rank: number | null;
  link: number | null;
  linkMarker: number | null;
  attribute: number | null;
  /** `uint64` in the core; kept as a decimal string so snapshots stay JSON-safe. */
  race: string | null;
  attack: number | null;
  defense: number | null;
  baseAttack: number | null;
  baseDefense: number | null;
  leftScale: number | null;
  rightScale: number | null;
  status: number | null;
  reason: number | null;
  isPublic: boolean;
  counters: EngineCounter[];
  overlayCodes: number[];
}

export interface EnginePlayerState {
  lp: number;
  deckCount: number;
  handCount: number;
  graveCount: number;
  banishedCount: number;
  extraCount: number;
  extraPendulumCount: number;
}

export interface EngineChainLinkState {
  code: number;
  controller: number;
  location: number;
  sequence: number;
  triggeringController: number;
  triggeringLocation: number;
  triggeringSequence: number;
  /** `uint64` effect description; kept as a decimal string for JSON safety. */
  description: string;
}

export interface EngineFieldState {
  turnPlayer: number;
  turnCount: number;
  phase: number;
  phaseName: string;
  players: [EnginePlayerState, EnginePlayerState];
  chain: EngineChainLinkState[];
  cards: EngineCardState[];
}

export type EngineTransitionKind = "entered" | "moved" | "left" | "changed-position";

export interface EngineCardTransition {
  instanceId: string;
  code: number;
  kind: EngineTransitionKind;
  from: EngineCardAddress | null;
  to: EngineCardAddress | null;
}

/** A queried card plus the address it was queried at, before identity is resolved. */
export interface QueriedCardAtAddress {
  address: EngineCardAddress;
  card: QueriedCard;
}

export interface EngineFieldStateInput {
  field: QueriedField;
  cards: QueriedCardAtAddress[];
  turnPlayer: number;
  turnCount: number;
  phase: number;
  /** The previous state, used only to carry card instance ids forward. */
  previous?: EngineFieldState | null;
}

/**
 * Names for the codes the simulator has registered. Until the real card database and
 * script resolver land, this is small; the board builder never assumes an entry exists.
 */
export type EngineCardRegistry = Readonly<Record<number, CardDefinition & { alias: string }>>;

export interface EngineCardIdentity {
  alias: string;
  name: string;
  kind: CardDefinition["kind"];
  level: number | null;
}

function toPlayerState(player: QueriedField["players"][number]): EnginePlayerState {
  return {
    lp: player.lp,
    deckCount: player.deckCount,
    handCount: player.handCount,
    graveCount: player.graveCount,
    banishedCount: player.banishedCount,
    extraCount: player.extraCount,
    extraPendulumCount: player.extraPendulumCount,
  };
}

function normalizeCard(entry: QueriedCardAtAddress, instanceId: string): EngineCardState {
  const { address, card } = entry;
  const code = card.code ?? 0;
  return {
    instanceId,
    code,
    effectiveCode: card.alias ?? code,
    controller: address.controller,
    owner: card.owner ?? address.controller,
    location: address.location,
    sequence: address.sequence,
    overlaySequence: address.overlaySequence,
    type: card.type ?? 0,
    position: card.position ?? 0,
    level: card.level ?? null,
    rank: card.rank ?? null,
    link: card.link ?? null,
    linkMarker: card.linkMarker ?? null,
    attribute: card.attribute ?? null,
    race: card.race === null ? null : card.race.toString(),
    attack: card.attack ?? null,
    defense: card.defense ?? null,
    baseAttack: card.baseAttack ?? null,
    baseDefense: card.baseDefense ?? null,
    leftScale: card.lscale ?? null,
    rightScale: card.rscale ?? null,
    status: card.status ?? null,
    reason: card.reason ?? null,
    isPublic: card.isPublic ?? false,
    counters: card.counters.map((counter) => ({ ...counter })),
    overlayCodes: [...card.overlayCodes],
  };
}

function sameAddress(left: EngineCardAddress, right: EngineCardAddress): boolean {
  return left.controller === right.controller
    && left.location === right.location
    && left.sequence === right.sequence
    && left.overlaySequence === right.overlaySequence;
}

/**
 * Carries instance ids from the previous state onto freshly queried cards.
 *
 * The core does not expose card handles, so identity is recovered by matching in three
 * passes of decreasing confidence: a card that did not move, then a card of the same
 * code with the same owner, then any card of the same code. Each previous card is
 * consumed by at most one match, and anything unmatched is treated as newly entering
 * the duel.
 */
export function resolveCardIdentities(
  previous: EngineFieldState | null,
  entries: QueriedCardAtAddress[],
  nextInstanceId: () => string,
): EngineCardState[] {
  const unmatched = new Map<string, EngineCardState>();
  for (const card of previous?.cards ?? []) unmatched.set(card.instanceId, card);

  const assigned = new Array<string | null>(entries.length).fill(null);
  const claim = (index: number, match: EngineCardState | undefined): boolean => {
    if (!match) return false;
    assigned[index] = match.instanceId;
    unmatched.delete(match.instanceId);
    return true;
  };

  const candidates = (entry: QueriedCardAtAddress) =>
    [...unmatched.values()].filter((card) => card.code === (entry.card.code ?? 0));

  entries.forEach((entry, index) => {
    claim(index, candidates(entry).find((card) => sameAddress(card, entry.address)));
  });
  entries.forEach((entry, index) => {
    if (assigned[index]) return;
    const owner = entry.card.owner ?? entry.address.controller;
    claim(index, candidates(entry).find((card) => card.owner === owner));
  });
  entries.forEach((entry, index) => {
    if (assigned[index]) return;
    claim(index, candidates(entry)[0]);
  });

  return entries.map((entry, index) => normalizeCard(entry, assigned[index] ?? nextInstanceId()));
}

let instanceCounter = 0;

function defaultInstanceId(): string {
  instanceCounter += 1;
  return `engine-card-${instanceCounter}`;
}

/** Resets the module-level id counter so tests produce deterministic ids. */
export function resetEngineInstanceIds(): void {
  instanceCounter = 0;
}

export function buildEngineFieldState(input: EngineFieldStateInput): EngineFieldState {
  const cards = resolveCardIdentities(input.previous ?? null, input.cards, defaultInstanceId);
  return {
    turnPlayer: input.turnPlayer,
    turnCount: input.turnCount,
    phase: input.phase,
    phaseName: phaseName(input.phase),
    players: [toPlayerState(input.field.players[0]), toPlayerState(input.field.players[1])],
    chain: input.field.chain.map((link) => ({
      code: link.code,
      controller: link.handler.controller,
      location: link.handler.location,
      sequence: link.handler.sequence,
      triggeringController: link.triggeringController,
      triggeringLocation: link.triggeringLocation,
      triggeringSequence: link.triggeringSequence,
      description: link.description.toString(),
    })),
    cards,
  };
}

function addressOf(card: EngineCardState): EngineCardAddress {
  return {
    controller: card.controller,
    location: card.location,
    sequence: card.sequence,
    overlaySequence: card.overlaySequence,
  };
}

/**
 * Diffs two consecutive states by instance id. This is the only place movement is
 * decided: nothing declares "this card moved", it is observed.
 */
export function diffFieldStates(
  previous: EngineFieldState | null,
  next: EngineFieldState,
): EngineCardTransition[] {
  const before = new Map((previous?.cards ?? []).map((card) => [card.instanceId, card]));
  const transitions: EngineCardTransition[] = [];

  for (const card of next.cards) {
    const earlier = before.get(card.instanceId);
    before.delete(card.instanceId);
    if (!earlier) {
      transitions.push({ instanceId: card.instanceId, code: card.code, kind: "entered", from: null, to: addressOf(card) });
      continue;
    }
    if (!sameAddress(earlier, card)) {
      transitions.push({ instanceId: card.instanceId, code: card.code, kind: "moved", from: addressOf(earlier), to: addressOf(card) });
      continue;
    }
    if (earlier.position !== card.position) {
      transitions.push({ instanceId: card.instanceId, code: card.code, kind: "changed-position", from: addressOf(earlier), to: addressOf(card) });
    }
  }

  for (const card of before.values()) {
    transitions.push({ instanceId: card.instanceId, code: card.code, kind: "left", from: addressOf(card), to: null });
  }

  return transitions;
}

/**
 * Whether a viewer is entitled to know what a card is.
 *
 * This is stricter than `isFaceUpForViewer`, which only asks how to draw the card: a
 * player knows their own Set monster without it being face-up, and nobody — not even the
 * owner — knows the order of their own Deck.
 */
export function isIdentityKnownTo(card: EngineCardState, viewer: number): boolean {
  if (card.location === LOCATION_DECK) return false;
  if (card.controller === viewer) return true;
  switch (card.location) {
    case LOCATION_GRAVE: return true;
    case LOCATION_REMOVED:
    case LOCATION_MZONE:
    case LOCATION_SZONE: return (card.position & POS_FACEUP) !== 0 || card.isPublic;
    default: return card.isPublic;
  }
}

/**
 * Strips the identity of every card a viewer may not know, keeping location, sequence,
 * position, and counts so the board still shows that something is there.
 *
 * The simulator worker runs locally against a single viewer, so the runtime keeps full
 * engine truth for diagnostics and traces. Any path that sends state to a second player
 * has to redact first — that is what this function is for.
 */
export function redactFieldStateForViewer(state: EngineFieldState, viewer: number): EngineFieldState {
  return {
    ...state,
    cards: state.cards.map((card) => (isIdentityKnownTo(card, viewer) ? card : {
      ...card,
      code: 0,
      effectiveCode: 0,
      type: 0,
      level: null,
      rank: null,
      link: null,
      linkMarker: null,
      attribute: null,
      race: null,
      attack: null,
      defense: null,
      baseAttack: null,
      baseDefense: null,
      leftScale: null,
      rightScale: null,
      // The number of Xyz materials is public; their identities are not.
      overlayCodes: card.overlayCodes.map(() => 0),
    })),
  };
}

export function identifyCard(card: EngineCardState, registry: EngineCardRegistry): EngineCardIdentity {
  if (card.code === 0) {
    return { alias: "?", name: "Hidden card", kind: kindFromType(card.type), level: null };
  }
  const known = registry[card.effectiveCode] ?? registry[card.code];
  if (known) {
    return {
      alias: known.alias,
      name: known.name,
      kind: known.kind,
      level: known.level ?? card.level ?? null,
    };
  }
  return {
    alias: `C${card.code}`,
    name: `Card #${card.code}`,
    kind: kindFromType(card.type),
    level: card.level ?? null,
  };
}

/** The card kind the engine's own type bits imply, with no card database involved. */
export function kindFromType(type: number): CardDefinition["kind"] {
  if ((type & TYPE_TOKEN) !== 0) return "token";
  if ((type & TYPE_MONSTER) !== 0) return "monster";
  if ((type & TYPE_SPELL) !== 0) return "spell";
  if ((type & TYPE_TRAP) !== 0) return "trap";
  return "token";
}

/**
 * Maps an engine location to the visualizer's zone letters.
 *
 * Returns `null` for overlay units, which belong to the monster above them rather than
 * to a zone of their own, and for locations the visual model has no place for yet.
 */
export function visualZoneFor(card: EngineCardState): VisualZone | null {
  if (card.overlaySequence !== null || (card.location & LOCATION_OVERLAY) !== 0) return null;
  switch (card.location) {
    case LOCATION_HAND: return "H";
    case LOCATION_DECK: return "D";
    case LOCATION_EXTRA: return "X";
    case LOCATION_GRAVE: return "G";
    case LOCATION_REMOVED: return "B";
    case LOCATION_MZONE:
    case LOCATION_SZONE: return "F";
    default: return null;
  }
}

/**
 * Maps an on-field sequence to a numbered visual slot.
 *
 * Monster sequences 5 and 6 are the shared Extra Monster Zones. Spell sequence 5 is the
 * Field Zone. Spell sequences 6 and 7 are separate Pendulum Zones, which the core only
 * uses under `DUEL_SEPARATE_PZONE`; with the default duel flags a Pendulum card sits in
 * spell sequence 0 or 4, so it already maps to S1/S5. Those two sequences therefore have
 * no visual slot yet and return `null`.
 */
export function visualFieldSlotFor(location: number, sequence: number): VisualFieldSlot | null {
  if (location === LOCATION_MZONE) {
    if (sequence >= 0 && sequence < 5) return `M${sequence + 1}` as VisualFieldSlot;
    if (sequence === 5) return "EMZ1";
    if (sequence === 6) return "EMZ2";
    return null;
  }
  if (location === LOCATION_SZONE) {
    if (sequence >= 0 && sequence < 5) return `S${sequence + 1}` as VisualFieldSlot;
    if (sequence === SZONE_FIELD_SEQUENCE) return "FIELD";
    return null;
  }
  return null;
}

/**
 * Whether a viewer may see a card's face. Engine truth stays in `EngineCardState`;
 * this is the only place a viewer is applied, so a future opponent view cannot leak
 * hidden information simply by rendering the same state.
 */
export function isFaceUpForViewer(card: EngineCardState, viewer: number): boolean {
  switch (card.location) {
    case LOCATION_DECK: return false;
    case LOCATION_EXTRA: return card.isPublic;
    case LOCATION_HAND: return card.controller === viewer || card.isPublic;
    default: return (card.position & POS_FACEUP) !== 0;
  }
}

export interface BoardFrameOptions {
  viewer: number;
  stepNumber: number;
  registry: EngineCardRegistry;
  key?: string;
  label?: string;
  expression?: string;
  previous?: EngineFieldState | null;
}

function describeAddress(address: EngineCardAddress): string {
  const slot = visualFieldSlotFor(address.location, address.sequence);
  return slot ? `${locationName(address.location)} ${slot}` : locationName(address.location);
}

function describeTransitions(transitions: EngineCardTransition[], registry: EngineCardRegistry, cards: EngineCardState[]): string {
  const byId = new Map(cards.map((card) => [card.instanceId, card]));
  const described = transitions
    .filter((transition) => transition.kind === "moved" || transition.kind === "entered")
    .map((transition) => {
      const card = byId.get(transition.instanceId);
      const alias = card ? identifyCard(card, registry).alias : `C${transition.code}`;
      const to = transition.to ? describeAddress(transition.to) : "?";
      return transition.from ? `${alias} ${describeAddress(transition.from)} → ${to}` : `${alias} → ${to}`;
    });
  return described.join(" · ");
}

/**
 * Projects a state into the shared `PlaybackFrame` the visualizer already renders.
 *
 * The frame currently shows one player's side, because that is what the board component
 * supports; both players' cards remain in `EngineFieldState` for the wider board work.
 * Movements come from the state diff, never from a caller's assertion.
 */
export function buildBoardFrame(state: EngineFieldState, options: BoardFrameOptions): PlaybackFrame {
  const { viewer, registry } = options;
  const transitions = diffFieldStates(options.previous ?? null, state);
  const previousById = new Map((options.previous?.cards ?? []).map((card) => [card.instanceId, card]));

  const cards: VisualCard[] = [];
  const movements: CardMovement[] = [];

  for (const card of state.cards) {
    if (card.controller !== viewer) continue;
    const zone = visualZoneFor(card);
    if (!zone) continue;
    const identity = identifyCard(card, registry);
    const slot = zone === "F" ? visualFieldSlotFor(card.location, card.sequence) : null;
    cards.push({
      id: card.instanceId,
      alias: identity.alias,
      name: identity.name,
      kind: identity.kind,
      ...(identity.level === null ? {} : { level: identity.level }),
      zone,
      faceUp: isFaceUpForViewer(card, viewer),
      ...(slot === null ? {} : { fieldSlot: slot }),
    });

    const earlier = previousById.get(card.instanceId);
    if (!earlier) continue;
    const previousZone = visualZoneFor(earlier);
    if (previousZone && previousZone !== zone && earlier.controller === viewer) {
      movements.push({ cardId: card.instanceId, alias: identity.alias, from: previousZone, to: zone });
    }
  }

  const activeAliases = [...new Set(
    transitions
      .filter((transition) => transition.kind !== "left")
      .map((transition) => state.cards.find((card) => card.instanceId === transition.instanceId))
      .filter((card): card is EngineCardState => card !== undefined && card.controller === viewer)
      .map((card) => identifyCard(card, registry).alias),
  )];

  const summary = describeTransitions(transitions, registry, state.cards);
  return {
    key: options.key ?? `engine-turn-${state.turnCount}-step-${options.stepNumber}`,
    stepNumber: options.stepNumber,
    ...(state.chain.length > 0
      ? { chainLink: state.chain.length, chainSize: state.chain.length, chainPhase: "activation" as const }
      : {}),
    label: options.label ?? (summary || `${state.phaseName} · Turn ${state.turnCount}`),
    expression: options.expression ?? (summary || `${state.phaseName} · LP ${state.players[viewer]?.lp ?? 0}`),
    lp: state.players[viewer]?.lp ?? 0,
    cards,
    activeAliases,
    movements,
  };
}
