import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseM3UTitles(content: string): string[] {
  const titles: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#EXTINF:")) continue;

    // Try tvg-name first
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

  return [...new Set(titles)].filter((t) => t.length > 1);
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(?\d{4}\)?\s*$/, "")
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/\s*\|.*$/, "")
    .replace(/^(VOD|FILME|SERIE)[:\s-]*/i, "")
    .replace(/\s*(HD|4K|FHD|SD|720p|1080p)\s*/gi, "")
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
      // Return cached catalog
      const { data } = await supabase
        .from("m3u_catalog")
        .select("titles, source_url, updated_at")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();

      return new Response(
        JSON.stringify({
          titles: data?.titles || [],
          source_url: data?.source_url || null,
          updated_at: data?.updated_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { url, content } = body;

      let m3uContent = content || "";

      // Fetch from URL if provided (no CORS issues on server)
      if (url && !m3uContent) {
        console.log(`[M3U] Fetching from URL: ${url}`);
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch M3U: ${res.status} ${res.statusText}`);
        }
        m3uContent = await res.text();
        console.log(`[M3U] Fetched ${m3uContent.length} bytes`);
      }

      if (!m3uContent) {
        return new Response(
          JSON.stringify({ error: "Provide a URL or content" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse titles
      const titles = parseM3UTitles(m3uContent);
      console.log(`[M3U] Parsed ${titles.length} unique titles`);

      // Save to DB
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
    console.error("[M3U] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
