interface YgoCardImage {
  id: number;
}

interface YgoCard {
  id: number;
  name: string;
  type: string;
  atk?: number;
  def?: number;
  level?: number;
  linkval?: number;
  card_images?: YgoCardImage[];
}

interface YgoResponse {
  data?: YgoCard[];
}

const CARD_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const MAX_NAMES = 40;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    const url = new URL(request.url);
    const names = uniqueNames(url.searchParams.get("names"));
    if (names.length === 0) return json({ error: "Pass one or more pipe-separated card names." }, 400);
    if (names.length > MAX_NAMES) return json({ error: `A maximum of ${MAX_NAMES} names may be resolved at once.` }, 400);

    const upstreamUrl = new URL(CARD_API);
    upstreamUrl.searchParams.set("name", names.join("|"));

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { Accept: "application/json", "User-Agent": "DLN-Line-Lab/0.1" },
      });
      if (!upstream.ok) {
        return json({ error: "The card database could not resolve this request." }, upstream.status === 400 ? 404 : 502);
      }

      const payload = await upstream.json() as YgoResponse;
      const cards = Object.fromEntries((payload.data ?? []).flatMap((card) => {
        const image = card.card_images?.[0];
        if (!image || !Number.isSafeInteger(image.id)) return [];
        return [[card.name, {
          id: image.id,
          name: card.name,
          type: card.type,
          ...(card.atk === undefined ? {} : { atk: card.atk }),
          ...(card.def === undefined ? {} : { def: card.def }),
          ...(card.level === undefined ? {} : { level: card.level }),
          ...(card.linkval === undefined ? {} : { link: card.linkval }),
          imageUrl: `/api/card-image?id=${image.id}&size=small`,
        }]];
      }));

      return json({ cards, provider: "YGOPRODeck v7" }, 200, {
        "Cache-Control": "public, max-age=86400",
        "Vercel-CDN-Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      });
    } catch {
      return json({ error: "The card database is temporarily unavailable." }, 502);
    }
  },
};

function uniqueNames(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split("|").map((name) => name.trim()).filter((name) => name.length > 0 && name.length <= 120))]
    .sort((left, right) => left.localeCompare(right));
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
