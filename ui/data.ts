import meta from "../decks/meta.json";
import sourceRegistry from "../decks/sources.json";

export type { ComboDetail, ComboSummary } from "../src/catalog-model.js";

export interface ComboSource {
  id: string;
  name: string;
  url: string;
  aboutUrl?: string;
  kind: string;
  scale: string;
  description: string;
  license: string;
  importPolicy: string;
  status: "source-backed" | "import-ready" | "discovery" | "supplemental";
  tags: string[];
}

export const metaSnapshot = meta;
export const comboSources = sourceRegistry.sources as ComboSource[];
export const sourceAudit = { auditedAsOf: sourceRegistry.auditedAsOf };
