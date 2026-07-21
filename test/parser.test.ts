import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseLine, ParseError } from "../src/parser.js";
import { loadManifest, validateLine } from "../src/validate.js";

test("parses and validates the Mitsurugi reference line", async () => {
  const file = "decks/mitsurugi/lines/prayers-habakiri.dln";
  const document = parseLine(await readFile(file, "utf8"), file);
  const manifest = await loadManifest("decks/mitsurugi/deck.json");

  assert.equal(document.deck, "mitsurugi");
  assert.equal(document.steps.length, 4);
  assert.equal(document.steps[1]?.kind, "chain");
  assert.deepEqual(validateLine(document, manifest), []);
});

test("rejects an unclosed Chain", () => {
  const source = `
@deck mitsurugi
@line broken
@start H=[PRY]
1 CHAIN {
  CL1 PRY => ADD ARA:D>H
@end H=[ARA]
`;
  assert.throws(() => parseLine(source), ParseError);
});

test("reports unknown aliases", async () => {
  const source = `
@deck mitsurugi
@line typo
@start H=[PRY]
1 PRY => ADD WHO:D>H
@end H=[WHO]
`;
  const manifest = await loadManifest("decks/mitsurugi/deck.json");
  const diagnostics = validateLine(parseLine(source, "typo.dln"), manifest);
  assert.equal(diagnostics.filter((item) => item.message.includes("WHO")).length, 2);
});

test("requires contiguous step and Chain Link numbers", async () => {
  const source = `
@deck mitsurugi
@line numbering
@start H=[PRY]
2 CHAIN {
  CL2 PRY => ADD ARA:D>H
}
@end H=[ARA]
`;
  const manifest = await loadManifest("decks/mitsurugi/deck.json");
  const diagnostics = validateLine(parseLine(source, "numbering.dln"), manifest);
  assert.ok(diagnostics.some((item) => item.message === "Expected step 1, found 2."));
  assert.ok(diagnostics.some((item) => item.message === "Expected CL1, found CL2."));
});
