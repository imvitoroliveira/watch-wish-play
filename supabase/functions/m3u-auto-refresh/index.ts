import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SKIP_GROUPS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|notícia|infantil|music|rádio|radio|adult|xxx|pay.?per.?view|ppv|24h)\b/i;

// Max time for the entire operation (120s to stay under 150s Edge Function limit)
const MAX_EXECUTION_MS = 120_000;

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

async function streamParseM3U(
  stream: ReadableStream<Uint8Array>,
  deadline: number
): Promise<{ titles: string[]; rawCount: number; timedOut: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const titlesSet = new Set<string>();
  let buffer = "";
  let currentGroup = "";
  let rawCount = 0;
  let timedOut = false;

  try {
    while (true) {
      // Check time budget before reading next chunk
      if (Date.now() > deadline) {
        timedOut = true;
        console.warn(`[m3u] Time budget exceeded after ${rawCount} raw entries, ${titlesSet.size} unique titles`);
        break;
      }

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
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  // Process remaining buffer if not timed out
  if (!timedOut && buffer.trim().startsWith("#EXTINF:")) {
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

  return { titles: [...titlesSet], rawCount, timedOut };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const deadline = startTime + MAX_EXECUTION_MS;

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
      console.log("[m3u] No source URL saved, skipping");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_source_url" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[m3u] Auto-refreshing from: ${sourceUrl}`);

    // Fetch with 60s timeout via AbortController
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 60_000);

    let res: Response;
    try {
      res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      const msg = (fetchErr as Error).name === "AbortError"
        ? "M3U fetch timed out after 60s"
        : (fetchErr as Error).message;
      console.error(`[m3u] Fetch failed: ${msg}`);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(fetchTimeout);

    if (!res.ok) throw new Error(`HTTP ${res.status} from M3U source`);
    if (!res.body) throw new Error("No response body");

    const { titles, rawCount, timedOut } = await streamParseM3U(res.body, deadline);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[m3u] Parsed ${rawCount} raw -> ${titles.length} unique in ${elapsed}s${timedOut ? " (TIMED OUT)" : ""}`);

    // Only save if we got a reasonable number of titles (>100 to avoid corrupt data)
    if (titles.length < 100) {
      console.warn(`[m3u] Only ${titles.length} titles parsed, skipping save to prevent data loss`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "too_few_titles", count: titles.length, timed_out: timedOut }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get previous titles for diff
    const { data: prevData } = await supabase
      .from("m3u_catalog")
      .select("titles")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    const previousTitles = new Set<string>((prevData?.titles as string[]) || []);
    const previousCount = previousTitles.size;

    // Find new titles
    const newTitles = titles.filter((t: string) => !previousTitles.has(t));
    console.log(`[m3u] ${newTitles.length} new titles (prev: ${previousCount}, now: ${titles.length})`);

    // Save catalog
    await supabase.from("m3u_catalog").upsert(
      {
        id: "00000000-0000-0000-0000-000000000001",
        titles,
        source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    // Store update diff if new titles found
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

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[m3u] Complete in ${totalElapsed}s`);

    return new Response(
      JSON.stringify({
        success: true,
        count: titles.length,
        raw_count: rawCount,
        new_titles: newTitles.length,
        elapsed_s: totalElapsed,
        timed_out: timedOut,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[m3u] Error after ${elapsed}s:`, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message, elapsed_s: elapsed }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
