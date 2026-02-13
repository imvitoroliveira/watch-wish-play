import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Premium leagues whitelist (Portuguese names from BeSoccer PT)
const PREMIUM_LEAGUES = new Set([
  "laliga",
  "bundesliga",
  "serie a",
  "ligue 1",
  "premier league",
  "champions league",
  "liga dos campeões",
  "europa league",
  "liga europa",
  "conference league",
  "liga conferência",
  "brasileirão série a",
  "brasileirão",
  "campeonato brasileiro",
  "copa do brasil",
  "copa libertadores",
  "libertadores",
  "copa sul-americana",
  "sul-americana",
  "eliminatórias",
  "copa do mundo",
  "taça de inglaterra",
  "taça de espanha",
  "copa del rey",
  "taça de itália",
  "coppa italia",
  "coupe de france",
  "dfb pokal",
  "supercopa",
  "campeonato paulista",
  "campeonato carioca",
  "recopa sul-americana",
]);

function isPremiumLeague(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const league of PREMIUM_LEAGUES) {
    if (lower.includes(league) || league.includes(lower)) return true;
  }
  return false;
}

// Map status text to internal codes
function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();

  if (s === "F" || s === "Fin" || s.toLowerCase() === "fin" || s.toLowerCase() === "encerrado")
    return { status: "FT", elapsed: 90 };
  if (s === "HT" || s.toLowerCase() === "interv" || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int")
    return { status: "HT", elapsed: 45 };
  if (s === "AET" || s.toLowerCase() === "prorrogação") return { status: "AET", elapsed: 120 };
  if (s === "PEN" || s.toLowerCase() === "pênaltis" || s.toLowerCase() === "pen") return { status: "PEN", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado") || s.toLowerCase().includes("adia")) return { status: "PST", elapsed: null };
  if (s.toLowerCase().includes("canc")) return { status: "CANC", elapsed: null };

  // Minute: "37'" or "45+2'" or just "58"
  const minuteMatch = s.match(/^(\d+)['′+]?/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    if (min <= 45) return { status: "1H", elapsed: min };
    return { status: "2H", elapsed: min };
  }

  // Time: "21:30"
  if (/^\d{1,2}:\d{2}/.test(s)) return { status: "NS", elapsed: null };

  return { status: "NS", elapsed: null };
}

// Broadcast mapping
const BROADCAST_MAP: Record<string, string[]> = {
  "brasileirão": ["Premiere", "Globo", "SporTV"],
  "campeonato brasileiro": ["Premiere", "Globo", "SporTV"],
  "copa do brasil": ["Premiere", "Globo", "SporTV", "Amazon Prime"],
  "libertadores": ["Paramount+", "SBT", "ESPN"],
  "sul-americana": ["Paramount+", "SBT", "ESPN"],
  "champions league": ["TNT", "HBO Max"],
  "liga dos campeões": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "liga europa": ["ESPN", "Star+"],
  "premier league": ["ESPN", "Star+"],
  "taça de inglaterra": ["ESPN", "Star+"],
  "laliga": ["ESPN", "Star+"],
  "bundesliga": ["CazéTV", "OneFootball"],
  "serie a": ["ESPN", "Star+"],
  "ligue 1": ["CazéTV"],
  "campeonato paulista": ["Record", "CazéTV", "Premiere"],
  "campeonato carioca": ["Band", "SporTV", "Premiere"],
  "eliminatórias": ["Globo", "SporTV", "CazéTV"],
  "copa do mundo": ["Globo", "SporTV", "CazéTV"],
};

function getBroadcast(leagueName: string): string[] {
  const lower = leagueName.toLowerCase();
  for (const [key, channels] of Object.entries(BROADCAST_MAP)) {
    if (lower.includes(key)) return channels;
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

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const scrapeUrl = "https://pt.besoccer.com/resultados";
    console.log(`[Scraper] Fetching from BeSoccer PT...`);

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
            "Extract ALL football/soccer matches shown on this page. Each match is inside a competition/league section. For each match extract: league_name (the competition header like 'LaLiga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Champions League', 'Premier League', etc.), home_team_name, away_team_name, home_team_logo_url (the img src for the home team crest/badge, looks like https://cdn.resfu.com/img_data/equipos/XXXX.png), away_team_logo_url (the img src for the away team crest/badge), home_score (number or null if not started), away_score (number or null if not started), match_status (exact text shown: minute like '58' for live, 'Interv' for half-time, 'Fin' for finished, or time like '14:00' for scheduled). Extract ALL matches from ALL leagues on the page.",
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
                    home_team_logo_url: { type: ["string", "null"] },
                    away_team_logo_url: { type: ["string", "null"] },
                    home_score: { type: ["number", "null"] },
                    away_score: { type: ["number", "null"] },
                    match_status: { type: "string" },
                  },
                  required: [
                    "league_name",
                    "home_team_name",
                    "away_team_name",
                    "match_status",
                  ],
                },
              },
            },
            required: ["matches"],
          },
        },
        waitFor: 5000,
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

    console.log(`[Scraper] Extracted ${rawMatches.length} raw matches from BeSoccer`);

    // Filter only premium leagues
    const premiumMatches = rawMatches.filter((m: any) => isPremiumLeague(m.league_name || ""));
    console.log(`[Scraper] ${premiumMatches.length} matches after premium filter`);

    // Transform to Match format
    const allMatches: any[] = premiumMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status || "");

      let matchDate = new Date().toISOString();
      const timeMatch = (m.match_status || "").match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const d = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`);
        matchDate = d.toISOString();
      }

      // Fix logo URLs - ensure they're full URLs with decent size
      const fixLogo = (url: string | null | undefined): string => {
        if (!url) return "";
        let fixed = url;
        // Ensure size parameter for quality
        if (fixed.includes("cdn.resfu.com") && !fixed.includes("size=")) {
          fixed = fixed.replace(/\?.*$/, "") + "?size=60x&lossy=1";
        }
        return fixed;
      };

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
          logo: fixLogo(m.home_team_logo_url),
        },
        awayTeam: {
          id: 0,
          name: m.away_team_name || "Time B",
          logo: fixLogo(m.away_team_logo_url),
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

    console.log(`[Scraper] Final: ${allMatches.length} premium matches processed`);

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
