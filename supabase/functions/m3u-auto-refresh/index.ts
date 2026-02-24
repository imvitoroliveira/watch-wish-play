import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const lines = buffer.split("\n");
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
      } catch { continue; }
    }
  }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get saved source_url
    const { data } = await supabase
      .from("m3u_catalog")
      .select("source_url")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    const sourceUrl = data?.source_url;
    if (!sourceUrl) {
      console.log("No M3U source URL saved, skipping auto-refresh");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_source_url" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Auto-refreshing M3U from: ${sourceUrl}`);

    // Fetch and parse
    const res = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const { titles, rawCount } = await streamParseM3U(res.body);
    console.log(`Parsed ${rawCount} raw entries -> ${titles.length} unique titles`);

    // Get previous titles for diff
    const { data: prevData } = await supabase
      .from("m3u_catalog")
      .select("titles")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    const previousTitles = new Set<string>((prevData?.titles as string[]) || []);
    const previousCount = previousTitles.size;

    // Find new titles (not in previous catalog)
    const newTitles = titles.filter((t: string) => !previousTitles.has(t));
    console.log(`Found ${newTitles.length} new titles (prev: ${previousCount}, now: ${titles.length})`);

    // Save to DB
    await supabase.from("m3u_catalog").upsert(
      {
        id: "00000000-0000-0000-0000-000000000001",
        titles,
        source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    // Store update diff (keep last 30 updates, limit new_titles to 500)
    if (newTitles.length > 0) {
      await supabase.from("m3u_updates").insert({
        new_titles: newTitles.slice(0, 500),
        total_new: newTitles.length,
        previous_count: previousCount,
        current_count: titles.length,
        updated_at: new Date().toISOString(),
      });

      // Cleanup old updates (keep last 30)
      const { data: allUpdates } = await supabase
        .from("m3u_updates")
        .select("id")
        .order("updated_at", { ascending: false });
      if (allUpdates && allUpdates.length > 30) {
        const toDelete = allUpdates.slice(30).map((u: any) => u.id);
        await supabase.from("m3u_updates").delete().in("id", toDelete);
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: titles.length, raw_count: rawCount, new_titles: newTitles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("m3u-auto-refresh error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
