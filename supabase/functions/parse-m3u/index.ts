import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Groups to SKIP (live TV channels)
const SKIP_GROUPS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|notícia|infantil|music|rádio|radio|adult|xxx|pay.?per.?view|ppv|24h)\b/i;

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

// Stream-parse M3U from a ReadableStream, processing line by line
async function streamParseM3U(stream: ReadableStream<Uint8Array>): Promise<{ titles: string[]; rawCount: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const titlesSet = new Set<string>();
  let buffer = "";
  let currentGroup = "";
  let rawCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from the buffer
    const lines = buffer.split("\n");
    // Keep the last partial line in the buffer
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      try {
        const trimmed = rawLine.trim();
        if (!trimmed || !trimmed.startsWith("#EXTINF:")) continue;
        rawCount++;

        const groupMatch = trimmed.match(/group-title="([^"]+)"/);
        if (groupMatch) currentGroup = groupMatch[1];

        if (currentGroup && SKIP_GROUPS.test(currentGroup)) continue;

        const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
        if (tvgMatch) {
          const cleaned = cleanTitle(tvgMatch[1]);
          if (cleaned.length > 1) titlesSet.add(cleaned);
          continue;
        }

        const commaIdx = trimmed.lastIndexOf(",");
        if (commaIdx !== -1) {
          const title = trimmed.substring(commaIdx + 1).trim();
          if (title) {
            const cleaned = cleanTitle(title);
            if (cleaned.length > 1) titlesSet.add(cleaned);
          }
        }
      } catch {
        continue;
      }
    }
  }

  // Process any remaining content in the buffer
  if (buffer.trim().startsWith("#EXTINF:")) {
    try {
      const trimmed = buffer.trim();
      const groupMatch = trimmed.match(/group-title="([^"]+)"/);
      if (groupMatch) currentGroup = groupMatch[1];
      if (!(currentGroup && SKIP_GROUPS.test(currentGroup))) {
        const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
        if (tvgMatch) {
          const cleaned = cleanTitle(tvgMatch[1]);
          if (cleaned.length > 1) titlesSet.add(cleaned);
        } else {
          const commaIdx = trimmed.lastIndexOf(",");
          if (commaIdx !== -1) {
            const title = trimmed.substring(commaIdx + 1).trim();
            if (title) {
              const cleaned = cleanTitle(title);
              if (cleaned.length > 1) titlesSet.add(cleaned);
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  return { titles: [...titlesSet], rawCount };
}

// Parse from string (for content passed directly)
function parseM3UTitles(content: string): { titles: string[]; rawCount: number } {
  const titlesSet = new Set<string>();
  const lines = content.split("\n");
  let currentGroup = "";
  let rawCount = 0;

  for (const rawLine of lines) {
    try {
      const trimmed = rawLine.trim();
      if (!trimmed || !trimmed.startsWith("#EXTINF:")) continue;
      rawCount++;

      const groupMatch = trimmed.match(/group-title="([^"]+)"/);
      if (groupMatch) currentGroup = groupMatch[1];
      if (currentGroup && SKIP_GROUPS.test(currentGroup)) continue;

      const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
      if (tvgMatch) {
        const cleaned = cleanTitle(tvgMatch[1]);
        if (cleaned.length > 1) titlesSet.add(cleaned);
        continue;
      }
      const commaIdx = trimmed.lastIndexOf(",");
      if (commaIdx !== -1) {
        const title = trimmed.substring(commaIdx + 1).trim();
        if (title) {
          const cleaned = cleanTitle(title);
          if (cleaned.length > 1) titlesSet.add(cleaned);
        }
      }
    } catch { continue; }
  }

  return { titles: [...titlesSet], rawCount };
}

// Fetch with retry and streaming support
async function fetchM3UStream(url: string, retries = 3): Promise<ReadableStream<Uint8Array>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");
      return res.body;
    } catch (err) {
      console.error(`Fetch attempt ${attempt}/${retries}: ${(err as Error).message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("Unreachable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const randomCount = parseInt(url.searchParams.get("random") || "0", 10);

      const { data } = await supabase
        .from("m3u_catalog")
        .select("titles, source_url, updated_at")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();

      let titles = (data?.titles as string[]) || [];

      if (randomCount > 0 && titles.length > 0) {
        const shuffled = [...titles];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        titles = shuffled.slice(0, Math.min(randomCount, shuffled.length));
      }

      return new Response(
        JSON.stringify({
          titles,
          total: (data?.titles as string[])?.length || 0,
          updated_at: data?.updated_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { url, content } = body;

      // Clear previous catalog first
      await supabase.from("m3u_catalog").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          titles: [],
          source_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      let titles: string[];
      let rawCount = 0;

      if (content) {
        const result = parseM3UTitles(content);
        titles = result.titles;
        rawCount = result.rawCount;
      } else if (url) {
        const stream = await fetchM3UStream(url);
        const result = await streamParseM3U(stream);
        titles = result.titles;
        rawCount = result.rawCount;
      } else {
        return new Response(
          JSON.stringify({ error: "Provide a URL or content" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Parsed ${rawCount} raw entries -> ${titles.length} unique titles`);

      // Save to DB
      await supabase.from("m3u_catalog").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          titles,
          source_url: url || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return new Response(
        JSON.stringify({ success: true, count: titles.length, raw_count: rawCount, titles }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "DELETE") {
      await supabase.from("m3u_catalog").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          titles: [],
          source_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("parse-m3u error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
