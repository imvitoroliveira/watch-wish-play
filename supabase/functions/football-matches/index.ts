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

const FALLBACK_BADGES: Record<string, string> = {
  "Flamengo": "https://r2.thesportsdb.com/images/media/team/badge/syptwx1473538074.png",
  "Botafogo": "https://r2.thesportsdb.com/images/media/team/badge/uvut7f1473538051.png",
  "Fluminense": "https://r2.thesportsdb.com/images/media/team/badge/stvvwp1473538082.png",
  "Vasco da Gama": "https://r2.thesportsdb.com/images/media/team/badge/ynqlxo1630521109.png",
  "Palmeiras": "https://r2.thesportsdb.com/images/media/team/badge/vsqwqp1473538105.png",
  "Corinthians": "https://r2.thesportsdb.com/images/media/team/badge/vvuvps1473538042.png",
  "São Paulo": "https://r2.thesportsdb.com/images/media/team/badge/sxpupx1473538135.png",
  "Sao Paulo": "https://r2.thesportsdb.com/images/media/team/badge/sxpupx1473538135.png",
  "Santos": "https://r2.thesportsdb.com/images/media/team/badge/j8xk9g1679447486.png",
  "Internacional": "https://r2.thesportsdb.com/images/media/team/badge/yprvxx1473538097.png",
  "Gremio": "https://r2.thesportsdb.com/images/media/team/badge/uvpwyt1473538089.png",
  "Grêmio": "https://r2.thesportsdb.com/images/media/team/badge/uvpwyt1473538089.png",
  "Atletico Mineiro": "https://r2.thesportsdb.com/images/media/team/badge/x5lixs1743742872.png",
  "Atlético Mineiro": "https://r2.thesportsdb.com/images/media/team/badge/x5lixs1743742872.png",
  "Cruzeiro": "https://r2.thesportsdb.com/images/media/team/badge/upsvvu1473538059.png",
  "Bahia": "https://r2.thesportsdb.com/images/media/team/badge/xuvtsv1473539308.png",
  "Fortaleza": "https://r2.thesportsdb.com/images/media/team/badge/tosmdr1532853458.png",
  "Athletico Paranaense": "https://r2.thesportsdb.com/images/media/team/badge/irzu1u1554237406.png",
  "Bragantino": "https://r2.thesportsdb.com/images/media/team/badge/2p7tl41701423595.png",
  "Botafogo SP": "https://r2.thesportsdb.com/images/media/team/badge/r3pxcm1534071505.png",
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
      if (row.badge_url && row.badge_url.trim() !== "") logoCache.set(row.team_name, row.badge_url);
    }
  }
}

async function resolveAndCacheBadge(supabase: any, teamName: string): Promise<string> {
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;

  const namesToTry = [teamName];
  if (TEAM_ALIASES[teamName]) namesToTry.push(TEAM_ALIASES[teamName]);
  
  const stateMatch = teamName.match(/^(.+?)\s+(RJ|SP|MG|RS|PR|SC|BA|CE|PE|GO|PA|AM|MA|MT|MS|SE|AL|RN|PB|PI|ES|DF|RO|RR|AP|AC|TO)$/i);
  if (stateMatch && !TEAM_ALIASES[teamName]) {
    namesToTry.push(stateMatch[1].trim());
  }

  for (const name of namesToTry) {
    const fallback = FALLBACK_BADGES[name];
    if (fallback) {
      logoCache.set(teamName, fallback);
      supabase.from("team_badges").upsert(
        { team_name: teamName, badge_url: fallback, source: "fallback", updated_at: new Date().toISOString() },
        { onConflict: "team_name" }
      ).then(() => {});
      return fallback;
    }
  }

  const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const name of namesToTry) {
    const searchNames = [name];
    const stripped = stripAccents(name);
    if (stripped !== name) searchNames.push(stripped);
    
    for (const searchName of searchNames) {
      try {
        const res = await fetch(
          `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(searchName)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.teams?.length > 0) {
            const badge = data.teams[0].strBadge || data.teams[0].strTeamBadge || "";
            if (badge) {
              logoCache.set(teamName, badge);
              supabase.from("team_badges").upsert(
                { team_name: teamName, badge_url: badge, source: "thesportsdb", updated_at: new Date().toISOString() },
                { onConflict: "team_name" }
              ).then(() => {});
              return badge;
            }
          }
        }
      } catch { /* silent */ }
    }
  }
  logoCache.set(teamName, "");
  return "";
}

// ═══════════════════════════════════════════════════════════════════
// RANDOM USER-AGENTS (Anti-bot)
// ═══════════════════════════════════════════════════════════════════
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ═══════════════════════════════════════════════════════════════════
// API KEY ROTATION from api_keys table
// ═══════════════════════════════════════════════════════════════════
interface ApiKeyRow {
  id: string;
  key_name: string;
  api_key: string;
  status: string;
  cooldown_until: string | null;
  last_used_at: string;
  total_calls: number;
}

async function getNextApiKey(supabase: any): Promise<ApiKeyRow | null> {
  const now = new Date().toISOString();

  // First, reactivate any keys whose cooldown has expired
  await supabase
    .from("api_keys")
    .update({ status: "active", cooldown_until: null })
    .eq("status", "cooldown")
    .lt("cooldown_until", now);

  // Get the active key that was used least recently
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("status", "active")
    .eq("provider", "rapidapi")
    .order("last_used_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    console.warn("[KeyRotation] No active API keys available");
    return null;
  }

  return data[0] as ApiKeyRow;
}

async function markKeyUsed(supabase: any, keyId: string) {
  await supabase
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      total_calls: undefined, // handled below
    })
    .eq("id", keyId);

  // Increment total_calls
  const { data } = await supabase
    .from("api_keys")
    .select("total_calls")
    .eq("id", keyId)
    .single();

  if (data) {
    await supabase
      .from("api_keys")
      .update({ total_calls: (data.total_calls || 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", keyId);
  }
}

async function putKeyOnCooldown(supabase: any, keyId: string, minutes = 60) {
  const cooldownUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  console.warn(`[KeyRotation] Putting key ${keyId} on cooldown until ${cooldownUntil}`);
  await supabase
    .from("api_keys")
    .update({ status: "cooldown", cooldown_until: cooldownUntil })
    .eq("id", keyId);
}

// ═══════════════════════════════════════════════════════════════════
// SOURCE 1: RapidAPI with Key Rotation & 429 Handling
// ═══════════════════════════════════════════════════════════════════
async function fetchFromRapidAPIWithRotation(supabase: any, dateStr: string): Promise<{ matches: any[] | null; source: string }> {
  // Try up to 3 keys
  for (let attempt = 0; attempt < 3; attempt++) {
    const keyRow = await getNextApiKey(supabase);
    if (!keyRow) {
      console.warn(`[Source1-RapidAPI] No keys available (attempt ${attempt + 1})`);
      break;
    }

    console.log(`[Source1-RapidAPI] Using key "${keyRow.key_name}" (attempt ${attempt + 1})`);

    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${dateStr}`,
        {
          headers: {
            "x-apisports-key": keyRow.api_key,
            "User-Agent": randomUA(),
          },
        }
      );

      // Handle 429 Too Many Requests
      if (res.status === 429) {
        console.warn(`[Source1-RapidAPI] 429 on key "${keyRow.key_name}" — putting on 1h cooldown`);
        await putKeyOnCooldown(supabase, keyRow.id, 60);
        await res.text(); // consume body
        continue; // try next key
      }

      if (!res.ok) {
        console.error(`[Source1-RapidAPI] HTTP ${res.status} with key "${keyRow.key_name}"`);
        await res.text();
        continue;
      }

      // Success — mark key as used
      await markKeyUsed(supabase, keyRow.id);

      const data = await res.json();
      const fixtures = data?.response || [];
      console.log(`[Source1-RapidAPI] Got ${fixtures.length} total fixtures with key "${keyRow.key_name}"`);

      const premiumSet = new Set(RAPIDAPI_LEAGUE_IDS);
      const filtered = fixtures.filter((f: any) => premiumSet.has(f.league?.id));
      console.log(`[Source1-RapidAPI] ${filtered.length} premium fixtures`);

      if (filtered.length === 0) return { matches: null, source: "none" };

      const matches = filtered.map((f: any) => {
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

      return { matches, source: `RapidAPI(${keyRow.key_name})` };
    } catch (e: any) {
      console.error(`[Source1-RapidAPI] Error with key "${keyRow.key_name}": ${e.message}`);
      continue;
    }
  }

  return { matches: null, source: "none" };
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
        const res = await fetch(url, { headers: { "User-Agent": randomUA() } });
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
  } catch (e: any) {
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

    try {
      const liveRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/livescore.php?s=Soccer`, {
        headers: { "User-Agent": randomUA() },
      });
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        allEvents.push(...(liveData?.events || []));
      }
    } catch { /* silent */ }

    try {
      const dayRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`, {
        headers: { "User-Agent": randomUA() },
      });
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
  } catch (e: any) {
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
    const res = await fetch(url, { headers: { "User-Agent": randomUA() } });
    if (!res.ok) { console.error(`[Source4] HTTP ${res.status}`); await res.text(); return null; }

    const data = await res.json();
    if (!Array.isArray(data)) return null;
    console.log(`[Source4-APIFootball] Got ${data.length} total events`);

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
  } catch (e: any) {
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
    return diff > 0 && diff <= 15 * 60 * 1000;
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
// RANDOM JITTER (Anti-bot delay)
// ═══════════════════════════════════════════════════════════════════
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        .order("status", { ascending: true })
        .order("horario_inicio", { ascending: true });

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CRON: Interval is 5min, no probabilistic skip needed ──
    console.log(`[Cron] Proceeding (interval=5min)`);

    // ── CRON: Intelligent polling — check if there's a reason to fetch ──
    const decision = await decidePolling(supabase, brDate);
    console.log(`[Polling] Decision: shouldFetch=${decision.shouldFetch} | ${decision.reason}`);

    if (!decision.shouldFetch) {
      console.log(`[Polling] Sem jogos ativos no momento — encerrando`);
      return new Response(JSON.stringify({ skipped: true, reason: decision.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── JITTER: Random delay 5-40 seconds (anti-bot pattern breaking) ──
    const jitterMs = 5000 + Math.floor(Math.random() * 35000);
    console.log(`[Jitter] Aguardando ${(jitterMs / 1000).toFixed(1)}s antes de disparar...`);
    await sleep(jitterMs);

    // ── Multi-source cascade with key rotation ──
    console.log(`[Scraper] Starting multi-source fetch for ${brDate}`);
    let rawMatches: any[] | null = null;
    let source = "none";

    // Source 1: RapidAPI with key rotation
    const rapidResult = await fetchFromRapidAPIWithRotation(supabase, brDate);
    if (rapidResult.matches && rapidResult.matches.length > 0) {
      rawMatches = rapidResult.matches;
      source = rapidResult.source;
    }

    // Source 2: ESPN (fallback)
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromESPN(brDate);
      if (rawMatches && rawMatches.length > 0) source = "ESPN-API";
    }

    // Source 3: TheSportsDB (fallback)
    if (!rawMatches || rawMatches.length === 0) {
      rawMatches = await fetchFromTheSportsDB(brDate);
      if (rawMatches && rawMatches.length > 0) source = "TheSportsDB";
    }

    // Source 4: APIFootball.com (fallback)
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

    // ── Resolve team badges ──
    const uniqueTeams = [...new Set(rawMatches.flatMap((m: any) => [m.homeTeamName, m.awayTeamName]))];
    await loadBadgesFromDB(supabase, uniqueTeams);

    const missingTeams = uniqueTeams.filter(t => !logoCache.has(t));
    if (missingTeams.length > 0) {
      console.log(`[Badges] Resolving ${missingTeams.length} missing badges from API...`);
      await Promise.all(missingTeams.map(name => resolveAndCacheBadge(supabase, name)));
    } else {
      console.log(`[Badges] All ${uniqueTeams.length} badges served from DB cache`);
    }

    // ── Atomic upsert into jogos_ativos via DB function (advisory locks) ──
    console.log(`[DB] Upserting ${rawMatches.length} matches via atomic function...`);
    let upsertErrors = 0;
    for (const m of rawMatches) {
      const { error: rpcError } = await supabase.rpc("upsert_jogo_ativo", {
        p_id_partida: m.id_partida,
        p_liga_nome: m.leagueName,
        p_liga_id: m.leagueId || 0,
        p_liga_logo: "",
        p_rodada: m.round || null,
        p_time_casa: m.homeTeamName,
        p_time_fora: m.awayTeamName,
        p_emblema_casa: logoCache.get(m.homeTeamName) || "",
        p_emblema_fora: logoCache.get(m.awayTeamName) || "",
        p_placar_casa: m.homeScore,
        p_placar_fora: m.awayScore,
        p_horario_inicio: m.date,
        p_status: m.status,
        p_elapsed: m.elapsed,
        p_transmissao: getBroadcast(m.leagueName),
        p_data_jogo: brDate,
        p_fonte: source,
      });
      if (rpcError) {
        console.error(`[DB] RPC error for match ${m.id_partida}:`, rpcError.message);
        upsertErrors++;
      }
    }
    console.log(`[DB] Upserted ${rawMatches.length - upsertErrors}/${rawMatches.length} matches (${upsertErrors} errors)`);

    // Also update legacy football_cache
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

    return new Response(JSON.stringify({
      success: true, source, count: rawMatches.length,
      decision: decision.reason, jitter_ms: jitterMs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
