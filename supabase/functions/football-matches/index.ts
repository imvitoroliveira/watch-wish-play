import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map ESPN status text to our internal codes
function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();

  // "F" = Finished
  if (s === "F" || s.toLowerCase() === "encerrado" || s.toLowerCase() === "fin") {
    return { status: "FT", elapsed: 90 };
  }
  // "HT" or "Int" = Half Time
  if (s === "HT" || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int") {
    return { status: "HT", elapsed: 45 };
  }
  // "AET" = After Extra Time
  if (s === "AET" || s.toLowerCase() === "prorrogação") return { status: "AET", elapsed: 120 };
  // "PEN" = Penalties
  if (s === "PEN" || s.toLowerCase() === "pênaltis") return { status: "PEN", elapsed: 120 };
  // Suspended / Postponed / Cancelled
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado")) return { status: "PST", elapsed: null };
  if (s.toLowerCase().includes("canc")) return { status: "CANC", elapsed: null };

  // Minute pattern: "37'" or "45+2'" or just "37"
  const minuteMatch = s.match(/^(\d+)['′+]?/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    if (min <= 45) return { status: "1H", elapsed: min };
    return { status: "2H", elapsed: min };
  }

  // Time pattern: "21:30" = Not Started
  if (/^\d{1,2}:\d{2}/.test(s)) return { status: "NS", elapsed: null };

  return { status: "NS", elapsed: null };
}

// Known league name mapping for broadcasts
const BROADCAST_MAP: Record<string, string[]> = {
  "Campeonato Brasileiro": ["Premiere", "Globo", "SporTV"],
  "Brasileirão Série A": ["Premiere", "Globo", "SporTV"],
  "Campeonato Brasileiro Série B": ["Premiere", "SporTV", "TV Brasil"],
  "Copa do Brasil": ["Premiere", "Globo", "SporTV", "Amazon Prime"],
  "CONMEBOL Libertadores": ["Paramount+", "SBT", "ESPN"],
  "Copa Libertadores": ["Paramount+", "SBT", "ESPN"],
  "CONMEBOL Sudamericana": ["Paramount+", "SBT", "ESPN"],
  "Copa Sul-Americana": ["Paramount+", "SBT", "ESPN"],
  "UEFA Champions League": ["TNT", "HBO Max"],
  "Champions League": ["TNT", "HBO Max"],
  "UEFA Europa League": ["ESPN", "Star+"],
  "Europa League": ["ESPN", "Star+"],
  "Premier League": ["ESPN", "Star+"],
  "LALIGA": ["ESPN", "Star+"],
  "La Liga": ["ESPN", "Star+"],
  "Bundesliga": ["CazéTV", "OneFootball"],
  "Serie A": ["ESPN", "Star+"],
  "Ligue 1": ["CazéTV"],
  "Campeonato Paulista": ["Record", "CazéTV", "Premiere"],
  "Campeonato Carioca": ["Band", "SporTV", "Premiere"],
  "Eliminatórias Copa do Mundo": ["Globo", "SporTV", "CazéTV"],
  "Copa do Mundo": ["Globo", "SporTV", "CazéTV"],
};

function getBroadcast(leagueName: string): string[] {
  for (const [key, channels] of Object.entries(BROADCAST_MAP)) {
    if (leagueName.toLowerCase().includes(key.toLowerCase())) return channels;
  }
  return ["ESPN"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // Check cache
    const { data: cached } = await supabase
      .from("football_cache")
      .select("matches, fetched_at")
      .eq("cache_date", brDate)
      .maybeSingle();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.fetched_at).getTime();
      const matches = cached.matches as any[];
      const hasLive = matches.some((m: any) =>
        ["1H", "HT", "2H", "AET", "PEN", "LIVE"].includes(m.status)
      );
      const maxAge = hasLive ? 5 * 60 * 1000 : 15 * 60 * 1000;
      if (cacheAge < maxAge) {
        console.log(`[Cache HIT] ${matches.length} matches, age: ${Math.round(cacheAge / 1000)}s`);
        return new Response(JSON.stringify(matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Scrape ESPN Brasil using Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const scrapeUrl = "https://www.espn.com.br/futebol/resultados";
    console.log(`[Scraper] Fetching matches from ESPN Brasil...`);

    const firecrawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: scrapeUrl,
        formats: ["extract"],
        extract: {
          prompt:
            "Extract ALL football/soccer matches shown on this page for today. For each match, extract: league_name (the competition name like 'Ligue 1', 'LALIGA', 'Bundesliga', etc), home_team_name, away_team_name, home_score (number or null if match hasn't started), away_score (number or null if match hasn't started), match_status (the exact status indicator shown: minute like '37' for live, 'F' for finished, 'HT' for half-time, or a time like '21:30' for scheduled). Include ALL matches visible on the page.",
          schema: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    league_name: { type: "string" },
                    home_team_name: { type: "string" },
                    away_team_name: { type: "string" },
                    home_score: { type: ["number", "null"] },
                    away_score: { type: ["number", "null"] },
                    match_status: { type: "string" },
                  },
                  required: ["league_name", "home_team_name", "away_team_name", "match_status"],
                },
              },
            },
            required: ["matches"],
          },
        },
        waitFor: 3000,
      }),
    });

    const firecrawlData = await firecrawlRes.json();

    if (!firecrawlRes.ok) {
      console.error("[Scraper] Firecrawl error:", JSON.stringify(firecrawlData));
      if (cached) {
        console.log("[Scraper] Returning stale cache due to scrape failure");
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Firecrawl error: ${firecrawlData.error || firecrawlRes.status}`);
    }

    const extractedJson = firecrawlData?.data?.extract || firecrawlData?.extract;
    const rawMatches = extractedJson?.matches || [];

    console.log(`[Scraper] Extracted ${rawMatches.length} matches from ESPN Brasil`);

    // Transform to our Match format
    const allMatches: any[] = rawMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status || "");

      // Build date from match_status if it's a time
      let matchDate = new Date().toISOString();
      const timeMatch = (m.match_status || "").match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const d = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`);
        matchDate = d.toISOString();
      }

      return {
        id: 9000 + index,
        league: {
          id: 0,
          name: m.league_name || "Desconhecida",
          logo: "",
          round: null,
        },
        homeTeam: {
          id: 0,
          name: m.home_team_name || "Time A",
          logo: "",
        },
        awayTeam: {
          id: 0,
          name: m.away_team_name || "Time B",
          logo: "",
        },
        date: matchDate,
        status,
        elapsed,
        goals: {
          home: m.home_score ?? null,
          away: m.away_score ?? null,
        },
        broadcast: getBroadcast(m.league_name || ""),
      };
    });

    console.log(`[Scraper] Processed ${allMatches.length} matches`);

    // Upsert cache
    await supabase.from("football_cache").upsert(
      { cache_date: brDate, matches: allMatches, fetched_at: new Date().toISOString() },
      { onConflict: "cache_date" }
    );

    return new Response(JSON.stringify(allMatches), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
