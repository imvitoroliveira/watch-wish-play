import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Premium leagues whitelist
const PREMIUM_LEAGUES: Record<string, boolean> = {
  "laliga": true,
  "bundesliga": true,
  "serie a": true,
  "ligue 1": true,
  "premier league": true,
  "champions league": true,
  "liga dos campeões": true,
  "europa league": true,
  "liga europa": true,
  "conference league": true,
  "liga conferência": true,
  "brasileirão": true,
  "campeonato brasileiro": true,
  "copa do brasil": true,
  "copa libertadores": true,
  "libertadores": true,
  "copa sul-americana": true,
  "sul-americana": true,
  "eliminatórias": true,
  "copa do mundo": true,
  "taça de inglaterra": true,
  "taça de espanha": true,
  "copa del rey": true,
  "taça de itália": true,
  "coppa italia": true,
  "coupe de france": true,
  "dfb pokal": true,
  "supercopa": true,
  "campeonato paulista": true,
  "campeonato carioca": true,
  "recopa sul-americana": true,
  "fa cup": true,
};

function isPremiumLeague(name: string): boolean {
  const lower = name.toLowerCase().trim();
  for (const league of Object.keys(PREMIUM_LEAGUES)) {
    if (lower.includes(league) || league.includes(lower)) return true;
  }
  return false;
}

function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim();
  if (s === "F" || s === "Fin" || s.toLowerCase() === "fin" || s.toLowerCase() === "encerrado")
    return { status: "FT", elapsed: 90 };
  if (s === "HT" || s.toLowerCase() === "interv" || s.toLowerCase() === "intervalo")
    return { status: "HT", elapsed: 45 };
  if (s === "AET" || s.toLowerCase() === "prorrogação") return { status: "AET", elapsed: 120 };
  if (s === "PEN" || s.toLowerCase() === "pênaltis") return { status: "PEN", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "SUSP", elapsed: null };
  if (s.toLowerCase().includes("adiado")) return { status: "PST", elapsed: null };
  if (s.toLowerCase().includes("canc")) return { status: "CANC", elapsed: null };
  const minuteMatch = s.match(/^(\d+)['′]?$/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) return { status: "NS", elapsed: null };
  return { status: "NS", elapsed: null };
}

const BROADCAST_MAP: Record<string, string[]> = {
  "brasileirão": ["Premiere", "Globo", "SporTV"],
  "copa do brasil": ["Premiere", "Globo", "Amazon Prime"],
  "libertadores": ["Paramount+", "SBT", "ESPN"],
  "sul-americana": ["Paramount+", "SBT", "ESPN"],
  "champions league": ["TNT", "HBO Max"],
  "liga dos campeões": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "premier league": ["ESPN", "Star+"],
  "taça de inglaterra": ["ESPN", "Star+"],
  "fa cup": ["ESPN", "Star+"],
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

// Parse BeSoccer markdown to extract matches
// The markdown structure from BeSoccer PT is:
// [![LeagueName](flag_url)LeagueName](comp_url)
// [TeamA\n![TeamA](logo_url)\nScore_or_Time\n![TeamB](logo_url)\nTeamB\n**Status**](match_url)
function parseMarkdown(md: string): any[] {
  const matches: any[] = [];
  const lines = md.split("\n");
  let currentLeague = "";

  // Find league headers and match blocks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // League header pattern: [![LeagueName](flag)LeagueName](url)
    const leagueMatch = line.match(/\[!\[([^\]]+)\]\([^)]+\)([^\]]*)\]\([^)]+\)/);
    if (leagueMatch) {
      const leagueName = (leagueMatch[2] || leagueMatch[1]).trim();
      // Skip navigation/non-league items
      if (leagueName && leagueName.length > 2 && !leagueName.includes("Voltar") && !leagueName.includes("Directo")) {
        currentLeague = leagueName;
      }
      continue;
    }

    // Match block: starts with [TeamName\n and contains team logos
    // Look for patterns like: [TeamName\n\n![TeamName](logo_url)\n\nScore\n\n![TeamName2](logo_url)\n\nTeamName2\n\n**Status**](match_url)
    // But in markdown they might be on consecutive lines
    // Let's look for team logo patterns
    const logoMatch = line.match(/!\[([^\]]+)\]\((https:\/\/cdn\.resfu\.com\/img_data\/equipos\/\d+\.png[^)]*)\)/);
    if (logoMatch && currentLeague) {
      // Found a team logo - look for the match context
      // Scan backwards and forwards to find the full match block
      const homeTeamLogo = logoMatch[2];
      const homeTeamName = logoMatch[1];

      // Look forward for score/time and away team
      let awayTeamName = "";
      let awayTeamLogo = "";
      let scoreOrTime = "";
      let statusText = "";

      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j].trim();

        // Score pattern: "0-0" or "1-2" or "0-1"
        if (!scoreOrTime && /^\d+-\d+$/.test(nextLine)) {
          scoreOrTime = nextLine;
          continue;
        }

        // Time pattern: "14:00" or "21:30"
        if (!scoreOrTime && /^\d{1,2}:\d{2}$/.test(nextLine)) {
          scoreOrTime = nextLine;
          continue;
        }

        // Away team logo
        const awayLogoMatch = nextLine.match(/!\[([^\]]+)\]\((https:\/\/cdn\.resfu\.com\/img_data\/equipos\/\d+\.png[^)]*)\)/);
        if (awayLogoMatch && !awayTeamLogo) {
          awayTeamLogo = awayLogoMatch[2];
          awayTeamName = awayLogoMatch[1];
          continue;
        }

        // Status in bold: **Interv**, **Fin**, etc.
        const statusMatch = nextLine.match(/\*\*([^*]+)\*\*/);
        if (statusMatch) {
          statusText = statusMatch[1];
          break;
        }

        // Minute pattern standalone: "58'" or "46'"
        if (/^\d+['′]?$/.test(nextLine) && !scoreOrTime) {
          statusText = nextLine;
        }
      }

      // Also check line before for home team name
      let resolvedHomeName = homeTeamName;
      if (i > 0) {
        const prevLine = lines[i - 1].trim();
        // If previous line starts with [ and has a team name
        const prevTeamMatch = prevLine.match(/^\[?([A-Za-zÀ-ÿ\s.\-&']+)$/);
        if (prevTeamMatch && prevTeamMatch[1].length > 1) {
          resolvedHomeName = prevTeamMatch[1].trim();
        }
      }

      if (awayTeamLogo && (scoreOrTime || statusText)) {
        // Parse score
        let homeScore: number | null = null;
        let awayScore: number | null = null;
        if (scoreOrTime && /^\d+-\d+$/.test(scoreOrTime)) {
          const parts = scoreOrTime.split("-");
          homeScore = parseInt(parts[0]);
          awayScore = parseInt(parts[1]);
        }

        // Determine status
        let finalStatus = statusText || scoreOrTime;
        if (!statusText && /^\d{1,2}:\d{2}$/.test(scoreOrTime)) {
          finalStatus = scoreOrTime;
        }

        matches.push({
          league_name: currentLeague,
          home_team_name: resolvedHomeName,
          away_team_name: awayTeamName,
          home_team_logo_url: homeTeamLogo,
          away_team_logo_url: awayTeamLogo,
          home_score: homeScore,
          away_score: awayScore,
          match_status: finalStatus,
        });

        // Skip past this match block
        i += 5;
      }
    }
  }

  return matches;
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
    console.log(`[Scraper] Fetching markdown from BeSoccer PT...`);

    const firecrawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: scrapeUrl,
        formats: ["markdown"],
        waitFor: 5000,
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

    const markdown = firecrawlData?.data?.markdown || firecrawlData?.markdown || "";
    console.log(`[Scraper] Got ${markdown.length} chars of markdown`);

    // Debug: log first 500 chars
    console.log(`[Scraper] Preview: ${markdown.substring(0, 500)}`);

    const rawMatches = parseMarkdown(markdown);
    console.log(`[Scraper] Parsed ${rawMatches.length} raw matches from markdown`);

    // Filter premium leagues
    const premiumMatches = rawMatches.filter((m: any) => isPremiumLeague(m.league_name || ""));
    console.log(`[Scraper] ${premiumMatches.length} premium matches after filter`);

    // Transform to Match format
    const allMatches: any[] = premiumMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status || "");

      let matchDate = new Date().toISOString();
      const timeMatch = (m.match_status || "").match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const d = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`);
        matchDate = d.toISOString();
      }

      const fixLogo = (url: string | null | undefined): string => {
        if (!url) return "";
        return url.replace(/\?.*$/, "") + "?size=60x&lossy=1";
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

    console.log(`[Scraper] Final: ${allMatches.length} matches to cache`);

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
