import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Premium leagues whitelist
const PREMIUM_LEAGUES = new Set([
  "laliga", "la liga", "bundesliga", "serie a", "ligue 1", "premier league",
  "champions league", "liga dos campeões", "europa league", "liga europa",
  "conference league", "brasileirão", "campeonato brasileiro",
  "copa do brasil", "copa libertadores", "libertadores",
  "copa sul-americana", "sul-americana", "eliminatórias",
  "copa do mundo", "fa cup", "taça de inglaterra", "taça de espanha",
  "copa del rey", "coppa italia", "coupe de france", "dfb pokal",
  "supercopa", "campeonato paulista", "campeonato carioca",
  "recopa sul-americana",
]);

function isPremiumLeague(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const league of PREMIUM_LEAGUES) {
    if (lower.includes(league) || league.includes(lower)) return true;
  }
  return false;
}

function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();
  if (s === "F" || s.toLowerCase() === "encerrado" || s.toLowerCase() === "fin")
    return { status: "FT", elapsed: 90 };
  if (s === "HT" || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int")
    return { status: "HT", elapsed: 45 };
  if (s === "AET" || s.toLowerCase() === "prorrogação") return { status: "AET", elapsed: 120 };
  if (s === "PEN" || s.toLowerCase() === "pênaltis") return { status: "PEN", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado")) return { status: "PST", elapsed: null };
  if (s.toLowerCase().includes("canc")) return { status: "CANC", elapsed: null };
  const minuteMatch = s.match(/^(\d+)['′+]?/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }
  if (/^\d{1,2}:\d{2}/.test(s)) return { status: "NS", elapsed: null };
  return { status: "NS", elapsed: null };
}

const BROADCAST_MAP: Record<string, string[]> = {
  "brasileirão": ["Premiere", "Globo", "SporTV"],
  "campeonato brasileiro": ["Premiere", "Globo", "SporTV"],
  "copa do brasil": ["Premiere", "Globo", "Amazon Prime"],
  "libertadores": ["Paramount+", "SBT", "ESPN"],
  "sul-americana": ["Paramount+", "SBT", "ESPN"],
  "champions league": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "premier league": ["ESPN", "Star+"],
  "fa cup": ["ESPN", "Star+"],
  "laliga": ["ESPN", "Star+"], "la liga": ["ESPN", "Star+"],
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

// TheSportsDB free API for team badges
const logoCache = new Map<string, string>();

async function resolveTeamLogo(teamName: string): Promise<string> {
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;

  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.teams && data.teams.length > 0) {
        const badge = data.teams[0].strBadge || data.teams[0].strTeamBadge || "";
        if (badge) {
          // Use /small suffix for performance
          const smallBadge = badge + "/small";
          logoCache.set(teamName, smallBadge);
          return smallBadge;
        }
      }
    }
  } catch {
    // silent
  }

  logoCache.set(teamName, "");
  return "";
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

    // Scrape ESPN Brasil (reliable source for match data)
    const scrapeUrl = "https://www.espn.com.br/futebol/resultados";
    console.log(`[Scraper] Fetching from ESPN Brasil...`);

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
            "Extract ALL football/soccer matches shown on this page for today. For each match extract: league_name (competition name like 'Ligue 1', 'LALIGA', 'Bundesliga', 'Serie A', 'Premier League', 'Champions League', etc.), home_team_name, away_team_name, home_score (number or null), away_score (number or null), match_status (minute like '37' for live, 'F' for finished, 'HT' for half-time, or time like '21:30' for scheduled). Include ALL matches.",
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
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Firecrawl error: ${firecrawlData.error || firecrawlRes.status}`);
    }

    const extractedJson = firecrawlData?.data?.extract || firecrawlData?.extract;
    const rawMatches = extractedJson?.matches || [];
    console.log(`[Scraper] Extracted ${rawMatches.length} matches from ESPN`);

    // Filter premium leagues
    const premiumMatches = rawMatches.filter((m: any) => isPremiumLeague(m.league_name || ""));
    console.log(`[Scraper] ${premiumMatches.length} premium matches after filter`);

    // Resolve team logos from TheSportsDB (in parallel, batched)
    const uniqueTeams = new Set<string>();
    premiumMatches.forEach((m: any) => {
      uniqueTeams.add(m.home_team_name);
      uniqueTeams.add(m.away_team_name);
    });

    console.log(`[Scraper] Resolving logos for ${uniqueTeams.size} teams...`);
    await Promise.all([...uniqueTeams].map((name) => resolveTeamLogo(name)));
    console.log(`[Scraper] Logo resolution complete`);

    // Transform to Match format
    const allMatches: any[] = premiumMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status || "");

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
          logo: logoCache.get(m.home_team_name) || "",
        },
        awayTeam: {
          id: 0,
          name: m.away_team_name || "Time B",
          logo: logoCache.get(m.away_team_name) || "",
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

    console.log(`[Scraper] Final: ${allMatches.length} matches with logos`);

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
