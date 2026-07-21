const IMAGE_ORIGIN = "https://images.ygoprodeck.com/images";
const PATHS = {
  full: "cards",
  small: "cards_small",
  cropped: "cards_cropped",
} as const;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const requestedSize = url.searchParams.get("size") ?? "small";
    if (!/^\d{4,10}$/.test(id) || !(requestedSize in PATHS)) {
      return new Response("Invalid card image request.", { status: 400 });
    }

    const size = requestedSize as keyof typeof PATHS;
    try {
      const upstream = await fetch(`${IMAGE_ORIGIN}/${PATHS[size]}/${id}.jpg`, {
        headers: { Accept: "image/jpeg", "User-Agent": "DLN-Line-Lab/0.1" },
      });
      if (!upstream.ok || !upstream.body) return new Response("Card image not found.", { status: 404 });

      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
          "Cache-Control": "public, max-age=2592000, immutable",
          "Vercel-CDN-Cache-Control": "public, max-age=31536000",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Card image service unavailable.", { status: 502 });
    }
  },
};
