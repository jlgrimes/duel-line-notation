/**
 * The shape of a card bundle and the rules for reading the card database.
 *
 * A bundle pairs `ocgcore`-shaped card records with the Lua scripts a duel needs. It is
 * produced by `packages/carddata` and, once the published core carries the script-resolver
 * exports, registered through the bridge.
 *
 * The unpacking rules live here rather than in the build script so they are testable
 * without the third-party database present, and so the runtime and the build cannot drift
 * apart on how a Link monster or a Pendulum scale is read.
 */

import { TYPE_LINK } from "./engine-constants.js";

/** One row of the pinned database's `datas` table, joined to its name. */
export interface CardDatabaseRow {
  id: number;
  name: string;
  alias: number;
  /** Up to four 16-bit archetype codes packed into one integer. */
  setcode: number | bigint;
  type: number;
  atk: number;
  def: number;
  /** Level in the low byte; Pendulum scales in bits 16-23 and 24-31. */
  level: number;
  race: number | bigint;
  attribute: number;
}

/** A card record in the shape `OCG_CardData` declares. */
export interface BundledCard {
  code: number;
  name: string;
  alias: number;
  type: number;
  level: number;
  leftScale: number;
  rightScale: number;
  attribute: number;
  /** Decimal string: the race mask is 64-bit and `RACE_YOKAI` does not fit in a number. */
  race: string;
  attack: number;
  defense: number;
  linkMarker: number;
  setcodes: number[];
}

export interface CardBundleSource {
  repository: string;
  commit: string;
  license: string;
}

export interface CardBundle {
  slug: string;
  name: string;
  sources: { cardDatabase: CardBundleSource; cardScripts: CardBundleSource };
  /** Loaded by the host after creating a duel; the core resolves the rest on demand. */
  entryScripts: string[];
  cards: BundledCard[];
  scripts: Record<string, string>;
}

/**
 * Splits the packed `setcode` column. The column holds up to four 16-bit values and zero
 * means "unused", so a zero slot is skipped rather than terminating the list.
 */
export function unpackSetcodes(packed: number | bigint): number[] {
  const setcodes: number[] = [];
  for (let shift = 0n; shift < 64n; shift += 16n) {
    const value = Number((BigInt(packed) >> shift) & 0xffffn);
    if (value !== 0) setcodes.push(value);
  }
  return setcodes;
}

/**
 * Converts a database row into a card record.
 *
 * Two columns do not mean what they appear to. The `level` column carries the Pendulum
 * scales in its upper bytes, and a Link monster keeps its marker mask in `def` rather than
 * a real Defence value.
 */
export function unpackCardRow(row: CardDatabaseRow): BundledCard {
  const isLink = (row.type & TYPE_LINK) !== 0;
  return {
    code: row.id,
    name: row.name,
    alias: row.alias,
    type: row.type,
    level: row.level & 0xff,
    leftScale: (row.level >>> 24) & 0xff,
    rightScale: (row.level >>> 16) & 0xff,
    attribute: row.attribute,
    race: BigInt(row.race).toString(),
    attack: row.atk,
    defense: isLink ? 0 : row.def,
    linkMarker: isLink ? row.def : 0,
    setcodes: unpackSetcodes(row.setcode),
  };
}

/** Splits a 64-bit race mask into the two 32-bit halves the bridge takes. */
export function splitRace(race: string): { low: number; high: number } {
  const value = BigInt(race);
  return {
    low: Number(value & 0xffffffffn),
    high: Number((value >> 32n) & 0xffffffffn),
  };
}
