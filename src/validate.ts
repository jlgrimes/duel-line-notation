import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DeckManifest, Diagnostic, LineDocument } from "./model.js";

const RESERVED = new Set([
  "ADD", "BAN", "CHAIN", "DISCARD", "DMG", "FS", "LS", "NS", "REC", "RS",
  "SEND", "SET", "SS", "SY", "TR", "XS", "CL", "LP", "H", "D", "F", "G", "B", "X",
]);

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

export function validateLine(document: LineDocument, manifest: DeckManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (document.deck !== manifest.slug) {
    diagnostics.push({ source: document.source, message: `Line declares deck '${document.deck}', expected '${manifest.slug}'.` });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.name)) {
    diagnostics.push({ source: document.source, message: `Invalid line slug '${document.name}'.` });
  }
  if (document.steps.length === 0) diagnostics.push({ source: document.source, message: "A line must contain at least one step." });

  document.steps.forEach((step, index) => {
    const expected = index + 1;
    if (step.number !== expected) {
      diagnostics.push({ source: document.source, line: step.line, message: `Expected step ${expected}, found ${step.number}.` });
    }
    if (step.kind === "chain") {
      if (step.links.length === 0) diagnostics.push({ source: document.source, line: step.line, message: "A CHAIN block must contain at least one Chain Link." });
      step.links.forEach((link, linkIndex) => {
        if (link.number !== linkIndex + 1) diagnostics.push({ source: document.source, line: link.line, message: `Expected CL${linkIndex + 1}, found CL${link.number}.` });
        validateReferences(link.expression, link.line, document, manifest, diagnostics);
      });
    } else {
      validateReferences(step.expression, step.line, document, manifest, diagnostics);
    }
  });

  validateReferences(document.start, 3, document, manifest, diagnostics);
  validateReferences(document.end, undefined, document, manifest, diagnostics);
  return diagnostics;
}

function validateReferences(
  expression: string,
  line: number | undefined,
  document: LineDocument,
  manifest: DeckManifest,
  diagnostics: Diagnostic[],
): void {
  const words = expression.match(/\b[A-Z][A-Z0-9_]{1,}\b/g) ?? [];
  for (const word of words) {
    if (RESERVED.has(word) || word.startsWith("CL")) continue;
    if (!(word in manifest.cards)) {
      diagnostics.push({
        source: document.source,
        ...(line === undefined ? {} : { line }),
        message: `Unknown card alias '${word}'.`,
      });
    }
  }
}

export function manifestPathFor(lineFile: string): string {
  return path.join(path.dirname(path.dirname(path.resolve(lineFile))), "deck.json");
}
