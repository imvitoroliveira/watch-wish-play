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

/**
 * Protege credenciais em URLs antes de salvar no banco.
 * Substitui valores de 'username' e 'password' por placeholders.
 */
function redactUrl(url: string): string {
  if (!url) return "";
  return url
    .replace(/(username|user)=([^&]+)/gi, "$1=[USER]")
    .replace(/(password|pass)=([^&]+)/gi, "$1=[PASS]")
    // Também protege o padrão XTream no caminho da URL: /movie/user/pass/id.ext
    .replace(/\/(?:movie|series|live)\/([^/]+)\/([^/]+)\/(\d+\.[a-z0-9]+)/i, (match, u, p, rest) => {
      return match.replace(u, "[USER]").replace(p, "[PASS]");
    });
}

function extractIdFromUrl(url: string): string {
  if (!url) return "";
  
  // XTream standard: /movie/u/p/ID.ext
  const xtreamMatch = url.match(/\/(?:movie|series|live)\/[^/]+\/[^/]+\/(\d+)\.[a-z0-9]+(?:\?.*)?$/i);
  if (xtreamMatch) return xtreamMatch[1];
  
  // Generic pattern: /ID.ext
  const genericMatch = url.match(/\/(\d+)\.[a-z0-9]+(?:\?.*)?$/i);
  if (genericMatch) return genericMatch[1];
  
  // Se não encontrar ID numérico, retorna a URL camuflada como "ID"
  return redactUrl(url);
}


async function processXtreamAPI(url: string, proxyRequest: Request): Promise<{ titles: string[]; rawCount: number }> {
  const titlesSet = new Set<string>();
  let rawCount = 0;

  try {
    const credsMatch = url.match(/^(.+)\/get\.php\?username=([^&]+)&password=([^&]+)/i);
    if (!credsMatch) throw new Error("Invalid XTream URL for API processing");
    
    const baseUrl = credsMatch[1];
    const username = credsMatch[2];
    const password = credsMatch[3];

    // 1. VOD Streams
    const vodUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
    console.log("Fetching XTream VOD:", vodUrl);
    
    const resVod = await fetch(vodUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
    if (resVod.ok) {
      const vodData = await resVod.json();
      if (Array.isArray(vodData)) {
        vodData.forEach(item => {
          rawCount++;
          const streamId = String(item.stream_id || "");
          if (item.name && streamId) {
            const cleaned = cleanTitle(item.name);
            if (cleaned.length > 1) {
              titlesSet.add(`${cleaned}|${streamId}|0`);
            }
          }
        });
      }
    }

    // 2. Series
    const seriesUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_series`;
    console.log("Fetching XTream Series:", seriesUrl);
    
    const resSeries = await fetch(seriesUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
    if (resSeries.ok) {
      const seriesData = await resSeries.json();
      if (Array.isArray(seriesData)) {
        seriesData.forEach(item => {
          rawCount++;
          const seriesId = String(item.series_id || "");
          if (item.name && seriesId) {
            const cleaned = cleanTitle(item.name);
            if (cleaned.length > 1) {
              titlesSet.add(`${cleaned}|${seriesId}|1`);
            }
          }
        });
      }
    }
  } catch (err) {
    console.error("XTream API Parse Error:", err);
  }

  return { titles: [...titlesSet], rawCount };
}


async function streamParseM3U(stream: ReadableStream<Uint8Array>): Promise<{ titles: string[]; rawCount: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const titlesSet = new Set<string>();
  let buffer = "";
  let currentGroup = "";
  let lastInfLine = "";
  let rawCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("#EXTINF:")) {
        lastInfLine = trimmed;
        rawCount++;
        continue;
      }

      // If it's a URL and we have a previous #EXTINF
      if (lastInfLine && !trimmed.startsWith("#")) {
        try {
          const groupMatch = lastInfLine.match(/group-title="([^"]+)"/i);
          if (groupMatch) currentGroup = groupMatch[1];

          if (currentGroup && SKIP_GROUPS.test(currentGroup)) {
            lastInfLine = "";
            continue;
          }

          let title = "";
          const tvgMatch = lastInfLine.match(/tvg-name="([^"]+)"/i);
          if (tvgMatch) {
            title = tvgMatch[1];
          } else {
            const commaIdx = lastInfLine.lastIndexOf(",");
            if (commaIdx !== -1) title = lastInfLine.substring(commaIdx + 1).trim();
          }

          if (title) {
            const cleaned = cleanTitle(title);
            if (cleaned.length > 1) {
              const streamId = extractIdFromUrl(trimmed);
              const isSeries = currentGroup && /\b(série|series|tv.?show|temporada|season)\b/i.test(currentGroup) ? "1" : "0";
              
              if (streamId) {
                titlesSet.add(`${cleaned}|${streamId}|${isSeries}`);
              } else {
                titlesSet.add(cleaned);
              }
            }
          }
        } catch { /* skip */ }
        lastInfLine = "";
      }
    }
  }

  return { titles: [...titlesSet], rawCount };
}

function parseM3UContent(content: string): { titles: string[]; rawCount: number } {
  const titlesSet = new Set<string>();
  const lines = content.split("\n");
  let currentGroup = "";
  let lastInfLine = "";
  let rawCount = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXTINF:")) {
      lastInfLine = trimmed;
      rawCount++;
      continue;
    }

    if (lastInfLine && !trimmed.startsWith("#")) {
      try {
        const groupMatch = lastInfLine.match(/group-title="([^"]+)"/i);
        if (groupMatch) currentGroup = groupMatch[1];
        if (currentGroup && SKIP_GROUPS.test(currentGroup)) {
          lastInfLine = "";
          continue;
        }

        let title = "";
        const tvgMatch = lastInfLine.match(/tvg-name="([^"]+)"/i);
        if (tvgMatch) {
          title = tvgMatch[1];
        } else {
          const commaIdx = lastInfLine.lastIndexOf(",");
          if (commaIdx !== -1) title = lastInfLine.substring(commaIdx + 1).trim();
        }

        if (title) {
          const cleaned = cleanTitle(title);
          if (cleaned.length > 1) {
            const streamId = extractIdFromUrl(trimmed);
            const isSeries = currentGroup && /\b(série|series|tv.?show|temporada|season)\b/i.test(currentGroup) ? "1" : "0";
            if (streamId) {
              titlesSet.add(`${cleaned}|${streamId}|${isSeries}`);
            } else {
              titlesSet.add(cleaned);
            }
          }
        }
      } catch { /* skip */ }
      lastInfLine = "";
    }
  }

  return { titles: [...titlesSet], rawCount };
}

async function fetchM3UStream(url: string, retries = 3): Promise<ReadableStream<Uint8Array>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
        const shuffled = [...titles].sort(() => Math.random() - 0.5);
        titles = shuffled.slice(0, Math.min(randomCount, shuffled.length));
      }

      return new Response(JSON.stringify({
        titles,
        total: (data?.titles as string[])?.length || 0,
        updated_at: data?.updated_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { url, content } = body;

      const { data: prevData } = await supabase
        .from("m3u_catalog")
        .select("titles")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();

      const previousTitles = new Set<string>((prevData?.titles as string[]) || []);
      const previousCount = previousTitles.size;

      let titles: string[] = [];
      let rawCount = 0;

      if (content) {
        const result = parseM3UContent(content);
        titles = result.titles;
        rawCount = result.rawCount;
      } else if (url) {
        if (url.includes('get.php') && url.includes('username=') && url.includes('password=')) {
          const result = await processXtreamAPI(url, req);
          titles = result.titles;
          rawCount = result.rawCount;
        } else {
          const stream = await fetchM3UStream(url);
          const result = await streamParseM3U(stream);
          titles = result.titles;
          rawCount = result.rawCount;
        }
      }

      if (titles.length === 0) {
        throw new Error("Nenhum título VOD/Série encontrado para processar.");
      }

      const newTitles = titles.filter(t => !previousTitles.has(t));
      
      await supabase.from("m3u_catalog").upsert({
        id: "00000000-0000-0000-0000-000000000001",
        titles,
        source_url: url || null,
        updated_at: new Date().toISOString(),
      });

      if (newTitles.length > 0) {
        await supabase.from("m3u_updates").insert({
          new_titles: newTitles.slice(0, 500),
          total_new: newTitles.length,
          previous_count: previousCount,
          current_count: titles.length,
          updated_at: new Date().toISOString(),
        });
        
        const { data: allUpdates } = await supabase.from("m3u_updates").select("id").order("updated_at", { ascending: false });
        if (allUpdates && allUpdates.length > 30) {
          const toDelete = allUpdates.slice(30).map(u => u.id);
          await supabase.from("m3u_updates").delete().in("id", toDelete);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        count: titles.length, 
        raw_count: rawCount, 
        new_titles: newTitles.length, 
        titles 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE") {
      await supabase.from("m3u_catalog").upsert({
        id: "00000000-0000-0000-0000-000000000001",
        titles: [],
        source_url: null,
        updated_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
