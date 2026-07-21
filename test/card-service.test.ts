import assert from "node:assert/strict";
import test from "node:test";
import cardImage from "../api/card-image.js";
import cards from "../api/cards.js";

test("card metadata service rejects empty and oversized lookups", async () => {
  const empty = await cards.fetch(new Request("https://example.test/api/cards"));
  assert.equal(empty.status, 400);

  const names = Array.from({ length: 41 }, (_, index) => `Card ${index}`).join("|");
  const oversized = await cards.fetch(new Request(`https://example.test/api/cards?names=${encodeURIComponent(names)}`));
  assert.equal(oversized.status, 400);
});

test("image proxy only accepts numeric card IDs and known sizes", async () => {
  const badId = await cardImage.fetch(new Request("https://example.test/api/card-image?id=../secret&size=small"));
  const badSize = await cardImage.fetch(new Request("https://example.test/api/card-image?id=46986414&size=original"));
  assert.equal(badId.status, 400);
  assert.equal(badSize.status, 400);
});
