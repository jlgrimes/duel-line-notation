import type { DeckManifest, Diagnostic, LineDocument } from "./model.js";

export const RESERVED = new Set([
  "ACT", "ADD", "ATK", "BAN", "CHAIN", "DES", "DISCARD", "DMG", "DRAW", "EQ",
  "FS", "LEVEL", "LINK", "LOOK", "LS", "NS", "PLACE", "REC", "RETURN", "REV",
  "RS", "SEND", "SET", "SHUF", "SS", "SY", "TR", "XS", "CL", "LP", "H", "D",
  "F", "G", "B", "X",
]);

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

  validateReferences(document.start, undefined, document, manifest, diagnostics);
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
