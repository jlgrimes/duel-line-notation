import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCATION_DECK,
  LOCATION_EXTRA,
  LOCATION_GRAVE,
  LOCATION_HAND,
  LOCATION_MZONE,
  LOCATION_REMOVED,
  LOCATION_SZONE,
  PHASE_MAIN1,
  POS_FACEDOWN_DEFENSE,
  POS_FACEUP_ATTACK,
  TYPE_MONSTER,
  TYPE_SPELL,
  TYPE_TOKEN,
  TYPE_TRAP,
} from "../src/simulator/engine-constants.js";
import { decodeCardQuery, decodeFieldQuery, type QueriedCard } from "../src/simulator/engine-query.js";
import {
  buildBoardFrame,
  buildEngineFieldState,
  diffFieldStates,
  identifyCard,
  isFaceUpForViewer,
  isIdentityKnownTo,
  kindFromType,
  redactFieldStateForViewer,
  resetEngineInstanceIds,
  visualFieldSlotFor,
  visualZoneFor,
  type EngineCardRegistry,
  type EngineFieldState,
  type QueriedCardAtAddress,
} from "../src/simulator/engine-state.js";
import { ocgcoreFixture } from "./fixtures/ocgcore-golden.js";

const CARD_CODE = 15025844;

const REGISTRY: EngineCardRegistry = {
  [CARD_CODE]: { alias: "ELF", name: "Mystical Elf", kind: "monster", level: 4 },
};

function queriedCard(bytes: Uint8Array): QueriedCard {
  const card = decodeCardQuery(bytes);
  assert.ok(card, "fixture must decode to a card");
  return card;
}

function at(card: QueriedCard, controller: number, location: number, sequence: number): QueriedCardAtAddress {
  return { card, address: { controller, location, sequence, overlaySequence: null } };
}

/** The opening state: the drawn card sits in player 0's hand. */
function openingState(): EngineFieldState {
  return buildEngineFieldState({
    field: decodeFieldQuery(ocgcoreFixture("openingField")),
    cards: [at(queriedCard(ocgcoreFixture("openingHandCard")), 0, LOCATION_HAND, 0)],
    turnPlayer: 0,
    turnCount: 1,
    phase: PHASE_MAIN1,
  });
}

/** The same card after the engine placed it in M3. */
function summonedState(previous: EngineFieldState | null): EngineFieldState {
  return buildEngineFieldState({
    field: decodeFieldQuery(ocgcoreFixture("summonedField")),
    cards: [at(queriedCard(ocgcoreFixture("summonedMonster")), 0, LOCATION_MZONE, 2)],
    turnPlayer: 0,
    turnCount: 1,
    phase: PHASE_MAIN1,
    previous,
  });
}

test("field state carries turn, phase, both players, and the queried cards", () => {
  resetEngineInstanceIds();
  const state = openingState();

  assert.equal(state.turnPlayer, 0);
  assert.equal(state.turnCount, 1);
  assert.equal(state.phase, PHASE_MAIN1);
  assert.equal(state.phaseName, "Main Phase 1");
  assert.equal(state.players[0].lp, 8000);
  assert.equal(state.players[1].lp, 8000);
  assert.equal(state.players[0].handCount, 1);
  assert.deepEqual(state.chain, []);

  const card = state.cards[0];
  assert.ok(card);
  assert.equal(card.code, CARD_CODE);
  assert.equal(card.effectiveCode, CARD_CODE);
  assert.equal(card.location, LOCATION_HAND);
  assert.equal(card.owner, 0);
  assert.equal(card.controller, 0);
  assert.equal(card.level, 4);
  assert.equal(card.attack, 800);
  assert.equal(card.race, "2", "uint64 race is preserved as a JSON-safe string");
});

test("field state is JSON-serializable so it can back snapshot fixtures", () => {
  resetEngineInstanceIds();
  const state = summonedState(openingState());

  const roundTripped = JSON.parse(JSON.stringify(state)) as EngineFieldState;

  assert.deepEqual(roundTripped, state);
});

test("card instance ids survive a move so animation can follow one card", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const summoned = summonedState(opening);

  assert.equal(summoned.cards.length, 1);
  assert.equal(summoned.cards[0]?.instanceId, opening.cards[0]?.instanceId);
  assert.equal(summoned.cards[0]?.location, LOCATION_MZONE);
  assert.equal(summoned.cards[0]?.sequence, 2);
});

test("the diff observes the move instead of it being declared", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const summoned = summonedState(opening);

  const transitions = diffFieldStates(opening, summoned);

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.kind, "moved");
  assert.equal(transitions[0]?.from?.location, LOCATION_HAND);
  assert.equal(transitions[0]?.to?.location, LOCATION_MZONE);
  assert.equal(transitions[0]?.to?.sequence, 2);
  assert.deepEqual(diffFieldStates(summoned, summoned), [], "an unchanged state produces no transitions");
});

test("the diff reports entering, leaving, and position changes separately", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const flipped: EngineFieldState = {
    ...opening,
    cards: [{ ...opening.cards[0]!, position: POS_FACEDOWN_DEFENSE }],
  };

  assert.equal(diffFieldStates(opening, flipped)[0]?.kind, "changed-position");
  assert.equal(diffFieldStates(null, opening)[0]?.kind, "entered");
  assert.equal(diffFieldStates(opening, { ...opening, cards: [] })[0]?.kind, "left");
});

test("board frames place the card in the zone the engine actually chose", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const summoned = summonedState(opening);

  const frame = buildBoardFrame(summoned, {
    viewer: 0,
    stepNumber: 1,
    registry: REGISTRY,
    previous: opening,
  });

  assert.equal(frame.cards.length, 1);
  assert.equal(frame.cards[0]?.fieldSlot, "M3", "the frame must not assume M1");
  assert.equal(frame.cards[0]?.zone, "F");
  assert.equal(frame.cards[0]?.name, "Mystical Elf");
  assert.equal(frame.cards[0]?.faceUp, true);
  assert.equal(frame.lp, 8000);
  assert.deepEqual(frame.movements, [{ cardId: summoned.cards[0]!.instanceId, alias: "ELF", from: "H", to: "F" }]);
  assert.deepEqual(frame.activeAliases, ["ELF"]);
});

test("the opening board frame shows the hand with no invented movement", () => {
  resetEngineInstanceIds();
  const frame = buildBoardFrame(openingState(), { viewer: 0, stepNumber: 0, registry: REGISTRY });

  assert.equal(frame.cards[0]?.zone, "H");
  assert.equal(frame.cards[0]?.fieldSlot, undefined);
  assert.deepEqual(frame.movements, [], "with no previous state nothing has moved");
});

test("board frames cover every location for the viewer and hide the opponent's side", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const hand = queriedCard(ocgcoreFixture("openingHandCard"));
  const monster = queriedCard(ocgcoreFixture("summonedMonster"));

  const state = buildEngineFieldState({
    field: decodeFieldQuery(ocgcoreFixture("openingField")),
    cards: [
      at(hand, 0, LOCATION_HAND, 0),
      at(hand, 0, LOCATION_DECK, 0),
      at(hand, 0, LOCATION_GRAVE, 0),
      at(hand, 0, LOCATION_REMOVED, 0),
      at(hand, 0, LOCATION_EXTRA, 0),
      at(monster, 0, LOCATION_MZONE, 4),
      at(monster, 0, LOCATION_SZONE, 1),
      at(hand, 1, LOCATION_HAND, 0),
      at(monster, 1, LOCATION_MZONE, 0),
    ],
    turnPlayer: 0,
    turnCount: 1,
    phase: PHASE_MAIN1,
    previous: opening,
  });

  const frame = buildBoardFrame(state, { viewer: 0, stepNumber: 2, registry: REGISTRY, previous: opening });

  assert.equal(state.cards.length, 9, "the state keeps both players' cards");
  assert.equal(frame.cards.length, 7, "the frame renders only the viewer's side");
  assert.deepEqual(
    frame.cards.map((card) => card.zone).sort(),
    ["B", "D", "F", "F", "G", "H", "X"],
    "every visible location reaches the frame",
  );
  assert.equal(frame.cards.find((card) => card.zone === "D")?.faceUp, false, "the deck is never revealed");
  assert.equal(frame.cards.find((card) => card.zone === "H")?.faceUp, true, "the viewer sees their own hand");
  assert.deepEqual(
    frame.cards.filter((card) => card.zone === "F").map((card) => card.fieldSlot).sort(),
    ["M5", "S2"],
    "sequences map to numbered slots",
  );
});

test("Xyz materials stay in the state but do not occupy a zone of their own", () => {
  resetEngineInstanceIds();
  const monster = queriedCard(ocgcoreFixture("summonedMonster"));
  const state = buildEngineFieldState({
    field: decodeFieldQuery(ocgcoreFixture("summonedField")),
    cards: [
      at(monster, 0, LOCATION_MZONE, 2),
      { card: monster, address: { controller: 0, location: LOCATION_MZONE, sequence: 2, overlaySequence: 0 } },
    ],
    turnPlayer: 0,
    turnCount: 1,
    phase: PHASE_MAIN1,
  });

  const frame = buildBoardFrame(state, { viewer: 0, stepNumber: 0, registry: REGISTRY });

  assert.equal(state.cards.length, 2, "the material is part of engine truth");
  assert.equal(frame.cards.length, 1, "but it is not drawn as a separate board card");
  assert.equal(visualZoneFor(state.cards[1]!), null);
});

test("unknown codes fall back to engine-derived identity", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const identity = identifyCard(opening.cards[0]!, {});

  assert.equal(identity.name, `Card #${CARD_CODE}`);
  assert.equal(identity.alias, `C${CARD_CODE}`);
  assert.equal(identity.kind, "monster", "the kind comes from the engine's type bits");
  assert.equal(identity.level, 4, "the level comes from the engine, not a manifest");
});

test("card kind is derived from the engine type mask", () => {
  assert.equal(kindFromType(TYPE_MONSTER), "monster");
  assert.equal(kindFromType(TYPE_SPELL), "spell");
  assert.equal(kindFromType(TYPE_TRAP), "trap");
  assert.equal(kindFromType(TYPE_MONSTER | TYPE_TOKEN), "token");
  assert.equal(kindFromType(0), "token");
});

test("field slots follow the core's zone sequencing", () => {
  assert.equal(visualFieldSlotFor(LOCATION_MZONE, 0), "M1");
  assert.equal(visualFieldSlotFor(LOCATION_MZONE, 4), "M5");
  assert.equal(visualFieldSlotFor(LOCATION_MZONE, 5), "EMZ1");
  assert.equal(visualFieldSlotFor(LOCATION_MZONE, 6), "EMZ2");
  assert.equal(visualFieldSlotFor(LOCATION_SZONE, 0), "S1");
  assert.equal(visualFieldSlotFor(LOCATION_SZONE, 5), "FIELD");
  assert.equal(visualFieldSlotFor(LOCATION_SZONE, 6), null, "separate Pendulum Zones have no slot yet");
  assert.equal(visualFieldSlotFor(LOCATION_HAND, 0), null);
});

test("identity knowledge is separate from how a card is drawn", () => {
  resetEngineInstanceIds();
  const card = openingState().cards[0]!;
  const set = { ...card, location: LOCATION_MZONE, position: POS_FACEDOWN_DEFENSE };

  assert.equal(isIdentityKnownTo(set, 0), true, "you know your own Set monster");
  assert.equal(isFaceUpForViewer(set, 0), false, "but it is still drawn face-down");
  assert.equal(isIdentityKnownTo(set, 1), false, "the opponent does not know it");
  assert.equal(isIdentityKnownTo({ ...card, location: LOCATION_DECK }, 0), false, "nobody knows deck order");
  assert.equal(isIdentityKnownTo({ ...card, controller: 1, location: LOCATION_GRAVE }, 0), true, "the GY is public");
});

test("redaction strips identity a viewer may not have without hiding that a card exists", () => {
  resetEngineInstanceIds();
  const opening = openingState();
  const hand = queriedCard(ocgcoreFixture("openingHandCard"));
  const state = buildEngineFieldState({
    field: decodeFieldQuery(ocgcoreFixture("openingField")),
    cards: [at(hand, 0, LOCATION_HAND, 0), at(hand, 1, LOCATION_HAND, 0), at(hand, 0, LOCATION_DECK, 0)],
    turnPlayer: 0,
    turnCount: 1,
    phase: PHASE_MAIN1,
    previous: opening,
  });

  const redacted = redactFieldStateForViewer(state, 0);

  assert.equal(redacted.cards.length, 3, "hidden cards still occupy their place");
  assert.equal(redacted.cards[0]?.code, CARD_CODE, "the viewer keeps their own hand");
  assert.equal(redacted.cards[1]?.code, 0, "the opponent's hand is stripped");
  assert.equal(redacted.cards[1]?.attack, null);
  assert.equal(redacted.cards[1]?.location, LOCATION_HAND, "its location is still known");
  assert.equal(redacted.cards[2]?.code, 0, "the viewer's own deck is stripped too");
  assert.equal(identifyCard(redacted.cards[1]!, REGISTRY).name, "Hidden card", "a stripped card never renders a name");
});

test("visibility is applied per viewer, never baked into the state", () => {
  resetEngineInstanceIds();
  const card = openingState().cards[0]!;

  assert.equal(isFaceUpForViewer(card, 0), true, "the controller sees their own hand");
  assert.equal(isFaceUpForViewer(card, 1), false, "the opponent does not");
  assert.equal(isFaceUpForViewer({ ...card, location: LOCATION_DECK }, 0), false);
  assert.equal(
    isFaceUpForViewer({ ...card, location: LOCATION_MZONE, position: POS_FACEDOWN_DEFENSE }, 0),
    false,
    "a Set monster is face-down for everyone",
  );
  assert.equal(isFaceUpForViewer({ ...card, location: LOCATION_MZONE, position: POS_FACEUP_ATTACK }, 1), true);
});
