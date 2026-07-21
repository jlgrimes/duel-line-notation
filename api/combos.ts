import { getCombo, listCombos } from "../server/catalog-store.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();

    try {
      if (id) {
        if (id.length > 160 || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) return json({ error: "Invalid combo id." }, 400);
        const result = await getCombo(id);
        if (!result.combo) return json({ error: "Combo not found." }, 404);
        return json(result, 200, cacheHeaders(300));
      }
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
      return json(await listCombos(query), 200, cacheHeaders(60));
    } catch (error) {
      console.error("Combo catalog query failed", error);
      return json({ error: "The combo catalog is temporarily unavailable." }, 503);
    }
  },
};

function cacheHeaders(maxAge: number): Record<string, string> {
  return {
    "Cache-Control": `public, max-age=${maxAge}`,
    "Vercel-CDN-Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=86400`,
  };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
