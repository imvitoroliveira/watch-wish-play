import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SKIP_GROUPS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|notícia|infantil|music|rádio|radio|adult|xxx|pay.?per.?view|ppv|24h)\b/i;
const MAX_EXECUTION_MS = 120_000;

// Multiple User-Agent strings to rotate on retries
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "VLC/3.0.21 LibVLC/3.0.21",
  "Lavf/60.16.100",
];

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

async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  timeoutMs: number = 60_000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const ua = USER_AGENTS[attempt % USER_AGENTS.length];

    try {
      // Add small delay between retries
      if (attempt > 0) {
        const delay = Math.min(2000 * attempt, 5000);
        console.log(`[m3u] Retry ${attempt + 1}/${maxRetries} after ${delay}ms (UA: ${ua.substring(0, 30)}...)`);
        await new Promise(r => setTimeout(r, delay));
      }

      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Connection": "keep-alive",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);

      if (res.ok) return res;

      // Consume body to avoid leaks
      await res.text();

      // 403/401 might be transient - retry with different UA
      if ((res.status === 403 || res.status === 401) && attempt < maxRetries - 1) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      throw new Error(`HTTP ${res.status} from M3U source`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err as Error;
      if ((err as Error).name === "AbortError") {
        lastError = new Error(`Fetch timed out (attempt ${attempt + 1})`);
      }
      if (attempt === maxRetries - 1) break;
    }
  }

  throw lastError || new Error("All fetch retries failed");
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get saved source_url
    const { data } = await supabase
      .from("m3u_catalog")
      .select("source_url, updated_at")
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

    const lastUpdate = data?.updated_at ? new Date(data.updated_at) : null;
    const hoursSinceUpdate = lastUpdate
      ? ((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)).toFixed(1)
      : "unknown";

    console.log(`[m3u] Auto-refreshing. Last update: ${hoursSinceUpdate}h ago. URL: ${sourceUrl.substring(0, 60)}...`);

    // Fetch with retry and varied User-Agents
    let res: Response;
    try {
      res = await fetchWithRetry(sourceUrl, 3, 60_000);
    } catch (fetchErr) {
      const errMsg = (fetchErr as Error).message;
      console.error(`[m3u] All fetch attempts failed: ${errMsg}`);

      // Log persistent failure as notification for admin
      await supabase.from("notifications").insert({
        title: "⚠️ Falha na Atualização M3U",
        body: `Todas as tentativas falharam: ${errMsg}. Última atualização: ${hoursSinceUpdate}h atrás. Verifique se a URL M3U ainda é válida.`,
        type: "system",
      }).catch(() => {});

      return new Response(
        JSON.stringify({ error: errMsg, hours_since_update: hoursSinceUpdate }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.body) throw new Error("No response body");

    const { titles, rawCount, timedOut } = await streamParseM3U(res.body, deadline);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[m3u] Parsed ${rawCount} raw -> ${titles.length} unique in ${elapsed}s${timedOut ? " (TIMED OUT)" : ""}`);

    // Safety check: don't overwrite with too few titles
    if (titles.length < 100) {
      console.warn(`[m3u] Only ${titles.length} titles parsed, skipping save`);

      // Alert admin if catalog seems broken
      if (parseFloat(hoursSinceUpdate) > 48) {
        await supabase.from("notifications").insert({
          title: "⚠️ Catálogo M3U Desatualizado",
          body: `Última atualização há ${hoursSinceUpdate}h. Parse retornou apenas ${titles.length} títulos. Verifique a URL fonte.`,
          type: "system",
        }).catch(() => {});
      }

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
