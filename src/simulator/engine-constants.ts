/**
 * Constants copied from the pinned Project Ignis core
 * (`ygopro-core@0764db0c75b3d1d574880d365aa3695ab1f13b43`).
 *
 * Every value here is transcribed from `ocgapi_constants.h` or `common.h` in that
 * checkout. Nothing in this file is inferred from gameplay behaviour, so a core
 * upgrade only needs this file re-checked against those two headers.
 */

export const LOCATION_DECK = 0x01;
export const LOCATION_HAND = 0x02;
export const LOCATION_MZONE = 0x04;
export const LOCATION_SZONE = 0x08;
export const LOCATION_GRAVE = 0x10;
export const LOCATION_REMOVED = 0x20;
export const LOCATION_EXTRA = 0x40;
export const LOCATION_OVERLAY = 0x80;

/**
 * Locations that hold cards for a player, in the order the snapshot builder walks
 * them. `LOCATION_OVERLAY` is deliberately absent: overlay units are read through
 * the monster that owns them, not as a standalone location.
 */
export const QUERYABLE_LOCATIONS = [
  LOCATION_DECK,
  LOCATION_HAND,
  LOCATION_MZONE,
  LOCATION_SZONE,
  LOCATION_GRAVE,
  LOCATION_REMOVED,
  LOCATION_EXTRA,
] as const;

export const LOCATION_NAMES: Readonly<Record<number, string>> = {
  [LOCATION_DECK]: "Deck",
  [LOCATION_HAND]: "Hand",
  [LOCATION_MZONE]: "Monster Zone",
  [LOCATION_SZONE]: "Spell & Trap Zone",
  [LOCATION_GRAVE]: "GY",
  [LOCATION_REMOVED]: "Banished",
  [LOCATION_EXTRA]: "Extra Deck",
  [LOCATION_OVERLAY]: "Overlay Unit",
};

/**
 * `field::player_info` sizes these two lists in `field.h`. Zone-shaped locations are
 * sparse: an empty sequence still exists and must be queried to learn it is empty.
 */
export const MZONE_SEQUENCE_COUNT = 7;
export const SZONE_SEQUENCE_COUNT = 8;

/** `field::get_pzone_index` returns 6 and 7 only when `DUEL_SEPARATE_PZONE` is set. */
export const SZONE_FIELD_SEQUENCE = 5;
export const SZONE_SEPARATE_PZONE_SEQUENCES = [6, 7] as const;

export const POS_FACEUP_ATTACK = 0x1;
export const POS_FACEDOWN_ATTACK = 0x2;
export const POS_FACEUP_DEFENSE = 0x4;
export const POS_FACEDOWN_DEFENSE = 0x8;
export const POS_FACEUP = POS_FACEUP_ATTACK | POS_FACEUP_DEFENSE;
export const POS_FACEDOWN = POS_FACEDOWN_ATTACK | POS_FACEDOWN_DEFENSE;
export const POS_ATTACK = POS_FACEUP_ATTACK | POS_FACEDOWN_ATTACK;
export const POS_DEFENSE = POS_FACEUP_DEFENSE | POS_FACEDOWN_DEFENSE;

export const POSITION_NAMES: Readonly<Record<number, string>> = {
  [POS_FACEUP_ATTACK]: "Face-up Attack",
  [POS_FACEDOWN_ATTACK]: "Face-down Attack",
  [POS_FACEUP_DEFENSE]: "Face-up Defense",
  [POS_FACEDOWN_DEFENSE]: "Face-down Defense",
};

export const TYPE_MONSTER = 0x1;
export const TYPE_SPELL = 0x2;
export const TYPE_TRAP = 0x4;
export const TYPE_NORMAL = 0x10;
export const TYPE_EFFECT = 0x20;
export const TYPE_TOKEN = 0x4000;
export const TYPE_XYZ = 0x800000;
export const TYPE_PENDULUM = 0x1000000;
export const TYPE_LINK = 0x4000000;

export const QUERY_CODE = 0x1;
export const QUERY_POSITION = 0x2;
export const QUERY_ALIAS = 0x4;
export const QUERY_TYPE = 0x8;
export const QUERY_LEVEL = 0x10;
export const QUERY_RANK = 0x20;
export const QUERY_ATTRIBUTE = 0x40;
export const QUERY_RACE = 0x80;
export const QUERY_ATTACK = 0x100;
export const QUERY_DEFENSE = 0x200;
export const QUERY_BASE_ATTACK = 0x400;
export const QUERY_BASE_DEFENSE = 0x800;
export const QUERY_REASON = 0x1000;
export const QUERY_REASON_CARD = 0x2000;
export const QUERY_EQUIP_CARD = 0x4000;
export const QUERY_TARGET_CARD = 0x8000;
export const QUERY_OVERLAY_CARD = 0x10000;
export const QUERY_COUNTERS = 0x20000;
export const QUERY_OWNER = 0x40000;
export const QUERY_STATUS = 0x80000;
export const QUERY_IS_PUBLIC = 0x100000;
export const QUERY_LSCALE = 0x200000;
export const QUERY_RSCALE = 0x400000;
export const QUERY_LINK = 0x800000;
export const QUERY_IS_HIDDEN = 0x1000000;
export const QUERY_COVER = 0x2000000;
export const QUERY_END = 0x80000000;

/**
 * Everything the snapshot builder asks for. `QUERY_IS_PUBLIC` is always emitted by
 * the pinned core regardless of the request mask, so the decoder reads it whether or
 * not it was asked for.
 */
export const FULL_CARD_QUERY_FLAGS =
  QUERY_CODE
  | QUERY_POSITION
  | QUERY_ALIAS
  | QUERY_TYPE
  | QUERY_LEVEL
  | QUERY_RANK
  | QUERY_ATTRIBUTE
  | QUERY_RACE
  | QUERY_ATTACK
  | QUERY_DEFENSE
  | QUERY_BASE_ATTACK
  | QUERY_BASE_DEFENSE
  | QUERY_REASON
  | QUERY_OVERLAY_CARD
  | QUERY_COUNTERS
  | QUERY_OWNER
  | QUERY_STATUS
  | QUERY_IS_PUBLIC
  | QUERY_LSCALE
  | QUERY_RSCALE
  | QUERY_LINK;

export const PHASE_DRAW = 0x01;
export const PHASE_STANDBY = 0x02;
export const PHASE_MAIN1 = 0x04;
export const PHASE_BATTLE_START = 0x08;
export const PHASE_BATTLE_STEP = 0x10;
export const PHASE_DAMAGE = 0x20;
export const PHASE_DAMAGE_CAL = 0x40;
export const PHASE_BATTLE = 0x80;
export const PHASE_MAIN2 = 0x100;
export const PHASE_END = 0x200;

export const PHASE_NAMES: Readonly<Record<number, string>> = {
  [PHASE_DRAW]: "Draw Phase",
  [PHASE_STANDBY]: "Standby Phase",
  [PHASE_MAIN1]: "Main Phase 1",
  [PHASE_BATTLE_START]: "Battle Phase · Start Step",
  [PHASE_BATTLE_STEP]: "Battle Phase · Battle Step",
  [PHASE_DAMAGE]: "Battle Phase · Damage Step",
  [PHASE_DAMAGE_CAL]: "Battle Phase · Damage Calculation",
  [PHASE_BATTLE]: "Battle Phase",
  [PHASE_MAIN2]: "Main Phase 2",
  [PHASE_END]: "End Phase",
};

export const MSG_RETRY = 1;
export const MSG_HINT = 2;
export const MSG_WAITING = 3;
export const MSG_START = 4;
export const MSG_WIN = 5;
export const MSG_SELECT_BATTLECMD = 10;
export const MSG_SELECT_IDLECMD = 11;
export const MSG_SELECT_EFFECTYN = 12;
export const MSG_SELECT_YESNO = 13;
export const MSG_SELECT_OPTION = 14;
export const MSG_SELECT_CARD = 15;
export const MSG_SELECT_PLACE = 18;
export const MSG_SELECT_POSITION = 19;
export const MSG_NEW_TURN = 40;
export const MSG_NEW_PHASE = 41;
export const MSG_MOVE = 50;
export const MSG_DAMAGE = 91;
export const MSG_RECOVER = 92;
export const MSG_LPUPDATE = 94;

export const MESSAGE_NAMES: Readonly<Record<number, string>> = {
  1: "MSG_RETRY",
  2: "MSG_HINT",
  3: "MSG_WAITING",
  4: "MSG_START",
  5: "MSG_WIN",
  6: "MSG_UPDATE_DATA",
  7: "MSG_UPDATE_CARD",
  8: "MSG_REQUEST_DECK",
  10: "MSG_SELECT_BATTLECMD",
  11: "MSG_SELECT_IDLECMD",
  12: "MSG_SELECT_EFFECTYN",
  13: "MSG_SELECT_YESNO",
  14: "MSG_SELECT_OPTION",
  15: "MSG_SELECT_CARD",
  18: "MSG_SELECT_PLACE",
  19: "MSG_SELECT_POSITION",
  40: "MSG_NEW_TURN",
  41: "MSG_NEW_PHASE",
  50: "MSG_MOVE",
  60: "MSG_SUMMONING",
  61: "MSG_SUMMONED",
  90: "MSG_DRAW",
  91: "MSG_DAMAGE",
  92: "MSG_RECOVER",
  94: "MSG_LPUPDATE",
};

export function messageName(type: number): string {
  return MESSAGE_NAMES[type] ?? `MSG_${type}`;
}

export function phaseName(phase: number): string {
  return PHASE_NAMES[phase] ?? `Phase 0x${phase.toString(16)}`;
}

export function locationName(location: number): string {
  return LOCATION_NAMES[location] ?? `Location 0x${location.toString(16)}`;
}

/** Human-readable list of the individual position bits set in an engine mask. */
export function positionNames(mask: number): string[] {
  return Object.entries(POSITION_NAMES)
    .filter(([bit]) => (mask & Number(bit)) !== 0)
    .map(([, name]) => name);
}
