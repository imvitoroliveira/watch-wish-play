import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Premium Leagues ────────────────────────────────────────────────
const PREMIUM_LEAGUES = new Set([
  "laliga", "la liga", "bundesliga", "serie a", "premier league",
  "champions league", "liga dos campeões", "europa league", "liga europa",
  "brasileirão", "campeonato brasileiro", "série a", "série b",
  "copa do brasil", "copa libertadores", "libertadores",
  "copa sul-americana", "sul-americana", "eliminatórias",
  "copa do mundo", "supercopa", "recopa sul-americana", "amistoso",
  "mls", "major league soccer",
]);

function isPremiumLeague(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const league of PREMIUM_LEAGUES) {
    if (lower.includes(league) || league.includes(lower)) return true;
  }
  return false;
}

// ─── RapidAPI (API-Football v3) league IDs ──────────────────────────
const RAPIDAPI_LEAGUE_IDS = [
  71, 72,       // Brasileirão A, B
  73,           // Copa do Brasil
  625,          // Supercopa do Brasil
  13,           // Libertadores
  11,           // Sul-Americana
  535,          // Recopa
  34,           // Eliminatórias
  10,           // Amistosos internacionais
  140,          // La Liga
  78,           // Bundesliga
  135,          // Serie A (Itália)
  39,           // Premier League
  2,            // Champions League
  3,            // Europa League
  1,            // Copa do Mundo
  253,          // MLS
];

// ─── APIFootball.com league IDs (v3 IDs) ────────────────────────────
// We fetch by specific league_id to avoid pulling irrelevant leagues
const APIFOOTBALL_LEAGUE_IDS = [
  302,          // Brasileirão Série A
  349,          // Copa do Brasil  
  372,          // Copa Libertadores
  373,          // Copa Sul-Americana
  468,          // Eliminatórias CONMEBOL
  152,          // Premier League
  468,          // La Liga → need to confirm actual ID
  175,          // Bundesliga
  207,          // Serie A (Itália)
  3,            // Champions League
  4,            // Europa League
  332,          // MLS
  683,          // Copa do Mundo
];

// ─── Status parsing ─────────────────────────────────────────────────
function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();
  if (s === "F" || s.toLowerCase() === "encerrado" || s.toLowerCase() === "fin" || s === "FT" || s === "Match Finished")
    return { status: "FT", elapsed: 90 };
  if (s === "HT" || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int" || s === "Halftime")
    return { status: "HT", elapsed: 45 };
  if (s === "AET" || s.toLowerCase() === "prorrogação" || s === "After Extra Time") return { status: "AET", elapsed: 120 };
  if (s === "PEN" || s.toLowerCase() === "pênaltis" || s === "Penalty In Progress") return { status: "PEN", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado") || s === "PST" || s === "Postponed") return { status: "PST", elapsed: null };
  if (s.toLowerCase().includes("canc") || s === "CANC" || s === "Cancelled") return { status: "CANC", elapsed: null };
  if (s === "NS" || s === "Not Started" || s === "TBD") return { status: "NS", elapsed: null };
  if (s === "1H" || s === "First Half") return { status: "1H", elapsed: null };
  if (s === "2H" || s === "Second Half") return { status: "2H", elapsed: null };
  // Scheduled time format
  if (/^\d{1,2}:\d{2}/.test(s)) return { status: "NS", elapsed: null };
  const minuteMatch = s.match(/^(\d+)['′+]?$/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }
  return { status: "NS", elapsed: null };
}

// ─── Broadcast map ──────────────────────────────────────────────────
const BROADCAST_MAP: Record<string, string[]> = {
  "brasileirão": ["Premiere", "Globo", "SporTV"],
  "campeonato brasileiro": ["Premiere", "Globo", "SporTV"],
  "série a": ["Premiere", "Globo", "SporTV"],
  "série b": ["Premiere", "SporTV"],
  "copa do brasil": ["Premiere", "Globo", "Amazon Prime"],
  "libertadores": ["Paramount+", "SBT", "ESPN"],
  "sul-americana": ["Paramount+", "SBT", "ESPN"],
  "champions league": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "laliga": ["ESPN", "Star+"], "la liga": ["ESPN", "Star+"],
  "premier league": ["ESPN", "Star+"],
  "bundesliga": ["CazéTV", "OneFootball"],
  "serie a": ["ESPN", "Star+"],
  "supercopa": ["Globo", "SporTV"],
  "eliminatórias": ["Globo", "SporTV", "CazéTV"],
  "copa do mundo": ["Globo", "SporTV", "CazéTV"],
  "amistoso": ["SporTV", "ESPN"],
  "mls": ["Apple TV", "MLS Season Pass"],
  "major league soccer": ["Apple TV", "MLS Season Pass"],
};

function getBroadcast(leagueName: string): string[] {
  const lower = leagueName.toLowerCase();
  for (const [key, channels] of Object.entries(BROADCAST_MAP)) {
    if (lower.includes(key)) return channels;
  }
  return ["ESPN"];
}

// ─── Team badge resolution (TheSportsDB) ────────────────────────────
const logoCache = new Map<string, string>();

const TEAM_ALIASES: Record<string, string> = {
  "Paris Saint-Germain": "Paris SG", "PSG": "Paris SG",
  "Atlético de Madrid": "Atletico Madrid", "Atlético Madrid": "Atletico Madrid",
  "Inter de Milão": "Inter Milan", "Internazionale": "Inter Milan",
  "B. Dortmund": "Borussia Dortmund", "Mainz 05": "Mainz",
  "Bayern de Munique": "Bayern Munich", "Bayer Leverkusen": "Bayer 04 Leverkusen",
  "Wolverhampton": "Wolverhampton Wanderers", "Man United": "Manchester United",
  "Man City": "Manchester City", "Nottm Forest": "Nottingham Forest",
  "Tottenham": "Tottenham Hotspur", "Newcastle": "Newcastle United",
  "West Ham": "West Ham United", "Sheffield Utd": "Sheffield United",
  "Stade Brestois": "Stade Brestois 29",
};

async function resolveTeamLogo(teamName: string): Promise<string> {
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;
  const namesToTry = [teamName];
  if (TEAM_ALIASES[teamName]) namesToTry.push(TEAM_ALIASES[teamName]);

  for (const name of namesToTry) {
    try {
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.teams?.length > 0) {
          const badge = data.teams[0].strBadge || data.teams[0].strTeamBadge || "";
          if (badge) {
            const smallBadge = badge + "/small";
            logoCache.set(teamName, smallBadge);
            return smallBadge;
          }
        }
      }
    } catch { /* silent */ }
  }
  logoCache.set(teamName, "");
  return "";
}

// ─── Diff logic ─────────────────────────────────────────────────────
function hasDataChanged(oldMatches: any[], newMatches: any[]): boolean {
  if (oldMatches.length !== newMatches.length) return true;
  const oldMap = new Map<string, any>();
  for (const m of oldMatches) {
    oldMap.set(`${m.homeTeam?.name}|${m.awayTeam?.name}`, m);
  }
  for (const n of newMatches) {
    const o = oldMap.get(`${n.homeTeam?.name}|${n.awayTeam?.name}`);
    if (!o) return true;
    if (o.status !== n.status || o.elapsed !== n.elapsed) return true;
    if (o.goals?.home !== n.goals?.home || o.goals?.away !== n.goals?.away) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 1: RapidAPI (API-Football v3)
// ═══════════════════════════════════════════════════════════════════
async function fetchFromRapidAPI(dateStr: string): Promise<any[] | null> {
  const apiKey = Deno.env.get("RAPIDAPI_FOOTBALL_KEY");
  if (!apiKey) { console.warn("[Source1] RAPIDAPI_FOOTBALL_KEY not set"); return null; }

  try {
    console.log(`[Source1-RapidAPI] Fetching fixtures for ${dateStr}...`);
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${dateStr}`,
      {
        headers: {
          "x-apisports-key": apiKey,
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Source1-RapidAPI] HTTP ${res.status}: ${body}`);
      return null;
    }

    const data = await res.json();
    const fixtures = data?.response || [];
    console.log(`[Source1-RapidAPI] Got ${fixtures.length} total fixtures`);

    // Filter to premium leagues by league ID
    const premiumSet = new Set(RAPIDAPI_LEAGUE_IDS);
    const filtered = fixtures.filter((f: any) => premiumSet.has(f.league?.id));
    console.log(`[Source1-RapidAPI] ${filtered.length} premium fixtures after filter`);

    return filtered.map((f: any) => {
      const statusShort = f.fixture?.status?.short || "NS";
      const elapsed = f.fixture?.status?.elapsed ?? null;
      let status = statusShort;
      // Normalize API-Football statuses
      if (["LIVE", "1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(statusShort)) {
        if (statusShort === "P") status = "PEN";
        else if (statusShort === "ET") status = "AET";
        else if (statusShort === "BT" || statusShort === "INT") status = "HT";
        else if (statusShort === "LIVE") status = elapsed && elapsed <= 45 ? "1H" : "2H";
      } else if (["FT", "AET", "PEN"].includes(statusShort)) {
        // already fine
      } else if (["PST", "CANC", "ABD", "AWD", "WO"].includes(statusShort)) {
        status = statusShort === "ABD" || statusShort === "AWD" || statusShort === "WO" ? "CANC" : statusShort;
      } else if (["TBD", "NS"].includes(statusShort)) {
        status = "NS";
      } else if (statusShort === "SUSP") {
        status = "SUSP";
      }

      return {
        homeTeamName: f.teams?.home?.name || "Time A",
        awayTeamName: f.teams?.away?.name || "Time B",
        homeScore: f.goals?.home ?? null,
        awayScore: f.goals?.away ?? null,
        leagueName: f.league?.name || "Desconhecida",
        leagueId: f.league?.id || 0,
        status,
        elapsed,
        date: f.fixture?.date || new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error(`[Source1-RapidAPI] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 2: APIFootball.com (v3)
// ═══════════════════════════════════════════════════════════════════
async function fetchFromAPIFootball(dateStr: string): Promise<any[] | null> {
  const apiKey = Deno.env.get("APIFOOTBALL_COM_KEY");
  if (!apiKey) { console.warn("[Source2] APIFOOTBALL_COM_KEY not set"); return null; }

  try {
    console.log(`[Source2-APIFootball] Fetching events by league IDs for ${dateStr}...`);
    
    // Fetch each league individually to avoid pulling 1000+ irrelevant matches
    const leagueIds = APIFOOTBALL_LEAGUE_IDS;
    const allEvents: any[] = [];
    
    // Batch fetch: request all leagues in parallel
    const fetches = leagueIds.map(async (leagueId) => {
      try {
        const url = `https://apiv3.apifootball.com/?action=get_events&from=${dateStr}&to=${dateStr}&league_id=${leagueId}&timezone=America/Sao_Paulo&APIkey=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) { await res.text(); return []; }
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data;
      } catch { return []; }
    });
    
    const results = await Promise.all(fetches);
    for (const events of results) {
      allEvents.push(...events);
    }
    
    console.log(`[Source2-APIFootball] Got ${allEvents.length} events from ${leagueIds.length} leagues`);

    if (allEvents.length === 0) return null;

    return allEvents.map((e: any) => {
      const { status, elapsed } = parseStatus(e.match_status || "");
      const homeScore = e.match_hometeam_score !== "" ? parseInt(e.match_hometeam_score) : null;
      const awayScore = e.match_awayteam_score !== "" ? parseInt(e.match_awayteam_score) : null;

      let matchDate = new Date().toISOString();
      if (e.match_date && e.match_time) {
        matchDate = new Date(`${e.match_date}T${e.match_time}:00-03:00`).toISOString();
      }

      return {
        homeTeamName: e.match_hometeam_name || "Time A",
        awayTeamName: e.match_awayteam_name || "Time B",
        homeScore: isNaN(homeScore as number) ? null : homeScore,
        awayScore: isNaN(awayScore as number) ? null : awayScore,
        leagueName: e.league_name || "Desconhecida",
        leagueId: parseInt(e.league_id) || 0,
        status,
        elapsed,
        date: matchDate,
      };
    });
  } catch (e) {
    console.error(`[Source2-APIFootball] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 3: Firecrawl fallback (ESPN scraper)
// ═══════════════════════════════════════════════════════════════════
async function fetchFromFirecrawl(brDate: string): Promise<any[] | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) { console.warn("[Source3] FIRECRAWL_API_KEY not set"); return null; }

  try {
    console.log(`[Source3-Firecrawl] Scraping ESPN Brasil...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      signal: controller.signal,
      body: JSON.stringify({
        url: "https://www.espn.com.br/futebol/resultados",
        formats: ["extract"],
        maxAge: 0,
        storeInCache: false,
        timeout: 20000,
        headers: { "Cache-Control": "no-cache, no-store", "Pragma": "no-cache" },
        extract: {
          prompt:
            "Extract ALL football/soccer matches shown on this page for today. For each match extract: league_name, home_team_name, away_team_name, home_score (number or null), away_score (number or null), match_status (minute like '37' for live, 'F' for finished, 'HT' for half-time, or scheduled time like '21:30'), match_time (original kick-off time HH:MM).",
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
                    match_time: { type: ["string", "null"] },
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

    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok) {
      console.error(`[Source3-Firecrawl] HTTP ${res.status}:`, JSON.stringify(data));
      return null;
    }

    const extractedJson = data?.data?.extract || data?.extract;
    const rawMatches = extractedJson?.matches || [];
    console.log(`[Source3-Firecrawl] Extracted ${rawMatches.length} matches`);

    const filtered = rawMatches.filter((m: any) => isPremiumLeague(m.league_name || ""));
    console.log(`[Source3-Firecrawl] ${filtered.length} premium after filter`);

    return filtered.map((m: any) => {
      const { status, elapsed } = parseStatus(m.match_status || "");
      let matchDate = new Date().toISOString();
      const timeSource = m.match_time || m.match_status || "";
      const timeMatch = timeSource.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        matchDate = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`).toISOString();
      }
      return {
        homeTeamName: m.home_team_name || "Time A",
        awayTeamName: m.away_team_name || "Time B",
        homeScore: m.home_score ?? null,
        awayScore: m.away_score ?? null,
        leagueName: m.league_name || "Desconhecida",
        leagueId: 0,
        status,
        elapsed,
        date: matchDate,
      };
    });
  } catch (e) {
    console.error(`[Source3-Firecrawl] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // Always fetch cache
    const { data: cached } = await supabase
      .from("football_cache")
      .select("matches, fetched_at")
      .eq("cache_date", brDate)
      .maybeSingle();

    // Client requests just read DB
    const isCronRequest = req.headers.get("x-cron-source") === "pg_cron";
    if (!isCronRequest && cached) {
      return new Response(JSON.stringify(cached.matches), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Multi-source cascade: try each source in order ──
    console.log(`[Scraper] Starting multi-source fetch for ${brDate}`);
    let rawMatches: any[] | null = null;
    let source = "none";

    // Source 1: RapidAPI (API-Football v3) — most reliable
    rawMatches = await fetchFromRapidAPI(brDate);
    if (rawMatches && rawMatches.length > 0) {
      source = "RapidAPI";
    }

    // Source 2: APIFootball.com — fallback
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromAPIFootball(brDate);
      if (rawMatches && rawMatches.length > 0) {
        source = "APIFootball.com";
      }
    }

    // Source 3: Firecrawl (ESPN scraping) — last resort
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromFirecrawl(brDate);
      if (rawMatches && rawMatches.length > 0) {
        source = "Firecrawl";
      }
    }

    if (!rawMatches || rawMatches.length === 0) {
      console.error(`[Scraper] All 3 sources returned empty/failed`);
      if (cached) {
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Scraper] Using source: ${source} with ${rawMatches.length} matches`);

    // Resolve team logos
    const uniqueTeams = new Set<string>();
    rawMatches.forEach((m: any) => {
      uniqueTeams.add(m.homeTeamName);
      uniqueTeams.add(m.awayTeamName);
    });
    await Promise.all([...uniqueTeams].map((name) => resolveTeamLogo(name)));

    // Build final match objects
    const allMatches = rawMatches.map((m: any, index: number) => ({
      id: 9000 + index,
      league: { id: m.leagueId || 0, name: m.leagueName, logo: "", round: null },
      homeTeam: { id: 0, name: m.homeTeamName, logo: logoCache.get(m.homeTeamName) || "" },
      awayTeam: { id: 0, name: m.awayTeamName, logo: logoCache.get(m.awayTeamName) || "" },
      date: m.date,
      status: m.status,
      elapsed: m.elapsed,
      goals: { home: m.homeScore, away: m.awayScore },
      broadcast: getBroadcast(m.leagueName),
      source,
    }));

    console.log(`[Scraper] Final: ${allMatches.length} matches from ${source}`);

    // Diff: only update DB if data changed
    const oldMatches = (cached?.matches as any[]) || [];
    if (hasDataChanged(oldMatches, allMatches)) {
      console.log(`[Scraper] Data CHANGED — updating DB`);
      await supabase.from("football_cache").upsert(
        { cache_date: brDate, matches: allMatches, fetched_at: new Date().toISOString() },
        { onConflict: "cache_date" }
      );
    } else {
      console.log(`[Scraper] No changes — skipping DB update`);
    }

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
