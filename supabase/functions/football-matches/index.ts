import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://v3.football.api-sports.io";

const LEAGUE_IDS: Record<string, number> = {
  SERIE_A: 71,
  SERIE_B: 72,
  SERIE_C: 75,
  COPA_DO_BRASIL: 73,
  COPA_NORDESTE: 475,
  FEMININO: 606,
  SUPERCOPA: 625,
  CARIOCA: 352,
  PAULISTA: 480,
  LIBERTADORES: 13,
  SULAMERICANA: 11,
  RECOPA_SULAMERICANA: 535,
  ELIMINATORIAS: 34,
  AMISTOSOS: 10,
};

const BROADCAST_MAP: Record<number, string[]> = {
  [LEAGUE_IDS.SERIE_A]: ["Premiere", "Globo", "SporTV"],
  [LEAGUE_IDS.SERIE_B]: ["Premiere", "SporTV", "TV Brasil"],
  [LEAGUE_IDS.SERIE_C]: ["DAZN", "NSports"],
  [LEAGUE_IDS.COPA_DO_BRASIL]: ["Premiere", "Globo", "SporTV", "Amazon Prime"],
  [LEAGUE_IDS.COPA_NORDESTE]: ["SBT", "ESPN", "SporTV"],
  [LEAGUE_IDS.FEMININO]: ["SporTV", "Globo", "TV Brasil"],
  [LEAGUE_IDS.SUPERCOPA]: ["Globo", "SporTV"],
  [LEAGUE_IDS.CARIOCA]: ["Band", "SporTV", "Premiere"],
  [LEAGUE_IDS.PAULISTA]: ["Record", "CazéTV", "Premiere"],
  [LEAGUE_IDS.LIBERTADORES]: ["Paramount+", "SBT", "ESPN"],
  [LEAGUE_IDS.SULAMERICANA]: ["Paramount+", "SBT", "ESPN"],
  [LEAGUE_IDS.RECOPA_SULAMERICANA]: ["ESPN", "SBT"],
  [LEAGUE_IDS.ELIMINATORIAS]: ["Globo", "SporTV", "CazéTV"],
  [LEAGUE_IDS.AMISTOSOS]: ["Globo", "SporTV", "ESPN"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_FOOTBALL_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!API_FOOTBALL_KEY) {
      throw new Error("API_FOOTBALL_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date in São Paulo timezone
    const now = new Date();
    const brDate = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // Check cache first
    const { data: cached } = await supabase
      .from("football_cache")
      .select("matches, fetched_at")
      .eq("cache_date", brDate)
      .maybeSingle();

    if (cached) {
      // Check if cache has live matches - if so, check if it's stale (>2 min old)
      const cacheAge = Date.now() - new Date(cached.fetched_at).getTime();
      const hasLiveMatches = (cached.matches as any[]).some((m: any) =>
        ["1H", "HT", "2H", "AET", "PEN", "LIVE"].includes(m.status)
      );

      // Return cache if: no live matches, OR cache is fresh (<2 min)
      if (!hasLiveMatches || cacheAge < 120000) {
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch from API-Football
    const leagueIds = Object.values(LEAGUE_IDS);
    const allMatches: any[] = [];

    const fetches = leagueIds.map(async (leagueId) => {
      try {
        const res = await fetch(
          `${API_BASE}/fixtures?league=${leagueId}&date=${brDate}&season=2025&timezone=America/Sao_Paulo`,
          { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
        );
        const data = await res.json();
        if (data.response) {
          for (const fixture of data.response) {
            allMatches.push({
              id: fixture.fixture.id,
              league: {
                id: fixture.league.id,
                name: fixture.league.name,
                logo: fixture.league.logo,
                round: fixture.league.round,
              },
              homeTeam: {
                id: fixture.teams.home.id,
                name: fixture.teams.home.name,
                logo: fixture.teams.home.logo,
              },
              awayTeam: {
                id: fixture.teams.away.id,
                name: fixture.teams.away.name,
                logo: fixture.teams.away.logo,
              },
              date: fixture.fixture.date,
              status: fixture.fixture.status.short,
              elapsed: fixture.fixture.status.elapsed,
              goals: {
                home: fixture.goals.home,
                away: fixture.goals.away,
              },
              broadcast: BROADCAST_MAP[leagueId] || ["Premiere"],
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch league ${leagueId}:`, e);
      }
    });

    await Promise.all(fetches);

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
