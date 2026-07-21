import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface RegistrySource {
  id: string;
  url: string;
  status: string;
  importPolicy: string;
}

test("combo source registry has unique, attributable entries", async () => {
  const registry = JSON.parse(await readFile("decks/sources.json", "utf8")) as {
    auditedAsOf: string;
    sources: RegistrySource[];
  };

  assert.match(registry.auditedAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(registry.sources.length >= 5);
  assert.equal(new Set(registry.sources.map((source) => source.id)).size, registry.sources.length);
  for (const source of registry.sources) {
    assert.doesNotThrow(() => new URL(source.url));
    assert.ok(source.importPolicy.length > 10);
  }
  assert.ok(registry.sources.some((source) => source.status === "import-ready"));
  assert.ok(registry.sources.some((source) => source.status === "source-backed"));
});
