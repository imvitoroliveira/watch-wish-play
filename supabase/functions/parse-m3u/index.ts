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
    try {
      const trimmed = lines[i].trim();
      if (!trimmed || !trimmed.startsWith("#EXTINF:")) continue;

      const groupMatch = trimmed.match(/group-title="([^"]+)"/);
      if (groupMatch) currentGroup = groupMatch[1];

      // Skip live TV groups
      if (currentGroup && SKIP_GROUPS.test(currentGroup)) continue;

      // Extract title - try tvg-name first
      const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
      if (tvgMatch) {
        const cleaned = cleanTitle(tvgMatch[1]);
        if (cleaned.length > 1) titles.push(cleaned);
        continue;
      }
      // Fallback: text after last comma
      const commaIdx = trimmed.lastIndexOf(",");
      if (commaIdx !== -1) {
        const title = trimmed.substring(commaIdx + 1).trim();
        if (title) {
          const cleaned = cleanTitle(title);
          if (cleaned.length > 1) titles.push(cleaned);
        }
      }
    } catch {
      // Skip malformed lines, continue processing
      continue;
    }
  }

  return [...new Set(titles)];
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

// Fetch with retry and exponential backoff
async function fetchWithRetry(url: string, retries = 3, delayMs = 2000): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
      
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (err) {
      console.error(`Attempt ${attempt}/${retries} failed: ${(err as Error).message}`);
      if (attempt === retries) {
        throw new Error(`Failed after ${retries} attempts: ${(err as Error).message}`);
      }
      await new Promise(r => setTimeout(r, delayMs * attempt));
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

      let m3uContent = content || "";

      if (url && !m3uContent) {
        m3uContent = await fetchWithRetry(url);
      }

      if (!m3uContent) {
        return new Response(
          JSON.stringify({ error: "Provide a URL or content" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clear previous catalog BEFORE processing new one
      await supabase.from("m3u_catalog").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          titles: [],
          source_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      // Parse ALL titles
      const titles = parseM3UTitles(m3uContent);

      // Save new catalog
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
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
