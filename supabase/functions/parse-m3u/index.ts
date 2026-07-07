import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Groups to SKIP (Rádios e Adultos)
const SKIP_GROUPS = /\b(rádio|radio|adult|xxx)\b/i;

// Palavras-chave para identificar CANAIS AO VIVO em arquivos M3U genéricos
const LIVE_KEYWORDS = /\b(canais?|tv|ao.?vivo|live|aberto|esporte|notícia|infantil|music|pay.?per.?view|ppv|24h|hbo|globo|sportv|premiere|bra|abertos|sports|kids|noticias|televisão|telecine|viva|warner|discovery|national|history|animal|fox|universal)\b/i;

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
 */
function redactUrl(url: string): string {
  if (!url) return "";
  return url
    .replace(/(username|user)=([^&]+)/gi, "$1=[USER]")
    .replace(/(password|pass)=([^&]+)/gi, "$1=[PASS]")
    .replace(/\/(?:movie|series|live)\/([^/]+)\/([^/]+)\/(\d+\.[a-z0-9]+)/i, (match, u, p, rest) => {
      return match.replace(u, "[USER]").replace(p, "[PASS]");
    });
}

function extractIdFromUrl(url: string): string {
  if (!url) return "";
  const xtreamMatch = url.match(/\/(?:movie|series|live)\/[^/]+\/[^/]+\/(\d+)\.[a-z0-9]+(?:\?.*)?$/i);
  if (xtreamMatch) return xtreamMatch[1];
  const genericMatch = url.match(/\/(\d+)\.[a-z0-9]+(?:\?.*)?$/i);
  if (genericMatch) return genericMatch[1];
  return redactUrl(url);
}

async function processXtreamAPI(url: string, proxyRequest: Request): Promise<{ titles: string[]; rawCount: number; stats: any }> {
  const titlesMap = new Map<string, string>(); // cleanedTitle -> streamId|type|categoryId
  let movieCount = 0;
  let seriesCount = 0;
  let liveCount = 0;
  let rawCount = 0;

  try {
    const credsMatch = url.match(/^(.+)\/get\.php\?username=([^&]+)&password=([^&]+)/i);
    if (!credsMatch) throw new Error("Invalid XTream URL for API processing");
    
    const baseUrl = credsMatch[1];
    const username = credsMatch[2];
    const password = credsMatch[3];

    // 0. VOD & Series categories (id -> name)
    const fetchCats = async (action: string): Promise<Record<string, string>> => {
      try {
        const r = await fetch(`${baseUrl}/player_api.php?username=${username}&password=${password}&action=${action}`, { headers: { "User-Agent": "VLC/3.0.18" } });
        if (!r.ok) return {};
        const arr = await r.json();
        const map: Record<string, string> = {};
        if (Array.isArray(arr)) arr.forEach((c: any) => { map[String(c.category_id)] = String(c.category_name || "").replace(/\|/g, "/").trim(); });
        return map;
      } catch { return {}; }
    };
    const [vodCats, seriesCats] = await Promise.all([fetchCats("get_vod_categories"), fetchCats("get_series_categories")]);
    console.log(`[parse-m3u] VOD categories: ${Object.keys(vodCats).length}, Series categories: ${Object.keys(seriesCats).length}`);

    // Persist VOD + Series category maps so frontend can resolve ids -> names
    try {
      const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb2 = createClient(supabaseUrl2, supabaseServiceKey2);
      await sb2.from("m3u_catalog").upsert({
        id: "00000000-0000-0000-0000-000000000003",
        titles: [JSON.stringify({ vod: vodCats, series: seriesCats })],
        updated_at: new Date().toISOString(),
      });
    } catch (e) { console.error("Failed to persist vod/series cats:", e); }

    // 1. VOD Streams
    const vodUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
    const resVod = await fetch(vodUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
    if (resVod.ok) {
      const vodData = await resVod.json();
      if (Array.isArray(vodData)) {
        vodData.forEach(item => {
          rawCount++;
          const streamId = String(item.stream_id || "");
          if (item.name && streamId) {
            const cleaned = cleanTitle(item.name);
            if (cleaned.length > 1 && !titlesMap.has(cleaned)) {
              const rawCatId = String(item.category_id || "");
              const catName = vodCats[rawCatId] || rawCatId || "";
              titlesMap.set(cleaned, `${streamId}|0|${catName}`);
              movieCount++;
            }
          }
        });
      }
    }

    // 2. Series
    const seriesUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_series`;
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
              const rawCatId = String(item.category_id || "");
              const catName = seriesCats[rawCatId] || rawCatId || "";
              titlesMap.set(cleaned, `${seriesId}|1|${catName}`);
              seriesCount++;
            }
          }
        });
      }
    }


    // 3. Live Streams (Canais)
    const liveUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
    const resLive = await fetch(liveUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
    if (resLive.ok) {
      const liveData = await resLive.json();
      if (Array.isArray(liveData)) {
        liveData.forEach(item => {
          rawCount++;
          const streamId = String(item.stream_id || "");
          if (item.name && streamId) {
            const cleaned = cleanTitle(item.name);
            const categoryId = item.category_id || "0";
            if (cleaned.length > 1) {
              titlesMap.set(cleaned, `${streamId}|2|${categoryId}`);
              liveCount++;
            }
          }
        });
      }
    }

    // 4. Live Categories
    const catUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
    const resCat = await fetch(catUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
    if (resCat.ok) {
      const catData = await resCat.json();
      if (Array.isArray(catData)) {
        const categoriesMap: Record<string, string> = {};
        catData.forEach(c => {
          categoriesMap[String(c.category_id)] = c.category_name;
        });
        
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase.from("m3u_catalog").upsert({
          id: "00000000-0000-0000-0000-000000000002",
          titles: [JSON.stringify(categoriesMap)],
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("XTream API Error:", err);
  }

  // Novo formato robusto: type|id|catId|name
  const titles = Array.from(titlesMap.entries()).map(([name, rest]) => {
    const [id, type, catId] = rest.split('|');
    return `${type}|${id}|${catId || ''}|${name}`;
  });

  return { 
    titles, 
    rawCount, 
    stats: { movieCount, seriesCount, liveCount, total: titles.length, rawTotal: rawCount } 
  };
}

function parseM3UContent(content: string): { titles: string[]; rawCount: number; stats: any } {
  const titlesMap = new Map<string, string>();
  const lines = content.split("\n");
  let currentGroup = "";
  let lastInfLine = "";
  let rawCount = 0;
  
  let movieCount = 0;
  let seriesCount = 0;
  let liveCount = 0;

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
            
            // Lógica de Detecção Robusta de Tipo
            const isSeriesRegex = /\b(série|series|temporada|season|S\d{1,2}|E\d{1,3})\b/i;
            const isLive = LIVE_KEYWORDS.test(title) || (currentGroup && LIVE_KEYWORDS.test(currentGroup));
            const isSeries = !isLive && ((currentGroup && isSeriesRegex.test(currentGroup)) || isSeriesRegex.test(title));
            
            const typeValue = isLive ? "2" : (isSeries ? "1" : "0");
            const groupClean = (currentGroup || "").replace(/\|/g, "/").trim();
            
            if (streamId) {
              const existing = titlesMap.get(cleaned);
              // Evitar que um episódio sobrescreva uma série já salva
              if (!existing) {
                titlesMap.set(cleaned, `${streamId}|${typeValue}|${groupClean}`);
                if (typeValue === "0") movieCount++;
                else if (typeValue === "1") seriesCount++;
                else liveCount++;
              }
            }
          }
        }
      } catch { /* skip */ }
      lastInfLine = "";
    }
  }

  const titles = Array.from(titlesMap.entries()).map(([name, rest]) => {
    const [id, type, group] = rest.split('|');
    return `${type}|${id}|${group || ''}|${name}`;
  });

  return { 
    titles, 
    rawCount, 
    stats: { movieCount, seriesCount, liveCount, total: titles.length, rawTotal: rawCount } 
  };
}

async function streamParseM3U(stream: ReadableStream<Uint8Array>): Promise<{ titles: string[]; rawCount: number; stats: any }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const titlesMap = new Map<string, string>();
  let buffer = "";
  let currentGroup = "";
  let lastInfLine = "";
  let rawCount = 0;
  
  let movieCount = 0;
  let seriesCount = 0;
  let liveCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("#EXTINF:")) { lastInfLine = trimmed; rawCount++; continue; }
      if (lastInfLine && !trimmed.startsWith("#")) {
        try {
          const groupMatch = lastInfLine.match(/group-title="([^"]+)"/i);
          if (groupMatch) currentGroup = groupMatch[1];
          if (currentGroup && SKIP_GROUPS.test(currentGroup)) { lastInfLine = ""; continue; }
          const commaIdx = lastInfLine.lastIndexOf(",");
          const title = commaIdx !== -1 ? lastInfLine.substring(commaIdx + 1).trim() : "";
          if (title) {
            const cleaned = cleanTitle(title);
            if (cleaned.length > 1) {
              const streamId = extractIdFromUrl(trimmed);
              const isLive = LIVE_KEYWORDS.test(title) || (currentGroup && LIVE_KEYWORDS.test(currentGroup));
              const isSeriesRegex = /\b(série|series|S\d{1,2})\b/i;
              const isSeries = !isLive && (isSeriesRegex.test(title) || (currentGroup && isSeriesRegex.test(currentGroup)));
              const typeValue = isLive ? "2" : (isSeries ? "1" : "0");
              const groupClean = (currentGroup || "").replace(/\|/g, "/").trim();
              if (streamId && !titlesMap.has(cleaned)) {
                titlesMap.set(cleaned, `${streamId}|${typeValue}|${groupClean}`);
                if (typeValue === "0") movieCount++; else if (typeValue === "1") seriesCount++; else liveCount++;
              }
            }
          }
        } catch { /* skip */ }
        lastInfLine = "";
      }
    }
  }

  const titles = Array.from(titlesMap.entries()).map(([name, rest]) => {
    const [id, type, group] = rest.split('|');
    return `${type}|${id}|${group || ''}|${name}`;
  });

  return { 
    titles, 
    rawCount, 
    stats: { movieCount, seriesCount, liveCount, total: titles.length, rawTotal: rawCount } 
  };
}

async function fetchM3UStream(url: string, retries = 3): Promise<ReadableStream<Uint8Array>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");
      return res.body;
    } catch (err) {
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
      if (url.searchParams.get("action") === "categories") {
        const { data } = await supabase.from("m3u_catalog").select("titles").eq("id", "00000000-0000-0000-0000-000000000002").maybeSingle();
        return new Response(JSON.stringify({ categories: data?.titles?.[0] ? JSON.parse(data.titles[0]) : {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (url.searchParams.get("action") === "vod_categories") {
        const { data } = await supabase.from("m3u_catalog").select("titles").eq("id", "00000000-0000-0000-0000-000000000003").maybeSingle();
        return new Response(JSON.stringify(data?.titles?.[0] ? JSON.parse(data.titles[0]) : { vod: {}, series: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      const { data } = await supabase.from("m3u_catalog").select("titles, updated_at").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
      const titles = (data?.titles as string[]) || [];
      
      const movieCount = titles.filter(t => t.startsWith('0|')).length;
      const seriesCount = titles.filter(t => t.startsWith('1|')).length;
      const liveCount = titles.filter(t => t.startsWith('2|')).length;
      
      return new Response(JSON.stringify({ 
        titles, 
        total: titles.length, 
        updated_at: data?.updated_at || null,
        stats: { movieCount, seriesCount, liveCount, total: titles.length }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { url, content } = body;
      const { data: prevData } = await supabase.from("m3u_catalog").select("titles").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
      const previousCount = ((prevData?.titles as string[]) || []).length;

      let result: any;
      if (content) {
        result = parseM3UContent(content);
      } else if (url) {
        if (url.includes('get.php') && url.includes('username=') && url.includes('password=')) {
          console.log("Tentando processamento via XTream API...");
          result = await processXtreamAPI(url, req);
          
          // Fallback: Se a API retornou 0 mas o arquivo pode ser um M3U baixável
          if (!result || result.titles.length === 0) {
            console.log("XTream API retornou 0 itens. Tentando fallback para M3U Stream...");
            const stream = await fetchM3UStream(url);
            result = await streamParseM3U(stream);
          }
        } else {
          console.log("Processando via M3U Stream...");
          const stream = await fetchM3UStream(url);
          result = await streamParseM3U(stream);
        }
      }

      if (!result || result.titles.length === 0) {
        throw new Error("Nenhum conteúdo encontrado na URL ou arquivo fornecido.");
      }

      await supabase.from("m3u_catalog").upsert({
        id: "00000000-0000-0000-0000-000000000001",
        titles: result.titles,
        source_url: url || null,
        updated_at: new Date().toISOString(),
      });

      // Calcular episódios (Estimativa: rawTotal - (M+S+L))
      const episodeEstimate = Math.max(0, result.stats.rawTotal - result.stats.total);
      const finalStats = { ...result.stats, episodes: episodeEstimate };

      console.log(`Processamento concluído: ${result.titles.length} únicos, ${episodeEstimate} episódios estimados.`);

      return new Response(JSON.stringify({ 
        success: true, 
        titles: result.titles, 
        stats: finalStats,
        new_titles: Math.max(0, result.titles.length - previousCount)
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
