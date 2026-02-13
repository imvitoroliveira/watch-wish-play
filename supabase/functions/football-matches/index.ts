import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

// Brazilian, South American & European league IDs
const TARGET_LEAGUE_IDS = new Set([
  // Brasil
  71, 72, 75, 73, 475, 606, 625,
  // Estaduais
  352, 480,
  // Continental SA
  13, 11, 535,
  // Seleções
  34, 10,
  // Europa - Top 5 + Champions
  140,  // La Liga
  78,   // Bundesliga
  135,  // Serie A (Itália)
  61,   // Ligue 1
  2,    // Champions League
  1,    // Copa do Mundo
  3,    // Europa League
]);

const BROADCAST_MAP: Record<number, string[]> = {
  71: ["Premiere", "Globo", "SporTV"],
  72: ["Premiere", "SporTV", "TV Brasil"],
  75: ["DAZN", "NSports"],
  73: ["Premiere", "Globo", "SporTV", "Amazon Prime"],
  475: ["SBT", "ESPN", "SporTV"],
  606: ["SporTV", "Globo", "TV Brasil"],
  625: ["Globo", "SporTV"],
  352: ["Band", "SporTV", "Premiere"],
  480: ["Record", "CazéTV", "Premiere"],
  13: ["Paramount+", "SBT", "ESPN"],
  11: ["Paramount+", "SBT", "ESPN"],
  535: ["ESPN", "SBT"],
  34: ["Globo", "SporTV", "CazéTV"],
  10: ["Globo", "SporTV", "ESPN"],
  140: ["ESPN", "Star+"],
  78: ["CazéTV", "OneFootball"],
  135: ["ESPN", "Star+"],
  61: ["CazéTV"],
  2: ["TNT", "HBO Max"],
  1: ["Globo", "SporTV", "CazéTV"],
  3: ["ESPN", "Star+"],
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

    // Get today in São Paulo timezone
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
      // Fresh cache: return if no live matches or cache < 2 min old
      if (!hasLive || cacheAge < 120000) {
        console.log(`[Cache HIT] ${matches.length} matches, age: ${Math.round(cacheAge/1000)}s`);
        return new Response(JSON.stringify(matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Single API call: get ALL fixtures for today (1 request instead of 28!)
    console.log(`[API] Fetching all fixtures for ${brDate}...`);
    const res = await fetch(
      `${API_BASE}/fixtures?date=${brDate}&timezone=America/Sao_Paulo`,
      { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
    );
    const data = await res.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error("[API] Errors:", JSON.stringify(data.errors));
      // If rate limited or plan issue, return cache or empty
      if (cached) {
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`API error: ${JSON.stringify(data.errors)}`);
    }

    const allFixtures = data.response || [];
    // Debug: log unique league IDs found
    const uniqueLeagues = new Map<number, string>();
    for (const f of allFixtures) {
      if (!uniqueLeagues.has(f.league.id)) uniqueLeagues.set(f.league.id, f.league.name);
    }
    console.log(`[API] Got ${allFixtures.length} total fixtures. Unique leagues:`, JSON.stringify(Object.fromEntries(uniqueLeagues)));
    console.log(`[API] Target IDs:`, [...TARGET_LEAGUE_IDS]);

    // Filter for our target leagues
    const allMatches: any[] = [];
    for (const fixture of allFixtures) {
      const leagueId = fixture.league.id;
      if (!TARGET_LEAGUE_IDS.has(leagueId)) continue;

      allMatches.push({
        id: fixture.fixture.id,
        league: {
          id: leagueId,
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

    console.log(`[API] ${allMatches.length} matches in target leagues`);

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
