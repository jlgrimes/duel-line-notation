import { useEffect, useMemo, useState } from "react";
import type { DeckManifest } from "../src/model.js";

export interface CardScan {
  id: number;
  name: string;
  type: string;
  imageUrl: string;
  atk?: number;
  def?: number;
  level?: number;
  link?: number;
}

interface CardResponse {
  cards?: Record<string, CardScan>;
}

const memoryCache: Record<string, CardScan> = {};

export function useCardScans(manifest: DeckManifest): { scans: Record<string, CardScan>; loading: boolean } {
  const names = useMemo(() => Object.values(manifest.cards)
    .filter((card) => card.kind !== "token")
    .map((card) => card.name)
    .sort((left, right) => left.localeCompare(right)), [manifest]);
  const [scans, setScans] = useState<Record<string, CardScan>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cachedForDeck = Object.fromEntries(names.flatMap((name) => memoryCache[name] ? [[name, memoryCache[name]!]] : []));
    setScans(cachedForDeck);

    const missing = names.filter((name) => !memoryCache[name]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    Promise.all(chunk(missing, 40).map(async (batch) => {
      const query = new URLSearchParams({ names: batch.join("|") });
      const response = await fetch(`/api/cards?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Card lookup failed");
      return response.json() as Promise<CardResponse>;
    }))
      .then((responses) => {
        if (!active) return;
        const resolved = Object.assign({}, ...responses.map((response) => response.cards ?? {})) as Record<string, CardScan>;
        Object.assign(memoryCache, resolved);
        setScans(Object.fromEntries(names.flatMap((name) => memoryCache[name] ? [[name, memoryCache[name]!]] : [])));
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setScans(cachedForDeck);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      controller.abort();
    };
  }, [names]);

  return { scans, loading };
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}
