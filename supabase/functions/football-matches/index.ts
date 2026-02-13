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
  if (s === "F" || s.toLowerCase() === "encerrado" || s.toLowerCase() === "fin" || s.toLowerCase() === "finished" || s.toLowerCase() === "ft")
    return { status: "FT", elapsed: 90 };
  if (s === "HT" || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int" || s.toLowerCase() === "half time" || s.toLowerCase() === "half-time")
    return { status: "HT", elapsed: 45 };
  if (s === "AET" || s.toLowerCase() === "prorrogação" || s.toLowerCase() === "after extra time")
    return { status: "AET", elapsed: 120 };
  if (s === "PEN" || s.toLowerCase() === "pênaltis" || s.toLowerCase() === "penalties")
    return { status: "PEN", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado") || s.toLowerCase().includes("postponed")) return { status: "PST", elapsed: null };
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

const TEAM_ALIASES: Record<string, string> = {
  "Paris Saint-Germain": "Paris SG",
  "PSG": "Paris SG",
  "Atlético de Madrid": "Atletico Madrid",
  "Atlético Madrid": "Atletico Madrid",
  "Inter de Milão": "Inter Milan",
  "Internazionale": "Inter Milan",
  "B. Dortmund": "Borussia Dortmund",
  "Mainz 05": "Mainz",
  "RB Leipzig": "RB Leipzig",
  "Bayern de Munique": "Bayern Munich",
  "Bayer Leverkusen": "Bayer 04 Leverkusen",
  "Wolverhampton": "Wolverhampton Wanderers",
  "Man United": "Manchester United",
  "Man City": "Manchester City",
  "Nottm Forest": "Nottingham Forest",
  "Tottenham": "Tottenham Hotspur",
  "Newcastle": "Newcastle United",
  "West Ham": "West Ham United",
  "Sheffield Utd": "Sheffield United",
  "Stade Brestois": "Stade Brestois 29",
};

// ─── Multi-Source Fallback System ───

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function scrapeSource(
  firecrawlKey: string,
  sourceUrl: string,
  timeoutMs: number,
  label: string
): Promise<any[] | null> {
  console.log(`[Fallback] Trying ${label}: ${sourceUrl} (timeout: ${timeoutMs}ms)`);
  try {
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: sourceUrl,
        formats: ["extract"],
        extract: {
          prompt:
            "Extract ALL football/soccer matches shown on this page for today. For each match extract: league_name (competition name like 'Ligue 1', 'LALIGA', 'Bundesliga', 'Serie A', 'Premier League', 'Champions League', 'Brasileirão', etc.), home_team_name, away_team_name, home_score (number or null), away_score (number or null), match_status (minute like '37' for live, 'F' or 'Encerrado' for finished, 'HT' or 'Intervalo' for half-time, or time like '21:30' for scheduled). Include ALL matches from all leagues visible.",
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
    }, timeoutMs);

    const data = await res.json();
    if (!res.ok) {
      console.error(`[Fallback] ${label} HTTP error:`, res.status);
      return null;
    }

    const extracted = data?.data?.extract || data?.extract;
    const matches = extracted?.matches || [];
    console.log(`[Fallback] ${label} returned ${matches.length} matches`);
    return matches.length > 0 ? matches : null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn(`[Fallback] ${label} timed out after ${timeoutMs}ms`);
    } else {
      console.error(`[Fallback] ${label} error:`, err.message);
    }
    return null;
  }
}

// ─── Logo Resolution with DB persistence ───

async function resolveTeamLogos(
  teamNames: string[],
  supabase: any
): Promise<Map<string, string>> {
  const logoMap = new Map<string, string>();
  if (teamNames.length === 0) return logoMap;

  // 1. Check DB cache first (team_badges table)
  const { data: cachedBadges } = await supabase
    .from("team_badges")
    .select("team_name, badge_url")
    .in("team_name", teamNames);

  const found = new Set<string>();
  if (cachedBadges) {
    for (const b of cachedBadges) {
      logoMap.set(b.team_name, b.badge_url);
      found.add(b.team_name);
    }
  }
  console.log(`[Logos] ${found.size}/${teamNames.length} found in DB cache`);

  // 2. Resolve missing from TheSportsDB
  const missing = teamNames.filter((n) => !found.has(n));
  if (missing.length > 0) {
    console.log(`[Logos] Resolving ${missing.length} from TheSportsDB...`);
    await Promise.all(
      missing.map(async (teamName) => {
        const namesToTry = [teamName];
        if (TEAM_ALIASES[teamName]) namesToTry.push(TEAM_ALIASES[teamName]);

        for (const name of namesToTry) {
          try {
            const res = await fetch(
              `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data.teams && data.teams.length > 0) {
                const badge = data.teams[0].strBadge || data.teams[0].strTeamBadge || "";
                if (badge) {
                  const smallBadge = badge + "/small";
                  logoMap.set(teamName, smallBadge);
                  // Persist to DB permanently
                  await supabase.from("team_badges").upsert(
                    { team_name: teamName, badge_url: smallBadge, source: "thesportsdb" },
                    { onConflict: "team_name" }
                  );
                  return;
                }
              }
            }
          } catch {
            // silent
          }
        }
        logoMap.set(teamName, "");
      })
    );
  }

  return logoMap;
}

// ─── Main Handler ───

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
      const maxAge = hasLive ? 3 * 60 * 1000 : 15 * 60 * 1000;
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

    // ─── Multi-Source Fallback ───
    const SOURCES = [
      { url: "https://placardefutebol.com.br", timeout: 15000, label: "Source A (placardefutebol)" },
      { url: "https://www.sofascore.com/pt/futebol", timeout: 20000, label: "Source B (sofascore)" },
      { url: "https://onefootball.com/pt-br/jogos", timeout: 25000, label: "Source C (onefootball)" },
    ];

    let rawMatches: any[] | null = null;
    let sourceUsed = "";

    for (const source of SOURCES) {
      rawMatches = await scrapeSource(FIRECRAWL_API_KEY, source.url, source.timeout, source.label);
      if (rawMatches && rawMatches.length > 0) {
        sourceUsed = source.label;
        break;
      }
    }

    // If all sources failed, return stale cache or error
    if (!rawMatches || rawMatches.length === 0) {
      console.warn("[Fallback] All sources failed");
      if (cached) {
        console.log("[Fallback] Returning stale cache");
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("All scraping sources failed and no cache available");
    }

    console.log(`[Fallback] Using data from ${sourceUsed}: ${rawMatches.length} raw matches`);

    // Filter premium leagues
    const premiumMatches = rawMatches.filter((m: any) => isPremiumLeague(m.league_name || ""));
    console.log(`[Filter] ${premiumMatches.length} premium matches after filter`);

    // Resolve team logos (DB-persistent)
    const uniqueTeams = [...new Set(premiumMatches.flatMap((m: any) => [m.home_team_name, m.away_team_name]))];
    const logoMap = await resolveTeamLogos(uniqueTeams, supabase);

    // Transform to Match format
    const allMatches = premiumMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status || "");

      let matchDate = new Date().toISOString();
      const timeMatch = (m.match_status || "").match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const d = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`);
        matchDate = d.toISOString();
      }

      return {
        id: 9000 + index,
        league: { id: 0, name: m.league_name || "Desconhecida", logo: "", round: null },
        homeTeam: { id: 0, name: m.home_team_name || "Time A", logo: logoMap.get(m.home_team_name) || "" },
        awayTeam: { id: 0, name: m.away_team_name || "Time B", logo: logoMap.get(m.away_team_name) || "" },
        date: matchDate,
        status,
        elapsed,
        goals: { home: m.home_score ?? null, away: m.away_score ?? null },
        broadcast: getBroadcast(m.league_name || ""),
      };
    });

    console.log(`[Result] ${allMatches.length} matches ready (source: ${sourceUsed})`);

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
