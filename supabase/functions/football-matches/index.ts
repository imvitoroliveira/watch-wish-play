import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map BeSoccer status text to our internal codes
function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText) return { status: "NS", elapsed: null };
  const s = statusText.trim().toLowerCase();

  if (s === "fin" || s === "finalizado" || s === "encerrado" || s === "ft") return { status: "FT", elapsed: 90 };
  if (s === "int" || s === "intervalo" || s === "ht") return { status: "HT", elapsed: 45 };
  if (s === "aet" || s === "prorrogação") return { status: "AET", elapsed: 120 };
  if (s === "pen" || s === "pênaltis") return { status: "PEN", elapsed: 120 };
  if (s === "susp" || s === "suspenso") return { status: "SUSP", elapsed: null };
  if (s === "adiado" || s === "pst") return { status: "PST", elapsed: null };
  if (s === "canc" || s === "cancelado") return { status: "CANC", elapsed: null };

  // Check for minute pattern like "45'" or "45+2'"
  const minuteMatch = s.match(/^(\d+)['′]?$/);
  if (minuteMatch) {
    const min = parseInt(minuteMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }

  const minutePlusMatch = s.match(/^(\d+)\+\d+['′]?$/);
  if (minutePlusMatch) {
    const min = parseInt(minutePlusMatch[1]);
    return { status: min <= 45 ? "1H" : "2H", elapsed: min };
  }

  // If it contains a time like "21:30", it's scheduled
  const timeMatch = s.match(/^\d{1,2}:\d{2}$/);
  if (timeMatch) return { status: "NS", elapsed: null };

  // "ao vivo" or "em jogo"
  if (s.includes("vivo") || s.includes("em jogo") || s.includes("live")) return { status: "LIVE", elapsed: null };

  // 1º tempo / 2º tempo
  if (s.includes("1") && s.includes("tempo")) return { status: "1H", elapsed: null };
  if (s.includes("2") && s.includes("tempo")) return { status: "2H", elapsed: null };

  return { status: "NS", elapsed: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today in São Paulo timezone
    const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // Check cache first (cast brDate string to match date column)
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
      // 5 min for live matches, 15 min for scheduled
      const maxAge = hasLive ? 5 * 60 * 1000 : 15 * 60 * 1000;
      if (cacheAge < maxAge) {
        console.log(`[Cache HIT] ${matches.length} matches, age: ${Math.round(cacheAge / 1000)}s`);
        return new Response(JSON.stringify(matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Scrape BeSoccer using Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const scrapeUrl = `https://pt.besoccer.com/resultados`;
    console.log(`[Scraper] Fetching matches from BeSoccer: ${scrapeUrl}`);

    const firecrawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: scrapeUrl,
        formats: ["markdown", "extract"],
        extract: {
          prompt:
            "Extract all football/soccer matches shown on this page. For each match extract: league_name, home_team_name, away_team_name, home_score (number or null if not started), away_score (number or null if not started), match_status (the exact status text shown like minute number, 'Fin', 'Int', time like '21:30', etc), and match_time (the scheduled kick-off time if shown like '21:30'). Return as an array under key 'matches'.",
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
        waitFor: 8000,
      }),
    });

    const firecrawlData = await firecrawlRes.json();

    if (!firecrawlRes.ok) {
      console.error("[Scraper] Firecrawl error:", JSON.stringify(firecrawlData));
      // Return cached data if available
      if (cached) {
        console.log("[Scraper] Returning stale cache due to scrape failure");
        return new Response(JSON.stringify(cached.matches), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Firecrawl error: ${firecrawlData.error || firecrawlRes.status}`);
    }

    // Debug: log what Firecrawl returned
    const markdown = firecrawlData?.data?.markdown || firecrawlData?.markdown || "";
    console.log(`[Scraper] Markdown length: ${markdown.length}`);
    if (markdown.length > 0) {
      console.log(`[Scraper] Markdown preview: ${markdown.substring(0, 500)}`);
    }

    const extractedJson = firecrawlData?.data?.extract || firecrawlData?.extract;
    console.log(`[Scraper] Extract result:`, JSON.stringify(extractedJson)?.substring(0, 500));
    const rawMatches = extractedJson?.matches || [];

    console.log(`[Scraper] Extracted ${rawMatches.length} matches from BeSoccer`);

    // Transform to our Match format
    const brDateObj = new Date(brDate + "T12:00:00-03:00");
    const allMatches: any[] = rawMatches.map((m: any, index: number) => {
      const { status, elapsed } = parseStatus(m.match_status);

      // Build a date string from match_time if available
      let matchDate = brDateObj.toISOString();
      if (m.match_time) {
        const timeMatch = m.match_time.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const d = new Date(brDate + `T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00-03:00`);
          matchDate = d.toISOString();
        }
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
        broadcast: [],
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
