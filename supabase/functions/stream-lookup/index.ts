import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Max-Age": "86400",
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/^(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*[-–:]\s*/gi, "")
    .replace(/\s*(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*/gi, " ")
    .replace(/^(VOD|FILME|FILMES|SERIE|SERIES|MOVIE|MOVIES)[:\s-]*/i, "")
    .replace(/\s*\[(DUB|LEG|DUAL|NAC|PT|EN|SPA)\w*\]\s*/gi, "")
    .replace(/\s*\((DUB|LEG|DUAL|NAC|DUBLADO|LEGENDADO)\)\s*/gi, "")
    .replace(/\s*\(?\d{4}\)?\s*$/, "")
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*S\d{1,2}\s*E\d{1,3}.*$/i, "")
    .replace(/\s*T\d{1,2}\s*E\d{1,3}.*$/i, "")
    .replace(/\s+[-–]\s*$/, "")
    .trim();
}

// Stream-parse M3U looking for a specific title, return its URL
async function findStreamUrl(
  stream: ReadableStream<Uint8Array>,
  searchNormalized: string
): Promise<string | null> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastMatchedTitle = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (trimmed.startsWith("#EXTINF:")) {
        // Extract title from this line
        let title = "";
        const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
        if (tvgMatch) {
          title = cleanTitle(tvgMatch[1]);
        } else {
          const commaIdx = trimmed.lastIndexOf(",");
          if (commaIdx !== -1) {
            title = cleanTitle(trimmed.substring(commaIdx + 1).trim());
          }
        }

        const normalized = normalizeTitle(title);
        lastMatchedTitle = normalized === searchNormalized;
      } else if (
        lastMatchedTitle &&
        trimmed &&
        !trimmed.startsWith("#") &&
        (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      ) {
        // This is the URL line right after the matching #EXTINF
        reader.cancel();
        return trimmed;
      } else if (!trimmed.startsWith("#")) {
        lastMatchedTitle = false;
      }
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { title } = await req.json();
    if (!title || typeof title !== "string") {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get source URL from catalog
    const { data: catalog } = await supabase
      .from("m3u_catalog")
      .select("source_url")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (!catalog?.source_url) {
      return new Response(
        JSON.stringify({ error: "No M3U source configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchNormalized = normalizeTitle(title);
    console.log(`[stream-lookup] Searching for: "${title}" (normalized: "${searchNormalized}")`);

    // Fetch M3U and stream-parse looking for the title
    const res = await fetch(catalog.source_url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok || !res.body) throw new Error(`Failed to fetch M3U: HTTP ${res.status}`);

    const streamUrl = await findStreamUrl(res.body, searchNormalized);

    if (streamUrl) {
      // NÃO forçar HTTPS — servidores IPTV usam HTTP e não possuem certificado SSL.
      // O proxy Cloudflare (HTTPS) cuida da segurança entre browser ↔ proxy.
      // O proxy então faz a requisição HTTP ao servidor IPTV internamente.
      console.log(`[stream-lookup] Found stream URL for "${title}" -> ${streamUrl.substring(0, 80)}`);
      return new Response(
        JSON.stringify({ stream_url: streamUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[stream-lookup] No match found for "${title}"`);
    return new Response(
      JSON.stringify({ error: "Stream not found", stream_url: null }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[stream-lookup] Error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
