import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Premium Leagues (STRICT WHITELIST) ─────────────────────────────
const RAPIDAPI_LEAGUE_IDS = [
  71, 72, 73, 625, 13, 11, 535, 34, 10, 2, 3, 1,
  480,  // Campeonato Paulista
  352,  // Campeonato Carioca
];

function isPremiumLeague(name: string, leagueId?: number): boolean {
  const lower = name.toLowerCase().trim();
  const REJECTED = [
    "u17", "u18", "u19", "u20", "u21", "u23", "sub-", "sub ",
    "frauen", "women", "feminino", "reserve", "youth", "amateur", "group stage",
  ];
  for (const ex of REJECTED) { if (lower.includes(ex)) return false; }
  if (lower.includes("caf champions")) return false;

  const ALLOWED = [
    "brasileirão", "campeonato brasileiro", "série a", "série b",
    "copa do brasil", "supercopa", "supercopa do brasil",
    "copa libertadores", "libertadores", "copa sul-americana", "sul-americana",
    "recopa sul-americana", "recopa",
    "champions league", "uefa champions league", "liga dos campeões",
    "europa league", "uefa europa league", "liga europa",
    "eliminatórias", "world cup qualif",
    "copa do mundo", "world cup", "fifa world cup",
    "amistoso", "amistosos", "friendly", "friendlies",
    "campeonato paulista", "paulistão", "paulista a1",
    "campeonato carioca", "cariocão", "carioca",
  ];
  for (const league of ALLOWED) {
    if (lower === league || lower.startsWith(league)) return true;
  }
  return false;
}

// ─── Status parsing ─────────────────────────────────────────────────
function parseStatus(statusText: string): { status: string; elapsed: number | null } {
  if (!statusText || statusText.trim() === "") return { status: "programado", elapsed: null };
  const s = statusText.trim();
  if (["F", "FT", "Match Finished"].includes(s) || s.toLowerCase() === "encerrado" || s.toLowerCase() === "fin")
    return { status: "finalizado", elapsed: 90 };
  if (["HT", "Halftime"].includes(s) || s.toLowerCase() === "intervalo" || s.toLowerCase() === "int")
    return { status: "ao_vivo", elapsed: 45 };
  if (["AET", "After Extra Time"].includes(s) || s.toLowerCase() === "prorrogação")
    return { status: "finalizado", elapsed: 120 };
  if (["PEN", "Penalty In Progress"].includes(s) || s.toLowerCase() === "pênaltis")
    return { status: "ao_vivo", elapsed: 120 };
  if (s.toLowerCase().includes("susp")) return { status: "suspenso", elapsed: null };
  if (s.toLowerCase().includes("adiado") || ["PST", "Postponed"].includes(s))
    return { status: "adiado", elapsed: null };
  if (s.toLowerCase().includes("canc") || ["CANC", "Cancelled"].includes(s))
    return { status: "cancelado", elapsed: null };
  if (["NS", "Not Started", "TBD"].includes(s)) return { status: "programado", elapsed: null };
  if (["1H", "First Half"].includes(s)) return { status: "ao_vivo", elapsed: null };
  if (["2H", "Second Half"].includes(s)) return { status: "ao_vivo", elapsed: null };
  if (/^\d{1,2}:\d{2}/.test(s)) return { status: "programado", elapsed: null };
  const minuteMatch = s.match(/^(\d+)['′+]?$/);
  if (minuteMatch) return { status: "ao_vivo", elapsed: parseInt(minuteMatch[1]) };
  return { status: "programado", elapsed: null };
}

// Map RapidAPI short status to our status
function mapRapidAPIStatus(shortStatus: string, elapsed: number | null): string {
  if (["LIVE", "1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(shortStatus)) return "ao_vivo";
  if (["FT", "AET", "PEN"].includes(shortStatus)) return "finalizado";
  if (["PST"].includes(shortStatus)) return "adiado";
  if (["CANC", "ABD", "AWD", "WO"].includes(shortStatus)) return "cancelado";
  if (["SUSP"].includes(shortStatus)) return "suspenso";
  return "programado";
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
  "recopa": ["ESPN", "SBT"],
  "champions league": ["TNT", "HBO Max"],
  "europa league": ["ESPN", "Star+"],
  "supercopa": ["Globo", "SporTV"],
  "eliminatórias": ["Globo", "SporTV", "CazéTV"],
  "copa do mundo": ["Globo", "SporTV", "CazéTV"],
  "amistoso": ["SporTV", "ESPN"],
  "paulista": ["Record", "CazéTV", "Nosso Futebol"],
  "paulistão": ["Record", "CazéTV", "Nosso Futebol"],
  "carioca": ["Band", "SporTV", "Premiere"],
  "cariocão": ["Band", "SporTV", "Premiere"],
};

function getBroadcast(leagueName: string): string[] {
  const lower = leagueName.toLowerCase();
  for (const [key, channels] of Object.entries(BROADCAST_MAP)) {
    if (lower.includes(key)) return channels;
  }
  return ["ESPN"];
}

// ─── Team badge resolution with DB cache ────────────────────────────
const logoCache = new Map<string, string>();

// Hardcoded fallback badges for top Brazilian teams (TheSportsDB URLs)
const FALLBACK_BADGES: Record<string, string> = {
  "Flamengo": "https://r2.thesportsdb.com/images/media/team/badge/d0psg11658917318.png/small",
  "Botafogo": "https://r2.thesportsdb.com/images/media/team/badge/pxwrq41720364498.png/small",
  "Fluminense": "https://r2.thesportsdb.com/images/media/team/badge/bfryds1689287206.png/small",
  "Vasco da Gama": "https://r2.thesportsdb.com/images/media/team/badge/0bhe2g1548977468.png/small",
  "Palmeiras": "https://r2.thesportsdb.com/images/media/team/badge/yfynps1534075792.png/small",
  "Corinthians": "https://r2.thesportsdb.com/images/media/team/badge/swyrwu1448975705.png/small",
  "São Paulo": "https://r2.thesportsdb.com/images/media/team/badge/xqsutt1448975643.png/small",
  "Sao Paulo": "https://r2.thesportsdb.com/images/media/team/badge/xqsutt1448975643.png/small",
  "Santos": "https://r2.thesportsdb.com/images/media/team/badge/d8xyrp1534075902.png/small",
  "Internacional": "https://r2.thesportsdb.com/images/media/team/badge/51ks2u1549229498.png/small",
  "Gremio": "https://r2.thesportsdb.com/images/media/team/badge/m20quy1534182427.png/small",
  "Atletico Mineiro": "https://r2.thesportsdb.com/images/media/team/badge/qmkqyv1534074719.png/small",
  "Cruzeiro": "https://r2.thesportsdb.com/images/media/team/badge/quvrpx1423758422.png/small",
  "Bahia": "https://r2.thesportsdb.com/images/media/team/badge/r29lkn1534071500.png/small",
  "Fortaleza": "https://r2.thesportsdb.com/images/media/team/badge/7p6c4k1611591726.png/small",
  "Athletico Paranaense": "https://r2.thesportsdb.com/images/media/team/badge/5rwrhs1558717280.png/small",
  "Bragantino": "https://r2.thesportsdb.com/images/media/team/badge/2p7tl41701423595.png/small",
  "Botafogo SP": "https://r2.thesportsdb.com/images/media/team/badge/r3pxcm1534071505.png/small",
};

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
  // Brazilian teams with state suffixes
  "Botafogo RJ": "Botafogo", "Flamengo RJ": "Flamengo", "Fluminense RJ": "Fluminense",
  "Vasco da Gama RJ": "Vasco da Gama", "Vasco RJ": "Vasco da Gama",
  "Botafogo SP": "Botafogo SP", "Guarani SP": "Guarani",
  "Portuguesa SP": "Portuguesa", "Ferroviária SP": "Ferroviaria",
  "São Paulo SP": "Sao Paulo", "Corinthians SP": "Corinthians",
  "Santos SP": "Santos", "Palmeiras SP": "Palmeiras",
  "Red Bull Bragantino": "Bragantino", "RB Bragantino": "Bragantino",
  "América MG": "America Mineiro", "América-MG": "America Mineiro",
  "Athletico PR": "Athletico Paranaense", "Athletico-PR": "Athletico Paranaense",
  "Atlético MG": "Atletico Mineiro", "Atlético-MG": "Atletico Mineiro",
  "Cruzeiro MG": "Cruzeiro", "Internacional RS": "Internacional",
  "Grêmio RS": "Gremio", "Sport RE": "Sport Recife",
  "Ceará CE": "Ceara", "Fortaleza CE": "Fortaleza",
  "Bahia BA": "Bahia", "Vitória BA": "Vitoria",
  "Goiás GO": "Goias", "Coritiba PR": "Coritiba",
};

async function loadBadgesFromDB(supabase: any, teamNames: string[]) {
  if (teamNames.length === 0) return;
  const { data } = await supabase
    .from("team_badges")
    .select("team_name, badge_url")
    .in("team_name", teamNames);
  if (data) {
    for (const row of data) {
      // Only cache non-empty badge URLs
      if (row.badge_url && row.badge_url.trim() !== "") logoCache.set(row.team_name, row.badge_url);
    }
  }
}

async function resolveAndCacheBadge(supabase: any, teamName: string): Promise<string> {
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;

  const namesToTry = [teamName];
  if (TEAM_ALIASES[teamName]) namesToTry.push(TEAM_ALIASES[teamName]);
  
  // Auto-strip Brazilian state suffixes (e.g. "Botafogo RJ" -> "Botafogo")
  const stateMatch = teamName.match(/^(.+?)\s+(RJ|SP|MG|RS|PR|SC|BA|CE|PE|GO|PA|AM|MA|MT|MS|SE|AL|RN|PB|PI|ES|DF|RO|RR|AP|AC|TO)$/i);
  if (stateMatch && !TEAM_ALIASES[teamName]) {
    namesToTry.push(stateMatch[1].trim());
  }

  // Check hardcoded fallback FIRST (faster, no API call)
  const aliasName = TEAM_ALIASES[teamName] || teamName;
  const fallback = FALLBACK_BADGES[aliasName] || FALLBACK_BADGES[teamName];
  if (fallback) {
    logoCache.set(teamName, fallback);
    supabase.from("team_badges").upsert(
      { team_name: teamName, badge_url: fallback, source: "fallback", updated_at: new Date().toISOString() },
      { onConflict: "team_name" }
    ).then(() => {});
    return fallback;
  }

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
            supabase.from("team_badges").upsert(
              { team_name: teamName, badge_url: smallBadge, source: "thesportsdb", updated_at: new Date().toISOString() },
              { onConflict: "team_name" }
            ).then(() => {});
            return smallBadge;
          }
        }
      }
    } catch { /* silent */ }
  }
  logoCache.set(teamName, "");
  return "";
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 1: RapidAPI (API-Football v3) — paid, most reliable
// ═══════════════════════════════════════════════════════════════════
async function fetchFromRapidAPI(dateStr: string): Promise<any[] | null> {
  const apiKey = (Deno.env.get("RAPIDAPI_FOOTBALL_KEY") || "").trim();
  if (!apiKey) { console.warn("[Source1] RAPIDAPI_FOOTBALL_KEY not set"); return null; }

  try {
    console.log(`[Source1-RapidAPI] Fetching fixtures for ${dateStr}...`);
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${dateStr}`,
      { headers: { "x-apisports-key": apiKey } }
    );
    if (!res.ok) { console.error(`[Source1-RapidAPI] HTTP ${res.status}`); await res.text(); return null; }

    const data = await res.json();
    const fixtures = data?.response || [];
    console.log(`[Source1-RapidAPI] Got ${fixtures.length} total fixtures`);

    const premiumSet = new Set(RAPIDAPI_LEAGUE_IDS);
    const filtered = fixtures.filter((f: any) => premiumSet.has(f.league?.id));
    console.log(`[Source1-RapidAPI] ${filtered.length} premium fixtures`);

    return filtered.map((f: any) => {
      const shortStatus = f.fixture?.status?.short || "NS";
      const elapsed = f.fixture?.status?.elapsed ?? null;
      return {
        id_partida: f.fixture?.id || 0,
        homeTeamName: f.teams?.home?.name || "Time A",
        awayTeamName: f.teams?.away?.name || "Time B",
        homeScore: f.goals?.home ?? null,
        awayScore: f.goals?.away ?? null,
        leagueName: f.league?.name || "Desconhecida",
        leagueId: f.league?.id || 0,
        status: mapRapidAPIStatus(shortStatus, elapsed),
        elapsed,
        date: f.fixture?.date || new Date().toISOString(),
        round: f.league?.round || null,
      };
    });
  } catch (e) {
    console.error(`[Source1-RapidAPI] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 2: ESPN Public API (free, unlimited)
// ═══════════════════════════════════════════════════════════════════
const ESPN_LEAGUE_SLUGS = [
  { slug: "bra.1", name: "Brasileirão Série A" },
  { slug: "bra.2", name: "Brasileirão Série B" },
  { slug: "bra.copa_do_brasil", name: "Copa do Brasil" },
  { slug: "bra.paulista_a1", name: "Campeonato Paulista" },
  { slug: "bra.carioca_a1", name: "Campeonato Carioca" },
  { slug: "conmebol.libertadores", name: "Copa Libertadores" },
  { slug: "conmebol.sudamericana", name: "Copa Sul-Americana" },
  { slug: "uefa.champions", name: "Champions League" },
  { slug: "uefa.europa", name: "Europa League" },
  { slug: "fifa.worldq.conmebol", name: "Eliminatórias CONMEBOL" },
  { slug: "fifa.world", name: "Copa do Mundo" },
  { slug: "fifa.friendly", name: "Amistosos Internacionais" },
];

async function fetchFromESPN(dateStr: string): Promise<any[] | null> {
  try {
    console.log(`[Source2-ESPN] Fetching from ESPN API for ${dateStr}...`);
    const yyyymmdd = dateStr.replace(/-/g, "");
    const allEvents: any[] = [];

    const fetches = ESPN_LEAGUE_SLUGS.map(async ({ slug, name }) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${yyyymmdd}`;
        const res = await fetch(url);
        if (!res.ok) { await res.text(); return []; }
        const data = await res.json();
        return (data?.events || []).map((ev: any) => ({ ...ev, _leagueName: name }));
      } catch { return []; }
    });

    const results = await Promise.all(fetches);
    for (const events of results) allEvents.push(...events);
    console.log(`[Source2-ESPN] Got ${allEvents.length} events`);
    if (allEvents.length === 0) return null;

    return allEvents.map((ev: any) => {
      const comp = ev.competitions?.[0];
      if (!comp) return null;
      const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");
      const espnStatus = comp.status?.type?.name || "";
      let status = "programado";
      let elapsed: number | null = null;

      if (["STATUS_FULL_TIME", "STATUS_FINAL"].includes(espnStatus)) status = "finalizado";
      else if (espnStatus === "STATUS_HALFTIME") { status = "ao_vivo"; elapsed = 45; }
      else if (["STATUS_IN_PROGRESS", "STATUS_FIRST_HALF"].includes(espnStatus)) {
        status = "ao_vivo"; elapsed = parseInt(comp.status?.displayClock || "0") || null;
      }
      else if (espnStatus === "STATUS_SECOND_HALF") {
        status = "ao_vivo"; elapsed = parseInt(comp.status?.displayClock || "0") || null;
      }
      else if (espnStatus === "STATUS_POSTPONED") status = "adiado";
      else if (["STATUS_CANCELED", "STATUS_CANCELLED"].includes(espnStatus)) status = "cancelado";
      else if (espnStatus === "STATUS_SUSPENDED") status = "suspenso";
      else if (espnStatus === "STATUS_EXTRA_TIME") { status = "ao_vivo"; elapsed = 105; }
      else if (espnStatus === "STATUS_PENALTY_SHOOTOUT") { status = "ao_vivo"; elapsed = 120; }

      const homeScore = homeComp?.score ? parseInt(homeComp.score) : null;
      const awayScore = awayComp?.score ? parseInt(awayComp.score) : null;

      return {
        id_partida: parseInt(ev.id) || Math.random() * 100000 | 0,
        homeTeamName: homeComp?.team?.displayName || "Time A",
        awayTeamName: awayComp?.team?.displayName || "Time B",
        homeScore: isNaN(homeScore as number) ? null : homeScore,
        awayScore: isNaN(awayScore as number) ? null : awayScore,
        leagueName: ev._leagueName || "Desconhecida",
        leagueId: 0,
        status,
        elapsed,
        date: ev.date || comp.date || new Date().toISOString(),
        round: null,
      };
    }).filter(Boolean);
  } catch (e) {
    console.error(`[Source2-ESPN] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 3: TheSportsDB (free, no key needed)
// ═══════════════════════════════════════════════════════════════════
async function fetchFromTheSportsDB(dateStr: string): Promise<any[] | null> {
  try {
    console.log(`[Source3-TheSportsDB] Fetching events for ${dateStr}...`);
    const allEvents: any[] = [];

    // Livescores
    try {
      const liveRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/livescore.php?s=Soccer`);
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        allEvents.push(...(liveData?.events || []));
      }
    } catch { /* silent */ }

    // Events by day
    try {
      const dayRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`);
      if (dayRes.ok) {
        const dayData = await dayRes.json();
        const existingIds = new Set(allEvents.map((e: any) => e.idEvent));
        for (const ev of (dayData?.events || [])) {
          if (!existingIds.has(ev.idEvent)) allEvents.push(ev);
        }
      }
    } catch { /* silent */ }

    if (allEvents.length === 0) return null;

    const EXCLUDED_TSDB = [
      "welsh", "cymru", "northern ireland", "faroe", "gibraltar",
      "andorra", "san marino", "malta", "kosovo", "luxembourg",
      "reserve", "youth", "u19", "u21", "u23", "women", "feminino", "amateur",
    ];

    const filtered = allEvents.filter((ev: any) => {
      const ln = (ev.strLeague || "").toLowerCase();
      if (EXCLUDED_TSDB.some(kw => ln.includes(kw))) return false;
      return isPremiumLeague(ev.strLeague || "");
    });

    console.log(`[Source3-TheSportsDB] ${filtered.length} premium events`);
    if (filtered.length === 0) return null;

    return filtered.map((ev: any) => {
      const progress = (ev.strProgress || ev.strStatus || "").trim();
      const { status, elapsed } = parseStatus(progress || "NS");
      const homeScore = ev.intHomeScore !== null && ev.intHomeScore !== "" ? parseInt(ev.intHomeScore) : null;
      const awayScore = ev.intAwayScore !== null && ev.intAwayScore !== "" ? parseInt(ev.intAwayScore) : null;

      let matchDate = new Date().toISOString();
      if (ev.dateEvent && ev.strTime) {
        matchDate = new Date(`${ev.dateEvent}T${ev.strTime.substring(0, 5)}:00Z`).toISOString();
      } else if (ev.strTimestamp) {
        matchDate = new Date(ev.strTimestamp).toISOString();
      }

      return {
        id_partida: parseInt(ev.idEvent) || Math.random() * 100000 | 0,
        homeTeamName: ev.strHomeTeam || "Time A",
        awayTeamName: ev.strAwayTeam || "Time B",
        homeScore: isNaN(homeScore as number) ? null : homeScore,
        awayScore: isNaN(awayScore as number) ? null : awayScore,
        leagueName: ev.strLeague || "Desconhecida",
        leagueId: parseInt(ev.idLeague) || 0,
        status,
        elapsed,
        date: matchDate,
        round: ev.intRound ? `Rodada ${ev.intRound}` : null,
      };
    });
  } catch (e) {
    console.error(`[Source3-TheSportsDB] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 4: APIFootball.com (free but limited)
// ═══════════════════════════════════════════════════════════════════
async function fetchFromAPIFootball(dateStr: string): Promise<any[] | null> {
  const apiKey = Deno.env.get("APIFOOTBALL_COM_KEY");
  if (!apiKey) { console.warn("[Source4] APIFOOTBALL_COM_KEY not set"); return null; }

  try {
    console.log(`[Source4-APIFootball] Fetching for ${dateStr}...`);
    const url = `https://apiv3.apifootball.com/?action=get_events&from=${dateStr}&to=${dateStr}&timezone=America/Sao_Paulo&APIkey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`[Source4] HTTP ${res.status}`); await res.text(); return null; }

    const data = await res.json();
    if (!Array.isArray(data)) return null;
    console.log(`[Source4-APIFootball] Got ${data.length} total events`);

    // Log sample of unique league names for debugging
    const uniqueLeagues = [...new Set(data.map((e: any) => e.league_name || ""))].slice(0, 30);
    console.log(`[Source4-APIFootball] Sample leagues: ${JSON.stringify(uniqueLeagues)}`);

    const EXCLUDED = [
      "welsh", "galês", "cymru", "northern ireland", "faroe", "gibraltar",
      "andorra", "san marino", "malta", "kosovo", "luxembourg", "liechtenstein",
      "reserve", "youth", "u19", "u21", "u23", "women", "feminino", "amateur",
    ];

    const filtered = data.filter((e: any) => {
      const ln = (e.league_name || "").toLowerCase();
      if (EXCLUDED.some(kw => ln.includes(kw))) return false;
      return isPremiumLeague(e.league_name || "");
    });

    console.log(`[Source4-APIFootball] ${filtered.length} premium events`);
    if (filtered.length === 0) return null;

    return filtered.map((e: any) => {
      const { status, elapsed } = parseStatus(e.match_status || "");
      const homeScore = e.match_hometeam_score !== "" ? parseInt(e.match_hometeam_score) : null;
      const awayScore = e.match_awayteam_score !== "" ? parseInt(e.match_awayteam_score) : null;
      let matchDate = new Date().toISOString();
      if (e.match_date && e.match_time) {
        matchDate = new Date(`${e.match_date}T${e.match_time}:00-03:00`).toISOString();
      }
      return {
        id_partida: parseInt(e.match_id) || Math.random() * 100000 | 0,
        homeTeamName: e.match_hometeam_name || "Time A",
        awayTeamName: e.match_awayteam_name || "Time B",
        homeScore: isNaN(homeScore as number) ? null : homeScore,
        awayScore: isNaN(awayScore as number) ? null : awayScore,
        leagueName: e.league_name || "Desconhecida",
        leagueId: parseInt(e.league_id) || 0,
        status,
        elapsed,
        date: matchDate,
        round: null,
      };
    });
  } catch (e) {
    console.error(`[Source4-APIFootball] Error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// INTELLIGENT POLLING LOGIC
// ═══════════════════════════════════════════════════════════════════
interface PollingDecision {
  shouldFetch: boolean;
  reason: string;
  hasLiveGames: boolean;
  gamesStartingSoon: number;
}

async function decidePolling(supabase: any, brDate: string): Promise<PollingDecision> {
  // Check current state of jogos_ativos
  const { data: currentGames } = await supabase
    .from("jogos_ativos")
    .select("id_partida, status, horario_inicio, atualizado_em")
    .eq("data_jogo", brDate);

  const games = currentGames || [];
  const now = new Date();

  // Count live games
  const liveGames = games.filter((g: any) => g.status === "ao_vivo");
  if (liveGames.length > 0) {
    return { shouldFetch: true, reason: `${liveGames.length} jogos ao vivo`, hasLiveGames: true, gamesStartingSoon: 0 };
  }

  // Check games starting within 15 minutes
  const soonGames = games.filter((g: any) => {
    if (g.status !== "programado") return false;
    const startTime = new Date(g.horario_inicio).getTime();
    const diff = startTime - now.getTime();
    return diff > 0 && diff <= 15 * 60 * 1000; // 15 min
  });
  if (soonGames.length > 0) {
    return { shouldFetch: true, reason: `${soonGames.length} jogos começando em <15min`, hasLiveGames: false, gamesStartingSoon: soonGames.length };
  }

  // No live/soon games: check if we have any data at all for today
  if (games.length === 0) {
    return { shouldFetch: true, reason: "Nenhum dado para hoje — busca inicial", hasLiveGames: false, gamesStartingSoon: 0 };
  }

  // Check last update time — only fetch if >30 min ago
  const lastUpdate = games.reduce((latest: Date, g: any) => {
    const t = new Date(g.atualizado_em);
    return t > latest ? t : latest;
  }, new Date(0));

  const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 60000;
  if (minutesSinceUpdate >= 30) {
    return { shouldFetch: true, reason: `Última atualização há ${Math.round(minutesSinceUpdate)}min — refresh periódico`, hasLiveGames: false, gamesStartingSoon: 0 };
  }

  return { shouldFetch: false, reason: `Sem jogos ao vivo, última atualização há ${Math.round(minutesSinceUpdate)}min`, hasLiveGames: false, gamesStartingSoon: 0 };
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
    const isCronRequest = req.headers.get("x-cron-source") === "pg_cron";

    // For non-cron requests, just return current data from jogos_ativos
    if (!isCronRequest) {
      const { data } = await supabase
        .from("jogos_ativos")
        .select("*")
        .eq("data_jogo", brDate)
        .order("status", { ascending: true }) // ao_vivo first
        .order("horario_inicio", { ascending: true });

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CRON: Intelligent polling ──
    const decision = await decidePolling(supabase, brDate);
    console.log(`[Polling] Decision: shouldFetch=${decision.shouldFetch} | ${decision.reason}`);

    if (!decision.shouldFetch) {
      console.log(`[Polling] Skipping API call — ${decision.reason}`);
      return new Response(JSON.stringify({ skipped: true, reason: decision.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Multi-source cascade ──
    console.log(`[Scraper] Starting multi-source fetch for ${brDate}`);
    let rawMatches: any[] | null = null;
    let source = "none";

    // Source 1: RapidAPI
    rawMatches = await fetchFromRapidAPI(brDate);
    if (rawMatches && rawMatches.length > 0) source = "RapidAPI";

    // Source 2: ESPN
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromESPN(brDate);
      if (rawMatches && rawMatches.length > 0) source = "ESPN-API";
    }

    // Source 3: TheSportsDB
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromTheSportsDB(brDate);
      if (rawMatches && rawMatches.length > 0) source = "TheSportsDB";
    }

    // Source 4: APIFootball.com
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromAPIFootball(brDate);
      if (rawMatches && rawMatches.length > 0) source = "APIFootball.com";
    }

    if (!rawMatches || rawMatches.length === 0) {
      console.error(`[Scraper] All sources returned empty/failed`);
      return new Response(JSON.stringify({ error: "No data from any source" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Scraper] Using source: ${source} with ${rawMatches.length} matches`);

    // ── Resolve team badges (from DB cache first, then API) ──
    const uniqueTeams = [...new Set(rawMatches.flatMap((m: any) => [m.homeTeamName, m.awayTeamName]))];
    await loadBadgesFromDB(supabase, uniqueTeams);

    const missingTeams = uniqueTeams.filter(t => !logoCache.has(t));
    if (missingTeams.length > 0) {
      console.log(`[Badges] Resolving ${missingTeams.length} missing badges from API...`);
      await Promise.all(missingTeams.map(name => resolveAndCacheBadge(supabase, name)));
    } else {
      console.log(`[Badges] All ${uniqueTeams.length} badges served from DB cache`);
    }

    // ── Upsert into jogos_ativos ──
    const upsertRows = rawMatches.map((m: any) => ({
      id_partida: m.id_partida,
      liga_nome: m.leagueName,
      liga_id: m.leagueId || 0,
      liga_logo: "",
      rodada: m.round || null,
      time_casa: m.homeTeamName,
      time_fora: m.awayTeamName,
      emblema_casa: logoCache.get(m.homeTeamName) || "",
      emblema_fora: logoCache.get(m.awayTeamName) || "",
      placar_casa: m.homeScore,
      placar_fora: m.awayScore,
      horario_inicio: m.date,
      status: m.status,
      elapsed: m.elapsed,
      transmissao: getBroadcast(m.leagueName),
      data_jogo: brDate,
      fonte: source,
      atualizado_em: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("jogos_ativos")
      .upsert(upsertRows, { onConflict: "id_partida,data_jogo" });

    if (upsertError) {
      console.error(`[DB] Upsert error:`, upsertError);
    } else {
      console.log(`[DB] Upserted ${upsertRows.length} matches into jogos_ativos`);
    }

    // Also update legacy football_cache for backward compatibility
    const legacyMatches = rawMatches.map((m: any, i: number) => ({
      id: 9000 + i,
      league: { id: m.leagueId || 0, name: m.leagueName, logo: "", round: m.round },
      homeTeam: { id: 0, name: m.homeTeamName, logo: logoCache.get(m.homeTeamName) || "" },
      awayTeam: { id: 0, name: m.awayTeamName, logo: logoCache.get(m.awayTeamName) || "" },
      date: m.date,
      status: m.status === "ao_vivo" ? "1H" : m.status === "finalizado" ? "FT" : m.status === "programado" ? "NS" : m.status.toUpperCase(),
      elapsed: m.elapsed,
      goals: { home: m.homeScore, away: m.awayScore },
      broadcast: getBroadcast(m.leagueName),
      source,
    }));

    await supabase.from("football_cache").upsert(
      { cache_date: brDate, matches: legacyMatches, fetched_at: new Date().toISOString() },
      { onConflict: "cache_date" }
    );

    return new Response(JSON.stringify({ success: true, source, count: upsertRows.length, decision: decision.reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
