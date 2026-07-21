import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DeckManifest } from "./model.js";
import { RESERVED, validateLine } from "./semantic.js";

export { validateLine } from "./semantic.js";

export async function loadManifest(file: string): Promise<DeckManifest> {
  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!raw || typeof raw !== "object") throw new Error("Manifest must be a JSON object.");
  const value = raw as Partial<DeckManifest>;
  if (value.schemaVersion !== 1) throw new Error("Manifest schemaVersion must be 1.");
  if (!value.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) throw new Error("Manifest has an invalid slug.");
  if (!value.name || typeof value.name !== "string") throw new Error("Manifest is missing a name.");
  if (!value.cards || typeof value.cards !== "object") throw new Error("Manifest is missing cards.");
  for (const [alias, card] of Object.entries(value.cards)) {
    if (!/^[A-Z][A-Z0-9_]{1,}$/.test(alias)) throw new Error(`Invalid card alias: ${alias}`);
    if (RESERVED.has(alias)) throw new Error(`Card alias is reserved: ${alias}`);
    if (!card.name || !card.kind) throw new Error(`Card ${alias} requires name and kind.`);
  }
  return value as DeckManifest;
}

export function manifestPathFor(lineFile: string): string {
  return path.join(path.dirname(path.dirname(path.resolve(lineFile))), "deck.json");
}
