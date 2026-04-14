import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Max-Age": "86400",
};

/**
 * Normaliza um título para busca (remove acentos, símbolos e espaços extras)
 */
function normalizeForSearch(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tenta extrair Sxx Exx de uma string com alta precisão
 */
function extractSeasonEpisode(text: string) {
  // Padrões comuns: S01 E01, T01 E01, 1x01, EP.01, Capitulo 01
  const patterns = [
    /S(\d{1,2})\s?E(\d{1,3})/i,
    /T(\d{1,2})\s?E(\d{1,3})/i,
    /(\d{1,2})x(\d{1,3})/i,
    /EP\.?\s?(\d{1,3})/i,
    /Cap(?:itulo)?\.?\s?(\d{1,3})/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      if (match.length === 3) {
        return { season: parseInt(match[1]), episode: parseInt(match[2]) };
      } else {
        // Apenas episódio encontrado (assume temporada 1 ou tenta extrair do contexto anterior no futuro)
        return { season: 1, episode: parseInt(match[1]) };
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { series_id, title: searchTerm } = body;

    if (!series_id || !searchTerm) {
      throw new Error("Series ID and Search Term are required");
    }

    console.log(`[series-lookup] Iniciando para: "${searchTerm}" (ID: ${series_id})`);

    const { data: catalog } = await supabase
      .from("m3u_catalog")
      .select("source_url")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (!catalog?.source_url) throw new Error("No M3U source configured");

    const m3uSource = catalog.source_url;
    const match = m3uSource.match(/^(.+)\/get\.php\?username=([^&]+)&password=([^&]+)/i);
    let domain = "", username = "", password = "";
    
    if (match) {
      domain = match[1];
      username = match[2];
      password = match[3];
    }

    let episodes: any[] = [];

    // --- ESTRATÉGIA 1: XTream API (se disponível e tiver ID numérico) ---
    const isNumericId = /^\d+$/.test(String(series_id));
    if (domain && isNumericId && series_id !== "0") {
      try {
        const xtreamUrl = `${domain}/player_api.php?username=${username}&password=${password}&action=get_series_info&series_id=${series_id}`;
        console.log(`[series-lookup] Tentando API XTream: ${xtreamUrl.replace(password, '***')}`);
        
        const res = await fetch(xtreamUrl, { headers: { "User-Agent": "VLC/3.0.18" } });
        if (res.ok) {
          const data = await res.json();
          if (data && data.episodes) {
            const raw = data.episodes;
            const processEps = (arr: any[], sNum?: string) => {
              arr.forEach(ep => {
                episodes.push({
                  episode: Number(ep.episode_num || ep.episode || 1),
                  season: Number(sNum || ep.season || 1),
                  url: `${domain}/series/${username}/${password}/${ep.id}.${ep.container_extension || 'mkv'}`,
                  title: ep.title || `Episódio ${ep.episode_num || ep.episode || 1}`
                });
              });
            };

            if (Array.isArray(raw)) processEps(raw);
            else Object.entries(raw).forEach(([s, arr]) => processEps(arr as any[], s));
          }
        }
      } catch (err) {
        console.warn("[series-lookup] XTream API falhou, tentando fallback...", err.message);
      }
    }

    // --- ESTRATÉGIA 2: Busca Local via Grep (Fallback M3U) ---
    if (episodes.length === 0) {
      console.log(`[series-lookup] Fallback: Iniciando busca via Grep em: ${m3uSource.replace(password, '***')}`);
      const res = await fetch(m3uSource, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastInfLine = "";
        const targetTitleNormalized = normalizeForSearch(searchTerm);

        console.log(`[series-lookup] Buscando por termo normalizado: "${targetTitleNormalized}"`);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#EXTINF:")) {
              lastInfLine = trimmed;
            } else if (lastInfLine && !trimmed.startsWith("#") && !trimmed.startsWith("http") === false) {
              const lineNormalized = normalizeForSearch(lastInfLine);
              if (lineNormalized.includes(targetTitleNormalized)) {
                const se = extractSeasonEpisode(lastInfLine);
                if (se) {
                  episodes.push({
                    episode: se.episode,
                    season: se.season,
                    url: trimmed,
                    title: `Episódio ${se.episode}`,
                    _raw: lastInfLine // Para debug se necessário
                  });
                }
              }
              lastInfLine = "";
            }
          }
          if (episodes.length > 1000) break; // Limite de segurança aumentado
        }
      }
    }

    episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    
    // Remover duplicatas de URL preservando a ordem
    const uniqueEps = Array.from(new Map(episodes.map(e => [e.url, e])).values());

    console.log(`[series-lookup] Finalizado: ${uniqueEps.length} episódios encontrados para "${searchTerm}".`);

    return new Response(JSON.stringify({ episodes: uniqueEps, domain }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`[series-lookup] Erro:`, (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
