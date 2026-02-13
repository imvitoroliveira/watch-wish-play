import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Premium leagues for Google Search queries
const SEARCH_QUERIES = [
  "Champions League jogos hoje placar",
  "Premier League jogos hoje placar",
  "La Liga jogos hoje placar",
  "Bundesliga jogos hoje placar",
  "Serie A Itália jogos hoje placar",
  "Ligue 1 jogos hoje placar",
  "Brasileirão Serie A jogos hoje placar",
  "Copa do Brasil jogos hoje placar",
  "Copa Libertadores jogos hoje placar",
  "Copa Sul-Americana jogos hoje placar",
  "Europa League jogos hoje placar",
];

const PREMIUM_LEAGUES_KEYWORDS = [
  "champions league", "liga dos campeões",
  "premier league",
  "laliga", "la liga",
  "bundesliga",
  "serie a", "série a",
  "ligue 1",
  "brasileirão", "campeonato brasileiro",
  "copa do brasil",
  "libertadores",
  "sul-americana", "copa sul-americana",
  "europa league", "liga europa",
  "conference league",
  "eliminatórias",
  "copa do mundo",
  "campeonato paulista", "campeonato carioca",
  "supercopa",
];

function isPremiumLeague(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return PREMIUM_LEAGUES_KEYWORDS.some(k => lower.includes(k) || k.includes(lower));
}

function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();
  if (/\bfin(al|alizado)?\b|\bencerrado\b|\b(FT|AET)\b/i.test(s))
    return { status: "FT", elapsed: 90 };
  if (/\binterval(o)?\b|\bHT\b/i.test(s))
    return { status: "HT", elapsed: 45 };
  if (/\bprorrog/i.test(s)) return { status: "AET", elapsed: 120 };
  if (/\bp[eê]nalt/i.test(s)) return { status: "PEN", elapsed: 120 };
  if (/\bsusp/i.test(s)) return { status: "SUSP", elapsed: null };
  if (/\badiado\b/i.test(s)) return { status: "PST", elapsed: null };
  const minuteMatch = s.match(/(\d+)['′]/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }
  // "1º tempo", "2º tempo" patterns
  if (/1[ºo]\s*tempo/i.test(s)) return { status: "1H", elapsed: null };
  if (/2[ºo]\s*tempo/i.test(s)) return { status: "2H", elapsed: null };
  if (/ao\s*vivo|live|em\s*andamento/i.test(s)) return { status: "LIVE", elapsed: null };
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
  "liga dos campeões": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "premier league": ["ESPN", "Star+"],
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

// TheSportsDB badge resolver with persistent DB cache
const TEAM_ALIASES: Record<string, string> = {
  "Paris Saint-Germain": "Paris SG", "PSG": "Paris SG",
  "Atlético de Madrid": "Atletico Madrid", "Atlético Madrid": "Atletico Madrid",
  "Inter de Milão": "Inter Milan", "Internazionale": "Inter Milan",
  "B. Dortmund": "Borussia Dortmund", "Mainz 05": "Mainz",
  "Bayern de Munique": "Bayern Munich", "Bayer Leverkusen": "Bayer 04 Leverkusen",
  "Wolverhampton": "Wolverhampton Wanderers",
  "Man United": "Manchester United", "Man City": "Manchester City",
  "Nottm Forest": "Nottingham Forest", "Tottenham": "Tottenham Hotspur",
  "Newcastle": "Newcastle United", "West Ham": "West Ham United",
  "Sheffield Utd": "Sheffield United", "Stade Brestois": "Stade Brestois 29",
  "Athletico-PR": "Athletico Paranaense", "Atlético-MG": "Atletico Mineiro",
  "Atlético Mineiro": "Atletico Mineiro",
};

async function resolveTeamBadge(
  teamName: string,
  supabase: any,
  memoryCache: Map<string, string>
): Promise<string> {
  // 1. Memory cache (in-process)
  if (memoryCache.has(teamName)) return memoryCache.get(teamName)!;

  // 2. DB persistent cache
  const { data: cached } = await supabase
    .from("team_badges")
    .select("badge_url")
    .eq("team_name", teamName)
    .maybeSingle();

  if (cached) {
    memoryCache.set(teamName, cached.badge_url);
    return cached.badge_url;
  }

  // 3. Fetch from TheSportsDB
  const namesToTry = [teamName];
  if (TEAM_ALIASES[teamName]) namesToTry.push(TEAM_ALIASES[teamName]);

  let badge = "";
  for (const name of namesToTry) {
    try {
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.teams?.[0]) {
          badge = data.teams[0].strBadge || data.teams[0].strTeamBadge || "";
          if (badge) {
            badge += "/small";
            break;
          }
        }
      }
    } catch { /* silent */ }
  }

  // 4. Persist to DB
  memoryCache.set(teamName, badge);
  await supabase.from("team_badges").upsert(
    { team_name: teamName, badge_url: badge, updated_at: new Date().toISOString() },
    { onConflict: "team_name" }
  ).then(() => {});

  return badge;
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

    // Check cache — 2min for live, 15min otherwise
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
      const maxAge = hasLive ? 2 * 60 * 1000 : 15 * 60 * 1000;
      if (cacheAge < maxAge) {
        console.log(`[Cache HIT] ${matches.length} matches, age: ${Math.round(cacheAge / 1000)}s`);
        return new Response(JSON.stringify(matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");

    // Use Firecrawl Search to query Google for live scores
    console.log(`[Engine] Searching Google for live scores via Firecrawl...`);

    const allRawMatches: any[] = [];
    const seen = new Set<string>();

    // Run searches in parallel batches of 3
    for (let i = 0; i < SEARCH_QUERIES.length; i += 3) {
      const batch = SEARCH_QUERIES.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(async (query) => {
          try {
            const res = await fetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query,
                limit: 5,
                lang: "pt-br",
                country: "br",
                scrapeOptions: { formats: ["extract"], extract: {
                  prompt: "Extract all football/soccer match results from this page. For each match: league_name, home_team_name, away_team_name, home_score (number or null), away_score (number or null), match_status (minute like '67' for live, 'Intervalo' for halftime, 'Encerrado' for finished, or kickoff time like '21:30' for scheduled). Return as JSON array.",
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
                          required: ["home_team_name", "away_team_name"],
                        },
                      },
                    },
                  },
                }},
              }),
            });
            if (!res.ok) return [];
            const data = await res.json();
            // Search results may have extracted data in each result
            const results = data?.data || data?.results || [];
            const extracted: any[] = [];
            for (const r of results) {
              const ext = r?.extract?.matches || r?.data?.extract?.matches || [];
              extracted.push(...ext);
            }
            return extracted;
          } catch (e) {
            console.warn(`[Search] Failed for "${query}":`, e);
            return [];
          }
        })
      );
      results.flat().forEach((m: any) => {
        if (!m?.home_team_name || !m?.away_team_name) return;
        const key = `${m.home_team_name}-${m.away_team_name}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allRawMatches.push(m);
        }
      });
    }

    console.log(`[Engine] Extracted ${allRawMatches.length} unique matches from Google`);

    // Filter premium only
    const premiumMatches = allRawMatches.filter((m: any) =>
      isPremiumLeague(m.league_name || "")
    );
    console.log(`[Engine] ${premiumMatches.length} premium matches`);

    // Resolve badges with persistent cache
    const memoryCache = new Map<string, string>();
    // Pre-load DB badges
    const { data: allBadges } = await supabase.from("team_badges").select("team_name, badge_url");
    if (allBadges) {
      allBadges.forEach((b: any) => memoryCache.set(b.team_name, b.badge_url));
    }

    const uniqueTeams = new Set<string>();
    premiumMatches.forEach((m: any) => {
      uniqueTeams.add(m.home_team_name);
      uniqueTeams.add(m.away_team_name);
    });

    // Only resolve teams not already in cache
    const teamsToResolve = [...uniqueTeams].filter(t => !memoryCache.has(t));
    console.log(`[Engine] Resolving ${teamsToResolve.length} new team badges...`);
    
    // Batch resolve in groups of 5
    for (let i = 0; i < teamsToResolve.length; i += 5) {
      await Promise.all(
        teamsToResolve.slice(i, i + 5).map(t => resolveTeamBadge(t, supabase, memoryCache))
      );
    }

    // Build matches
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
        homeTeam: {
          id: 0,
          name: m.home_team_name || "Time A",
          logo: memoryCache.get(m.home_team_name) || "",
        },
        awayTeam: {
          id: 0,
          name: m.away_team_name || "Time B",
          logo: memoryCache.get(m.away_team_name) || "",
        },
        date: matchDate,
        status,
        elapsed,
        goals: { home: m.home_score ?? null, away: m.away_score ?? null },
        broadcast: getBroadcast(m.league_name || ""),
      };
    });

    console.log(`[Engine] Final: ${allMatches.length} matches`);

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
    // Return cached data as fallback
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const { data: fallback } = await sb
        .from("football_cache")
        .select("matches")
        .eq("cache_date", brDate)
        .maybeSingle();
      if (fallback?.matches) {
        return new Response(JSON.stringify(fallback.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch { /* silent */ }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
