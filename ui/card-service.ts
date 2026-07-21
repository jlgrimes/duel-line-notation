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

interface CardCache {
  cachedAt: number;
  cards: Record<string, CardScan>;
}

const CACHE_KEY = "dln-card-scans-v1";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

export function useCardScans(manifest: DeckManifest): { scans: Record<string, CardScan>; loading: boolean } {
  const names = useMemo(() => Object.values(manifest.cards)
    .filter((card) => card.kind !== "token")
    .map((card) => card.name)
    .sort((left, right) => left.localeCompare(right)), [manifest]);
  const [scans, setScans] = useState<Record<string, CardScan>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = readCache();
    const cachedForDeck = Object.fromEntries(names.flatMap((name) => cached.cards[name] ? [[name, cached.cards[name]!]] : []));
    setScans(cachedForDeck);

    const missing = names.filter((name) => !cached.cards[name]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({ names: missing.join("|") });
    fetch(`/api/cards?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Card lookup failed");
        return response.json() as Promise<CardResponse>;
      })
      .then((response) => {
        if (!active) return;
        const resolved = response.cards ?? {};
        const merged = { ...cached.cards, ...resolved };
        setScans(Object.fromEntries(names.flatMap((name) => merged[name] ? [[name, merged[name]!]] : [])));
        writeCache(merged);
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

function readCache(): CardCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CardCache | null;
    if (parsed && Date.now() - parsed.cachedAt < CACHE_TTL && parsed.cards) return parsed;
  } catch {
    // A corrupt or unavailable local cache should never block playback.
  }
  return { cachedAt: 0, cards: {} };
}

function writeCache(cards: Record<string, CardScan>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), cards } satisfies CardCache));
  } catch {
    // Browsers may disable or exhaust local storage; the CDN cache remains effective.
  }
}
