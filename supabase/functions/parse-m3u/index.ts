import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Groups to SKIP (live TV channels)
const SKIP_GROUPS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|notícia|infantil|music|rádio|radio|adult|xxx|pay.?per.?view|ppv|24h)\b/i;

function parseM3UTitles(content: string): string[] {
  const titles: string[] = [];
  const lines = content.split("\n");

  let currentGroup = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track group
    if (trimmed.startsWith("#EXTINF:")) {
      const groupMatch = trimmed.match(/group-title="([^"]+)"/);
      if (groupMatch) currentGroup = groupMatch[1];

      // Skip live TV groups
      if (currentGroup && SKIP_GROUPS.test(currentGroup)) continue;

      // Extract title - try tvg-name first
      const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
      if (tvgMatch) {
        titles.push(cleanTitle(tvgMatch[1]));
        continue;
      }
      // Fallback: text after last comma
      const commaIdx = trimmed.lastIndexOf(",");
      if (commaIdx !== -1) {
        const title = trimmed.substring(commaIdx + 1).trim();
        if (title) titles.push(cleanTitle(title));
      }
    }
  }

  return [...new Set(titles)].filter((t) => t.length > 1);
}

function cleanTitle(title: string): string {
  return title
    // Remove resolution/quality prefixes & suffixes
    .replace(/^(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*[-–:]\s*/gi, "")
    .replace(/\s*(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*/gi, " ")
    // Remove VOD/FILME/SERIE prefixes
    .replace(/^(VOD|FILME|FILMES|SERIE|SERIES|MOVIE|MOVIES)[:\s-]*/i, "")
    // Remove language tags
    .replace(/\s*\[(DUB|LEG|DUAL|NAC|PT|EN|SPA)\w*\]\s*/gi, "")
    .replace(/\s*\((DUB|LEG|DUAL|NAC|DUBLADO|LEGENDADO)\)\s*/gi, "")
    // Remove year in parens at end
    .replace(/\s*\(?\d{4}\)?\s*$/, "")
    // Remove bracket content
    .replace(/\s*\[.*?\]\s*/g, "")
    // Remove pipe and after
    .replace(/\s*\|.*$/, "")
    // Remove season/episode markers for series
    .replace(/\s*S\d{1,2}\s*E\d{1,3}.*$/i, "")
    .replace(/\s*T\d{1,2}\s*E\d{1,3}.*$/i, "")
    // Remove trailing dash content (often extra metadata)
    .replace(/\s+[-–]\s*$/, "")
    .trim();
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

      // If random param, return a random sample from the full catalog
      if (randomCount > 0 && titles.length > 0) {
        // Fisher-Yates shuffle on a copy, then slice
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

      let m3uContent = content || "";

      if (url && !m3uContent) {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch M3U: ${res.status} ${res.statusText}`);
        }
        m3uContent = await res.text();
      }

      if (!m3uContent) {
        return new Response(
          JSON.stringify({ error: "Provide a URL or content" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse ALL titles (no limit)
      const titles = parseM3UTitles(m3uContent);

      await supabase.from("m3u_catalog").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          titles: titles,
          source_url: url || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return new Response(
        JSON.stringify({ success: true, count: titles.length, titles }),
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
