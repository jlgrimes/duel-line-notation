import assert from "node:assert/strict";
import test from "node:test";
import combos from "../api/combos.js";

test("combo catalog returns lightweight summaries and fetches details separately", async () => {
  const listResponse = await combos.fetch(new Request("https://example.test/api/combos"));
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as { combos: Array<Record<string, unknown>>; backend: string };
  assert.equal(list.backend, "file-fallback");
  assert.ok(list.combos.length >= 6);
  assert.equal("line" in list.combos[0]!, false);
  assert.equal("manifest" in list.combos[0]!, false);

  const id = String(list.combos[0]!.id);
  const detailResponse = await combos.fetch(new Request(`https://example.test/api/combos?id=${encodeURIComponent(id)}`));
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json() as { combo: { id: string; line: string; manifest: { cards: object } } };
  assert.equal(detail.combo.id, id);
  assert.match(detail.combo.line, /^@deck/m);
  assert.ok(Object.keys(detail.combo.manifest.cards).length > 0);
});

test("combo catalog rejects malformed ids", async () => {
  const response = await combos.fetch(new Request("https://example.test/api/combos?id=../secret"));
  assert.equal(response.status, 400);
});
