import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChannelStatus {
  name: string;
  url: string;
  status: "online" | "offline" | "maintenance";
  httpCode: number | null;
  checkedAt: string;
}

function parseLiveChannels(content: string): { name: string; url: string }[] {
  const channels: { name: string; url: string }[] = [];
  const lines = content.split("\n");
  const LIVE_GROUPS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|noticia|infantil|music|24h|premiere|espn|hbo|globo|tnt|discovery|band|sbt|record|sportv|combate|fox|star|paramount)\b/i;

  let currentName = "";
  let isLive = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#EXTINF:")) {
      const groupMatch = trimmed.match(/group-title="([^"]+)"/);
      const group = groupMatch ? groupMatch[1] : "";
      isLive = LIVE_GROUPS.test(group) || !group;
      if (isLive) {
        const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
        if (tvgMatch) {
          currentName = tvgMatch[1].trim();
        } else {
          const commaIdx = trimmed.lastIndexOf(",");
          if (commaIdx !== -1) {
            currentName = trimmed.substring(commaIdx + 1).trim();
          }
        }
      } else {
        currentName = "";
      }
    } else if (trimmed && !trimmed.startsWith("#") && currentName) {
      channels.push({ name: currentName, url: trimmed });
      currentName = "";
    }
  }
  return channels;
}

async function checkUrl(url: string): Promise<{ code: number | null; ok: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    clearTimeout(timer);
    return { code: res.status, ok: res.status >= 200 && res.status < 400 };
  } catch (_e) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-0" },
        redirect: "follow",
      });
      clearTimeout(timer);
      return { code: res.status, ok: res.status >= 200 && res.status < 400 };
    } catch (_e2) {
      return { code: null, ok: false };
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: catalog } = await supabase
      .from("m3u_catalog")
      .select("source_url")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (!catalog?.source_url) {
      return new Response(
        JSON.stringify({ channels: [], error: "No M3U source configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Monitor] Fetching M3U from:", catalog.source_url);
    const m3uRes = await fetch(catalog.source_url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!m3uRes.ok) throw new Error("Failed to fetch M3U: " + m3uRes.status);
    const m3uContent = await m3uRes.text();

    const allChannels = parseLiveChannels(m3uContent);
    console.log("[Monitor] Found " + allChannels.length + " live channels");

    const seen = new Set<string>();
    const uniqueChannels: { name: string; url: string }[] = [];
    for (const ch of allChannels) {
      const key = ch.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChannels.push(ch);
      }
    }

    const reqUrl = new URL(req.url);
    const maxCheck = Math.min(parseInt(reqUrl.searchParams.get("limit") || "30"), 50);
    const PRIORITY = /premiere|espn|hbo|globo|tnt|discovery|band|sbt|record|sportv|combate|fox|star|paramount/i;
    const sorted = uniqueChannels.sort((a, b) => {
      const aP = PRIORITY.test(a.name) ? 0 : 1;
      const bP = PRIORITY.test(b.name) ? 0 : 1;
      return aP - bP;
    });
    const toCheck = sorted.slice(0, maxCheck);

    const results: ChannelStatus[] = [];
    const BATCH = 10;
    for (let i = 0; i < toCheck.length; i += BATCH) {
      const batch = toCheck.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (ch) => {
          const { code, ok } = await checkUrl(ch.url);
          return {
            name: ch.name,
            url: ch.url,
            status: ok ? "online" : (code && (code === 404 || code >= 500)) ? "maintenance" : "offline",
            httpCode: code,
            checkedAt: new Date().toISOString(),
          } as ChannelStatus;
        })
      );
      results.push(...batchResults);
    }

    console.log("[Monitor] Checked " + results.length + " channels");

    // Save results to database
    const now = new Date().toISOString();
    await supabase.from("channel_monitor_results").insert({
      channels: results,
      total_live: uniqueChannels.length,
      checked: results.length,
      checked_at: now,
    });

    // Keep only last 10 results - delete older ones
    const { data: allResults } = await supabase
      .from("channel_monitor_results")
      .select("id")
      .order("checked_at", { ascending: false });

    if (allResults && allResults.length > 10) {
      const idsToDelete = allResults.slice(10).map((r) => r.id);
      await supabase
        .from("channel_monitor_results")
        .delete()
        .in("id", idsToDelete);
      console.log("[Monitor] Cleaned up " + idsToDelete.length + " old results");
    }

    return new Response(
      JSON.stringify({
        channels: results,
        total_live: uniqueChannels.length,
        checked: results.length,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Monitor] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg, channels: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
