// Football API integration for Brazilian leagues
// Uses Sportmonks API (sportmonks.com)

const SPORTMONKS_TOKEN = '6XTAKuADi9YCNeQoxVKpk3xrt1flB2oyvv2ZP4sASNRcflxRLAwk306QC6Ua';
const API_BASE = 'https://api.sportmonks.com/v3/football';

export interface Team {
  id: number;
  name: string;
  logo: string;
}

export interface MatchGoals {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: number;
  league: {
    id: number;
    name: string;
    logo: string;
    round?: string;
  };
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  status: 'NS' | '1H' | 'HT' | '2H' | 'FT' | 'AET' | 'PEN' | 'SUSP' | 'PST' | 'CANC' | 'LIVE';
  elapsed: number | null;
  goals: MatchGoals;
  broadcast: string[];
}

// Brazilian league IDs in Sportmonks
const LEAGUE_IDS = {
  SERIE_A: 462,
  SERIE_B: 463,
  COPA_DO_BRASIL: 475,
  COPA_NORDESTE: 1360,
  FEMININO: 648,
};

const LEAGUE_PRIORITY = [
  LEAGUE_IDS.SERIE_A,
  LEAGUE_IDS.COPA_DO_BRASIL,
  LEAGUE_IDS.SERIE_B,
  LEAGUE_IDS.COPA_NORDESTE,
  LEAGUE_IDS.FEMININO,
];

const BROADCAST_MAP: Record<number, string[]> = {
  [LEAGUE_IDS.SERIE_A]: ['Premiere', 'Globo', 'SporTV'],
  [LEAGUE_IDS.SERIE_B]: ['Premiere', 'SporTV', 'TV Brasil'],
  [LEAGUE_IDS.COPA_DO_BRASIL]: ['Premiere', 'Globo', 'SporTV', 'Amazon Prime'],
  [LEAGUE_IDS.COPA_NORDESTE]: ['SBT', 'ESPN', 'SporTV'],
  [LEAGUE_IDS.FEMININO]: ['SporTV', 'Globo', 'TV Brasil'],
};

function getStatusLabel(status: Match['status']): string {
  const map: Record<string, string> = {
    NS: 'A iniciar',
    '1H': '1º Tempo',
    HT: 'Intervalo',
    '2H': '2º Tempo',
    FT: 'Encerrado',
    AET: 'Prorrogação',
    PEN: 'Pênaltis',
    SUSP: 'Suspenso',
    PST: 'Adiado',
    CANC: 'Cancelado',
    LIVE: 'Ao Vivo',
  };
  return map[status] || status;
}

function isLive(status: Match['status']): boolean {
  return ['1H', 'HT', '2H', 'AET', 'PEN', 'LIVE'].includes(status);
}

// Map Sportmonks state to our status
function mapSportmonksState(stateId: number, stateName: string): Match['status'] {
  // Sportmonks state IDs: 1=NS, 2=INPLAY_1ST, 3=HT, 4=INPLAY_2ND, 5=FT, 6=AET, 7=PEN, etc.
  const stateMap: Record<number, Match['status']> = {
    1: 'NS',    // Not Started
    2: '1H',    // 1st Half
    3: 'HT',    // Half Time
    4: '2H',    // 2nd Half
    5: 'FT',    // Full Time
    6: 'AET',   // After Extra Time
    7: 'PEN',   // Penalties
    8: 'FT',    // FT after penalties
    9: 'SUSP',  // Suspended
    10: 'PST',  // Postponed
    11: 'CANC', // Cancelled
    13: 'LIVE', // Live (generic)
    14: '2H',   // Extra Time
    15: 'PEN',  // Penalty Shootout
    21: 'FT',   // Finished after extra
    22: 'CANC', // Cancelled
  };

  if (stateMap[stateId]) return stateMap[stateId];

  // Fallback: check name
  const lower = stateName?.toLowerCase() || '';
  if (lower.includes('live') || lower.includes('inplay')) return 'LIVE';
  if (lower.includes('finished') || lower.includes('ft')) return 'FT';
  if (lower.includes('half')) return 'HT';
  if (lower.includes('postponed')) return 'PST';
  return 'NS';
}

// Extract current score from Sportmonks scores array
function extractScores(scores: any[]): MatchGoals {
  if (!scores || scores.length === 0) return { home: null, away: null };

  // Find the CURRENT score entry, or fallback to 2ND_HALF, then 1ST_HALF
  const current = scores.find((s: any) => s.description === 'CURRENT')
    || scores.find((s: any) => s.description === '2ND_HALF')
    || scores.find((s: any) => s.description === '1ST_HALF');

  if (!current) return { home: null, away: null };

  return {
    home: current.score?.participant === 'home' ? current.score?.goals : null,
    away: current.score?.participant === 'away' ? current.score?.goals : null,
  };
}

function extractGoalsFromScores(scores: any[]): MatchGoals {
  if (!scores || scores.length === 0) return { home: null, away: null };

  let home: number | null = null;
  let away: number | null = null;

  // Sportmonks scores have participant = 'home' or 'away' with goals count
  for (const s of scores) {
    if (s.description === 'CURRENT' || s.description === '2ND_HALF' || s.description === '1ST_HALF') {
      if (s.score?.participant === 'home') home = s.score?.goals ?? null;
      if (s.score?.participant === 'away') away = s.score?.goals ?? null;
    }
  }

  // If no CURRENT found, try any available
  if (home === null && away === null) {
    for (const s of scores) {
      if (s.score?.participant === 'home' && home === null) home = s.score?.goals ?? null;
      if (s.score?.participant === 'away' && away === null) away = s.score?.goals ?? null;
    }
  }

  return { home, away };
}

// Fetch today's matches from Sportmonks
async function fetchFromAPI(): Promise<Match[]> {
  if (!SPORTMONKS_TOKEN) return [];

  const today = new Date().toISOString().split('T')[0];
  const leagueFilter = Object.values(LEAGUE_IDS).join(',');

  try {
    const url = `${API_BASE}/fixtures/date/${today}?api_token=${SPORTMONKS_TOKEN}&include=participants;scores;league;state&filters=fixtureLeagues:${leagueFilter}&timezone=America/Sao_Paulo`;
    console.log('[Football API] Fetching:', url.replace(SPORTMONKS_TOKEN, '***'));

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.warn('[Football API] Error response:', data);
      return [];
    }

    if (!data.data || !Array.isArray(data.data)) {
      console.log('[Football API] No fixtures found for today');
      return [];
    }

    const matches: Match[] = [];

    for (const fixture of data.data) {
      const participants = fixture.participants || [];
      const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
      const awayTeam = participants.find((p: any) => p.meta?.location === 'away');

      if (!homeTeam || !awayTeam) continue;

      const leagueId = fixture.league_id || fixture.league?.id;
      const leagueName = fixture.league?.name || 'Liga Brasileira';
      const leagueLogo = fixture.league?.image_path || '';

      const stateId = fixture.state_id || 1;
      const stateName = fixture.state?.name || '';
      const status = mapSportmonksState(stateId, stateName);
      const elapsed = fixture.state?.clock?.minute ?? fixture.minute ?? null;

      const goals = extractGoalsFromScores(fixture.scores || []);

      matches.push({
        id: fixture.id,
        league: {
          id: leagueId,
          name: leagueName,
          logo: leagueLogo,
          round: fixture.round?.name || undefined,
        },
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name || homeTeam.short_code || 'Home',
          logo: homeTeam.image_path || '/placeholder.svg',
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name || awayTeam.short_code || 'Away',
          logo: awayTeam.image_path || '/placeholder.svg',
        },
        date: fixture.starting_at || today,
        status,
        elapsed,
        goals,
        broadcast: BROADCAST_MAP[leagueId] || ['Premiere'],
      });
    }

    console.log(`[Football API] Loaded ${matches.length} fixtures from Sportmonks`);
    return matches;
  } catch (e) {
    console.warn('[Football API] Fetch failed:', e);
    return [];
  }
}

// Generate realistic mock data for demo (fallback)
function generateMockMatches(): Match[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const teams = {
    serieA: [
      { id: 1, name: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/127.png' },
      { id: 2, name: 'Palmeiras', logo: 'https://media.api-sports.io/football/teams/121.png' },
      { id: 3, name: 'Corinthians', logo: 'https://media.api-sports.io/football/teams/131.png' },
      { id: 4, name: 'São Paulo', logo: 'https://media.api-sports.io/football/teams/126.png' },
      { id: 5, name: 'Fluminense', logo: 'https://media.api-sports.io/football/teams/124.png' },
      { id: 6, name: 'Botafogo', logo: 'https://media.api-sports.io/football/teams/128.png' },
      { id: 7, name: 'Vasco', logo: 'https://media.api-sports.io/football/teams/133.png' },
      { id: 8, name: 'Grêmio', logo: 'https://media.api-sports.io/football/teams/130.png' },
      { id: 9, name: 'Internacional', logo: 'https://media.api-sports.io/football/teams/119.png' },
      { id: 10, name: 'Atlético-MG', logo: 'https://media.api-sports.io/football/teams/1062.png' },
      { id: 11, name: 'Cruzeiro', logo: 'https://media.api-sports.io/football/teams/120.png' },
      { id: 12, name: 'Santos', logo: 'https://media.api-sports.io/football/teams/132.png' },
    ],
    serieB: [
      { id: 20, name: 'Sport', logo: 'https://media.api-sports.io/football/teams/2624.png' },
      { id: 21, name: 'Ceará', logo: 'https://media.api-sports.io/football/teams/2323.png' },
    ],
    nordeste: [
      { id: 30, name: 'Bahia', logo: 'https://media.api-sports.io/football/teams/118.png' },
      { id: 31, name: 'Fortaleza', logo: 'https://media.api-sports.io/football/teams/1191.png' },
    ],
  };

  return [
    {
      id: 1001,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: '', round: 'Rodada 5' },
      homeTeam: teams.serieA[0], awayTeam: teams.serieA[1],
      date: new Date(now.getTime() - 45 * 60000).toISOString(),
      status: '2H', elapsed: 67, goals: { home: 2, away: 1 },
      broadcast: ['Premiere', 'Globo'],
    },
    {
      id: 1002,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: '', round: 'Rodada 5' },
      homeTeam: teams.serieA[2], awayTeam: teams.serieA[3],
      date: `${today}T21:30:00-03:00`,
      status: 'NS', elapsed: null, goals: { home: null, away: null },
      broadcast: ['Premiere', 'SporTV'],
    },
    {
      id: 1003,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: '', round: 'Rodada 5' },
      homeTeam: teams.serieA[4], awayTeam: teams.serieA[5],
      date: `${today}T19:00:00-03:00`,
      status: 'FT', elapsed: 90, goals: { home: 0, away: 0 },
      broadcast: ['Premiere'],
    },
    {
      id: 1004,
      league: { id: LEAGUE_IDS.COPA_DO_BRASIL, name: 'Copa do Brasil', logo: '', round: 'Oitavas de Final' },
      homeTeam: teams.serieA[6], awayTeam: teams.serieA[7],
      date: `${today}T20:00:00-03:00`,
      status: '1H', elapsed: 23, goals: { home: 0, away: 1 },
      broadcast: ['Globo', 'SporTV', 'Amazon Prime'],
    },
    {
      id: 1005,
      league: { id: LEAGUE_IDS.SERIE_B, name: 'Brasileirão Série B', logo: '', round: 'Rodada 8' },
      homeTeam: teams.serieB[0], awayTeam: teams.serieB[1],
      date: `${today}T16:00:00-03:00`,
      status: 'FT', elapsed: 90, goals: { home: 3, away: 2 },
      broadcast: ['Premiere', 'SporTV'],
    },
    {
      id: 1006,
      league: { id: LEAGUE_IDS.COPA_NORDESTE, name: 'Copa do Nordeste', logo: '', round: 'Semifinal' },
      homeTeam: teams.nordeste[0], awayTeam: teams.nordeste[1],
      date: `${today}T22:00:00-03:00`,
      status: 'NS', elapsed: null, goals: { home: null, away: null },
      broadcast: ['SBT', 'ESPN'],
    },
  ];
}

export async function getTodayMatches(): Promise<Match[]> {
  const apiMatches = await fetchFromAPI();
  if (apiMatches.length > 0) return sortByPriority(apiMatches);
  return sortByPriority(generateMockMatches());
}

function sortByPriority(matches: Match[]): Match[] {
  return matches.sort((a, b) => {
    const aLive = isLive(a.status) ? 0 : 1;
    const bLive = isLive(b.status) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;

    const aPrio = LEAGUE_PRIORITY.indexOf(a.league.id);
    const bPrio = LEAGUE_PRIORITY.indexOf(b.league.id);
    if (aPrio !== bPrio) return aPrio - bPrio;

    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

// Reminder management
const REMINDERS_KEY = 'msc_match_reminders';

export function getReminders(): Set<number> {
  const saved = localStorage.getItem(REMINDERS_KEY);
  return new Set(saved ? JSON.parse(saved) : []);
}

export function toggleReminder(matchId: number): Set<number> {
  const reminders = getReminders();
  if (reminders.has(matchId)) {
    reminders.delete(matchId);
  } else {
    reminders.add(matchId);
    scheduleNotification(matchId);
  }
  localStorage.setItem(REMINDERS_KEY, JSON.stringify([...reminders]));
  return new Set(reminders);
}

function scheduleNotification(matchId: number) {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function checkAndFireReminders(matches: Match[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const reminders = getReminders();
  const now = Date.now();

  matches.forEach(match => {
    if (!reminders.has(match.id)) return;
    const matchTime = new Date(match.date).getTime();
    const diff = matchTime - now;
    if (diff > 0 && diff <= 15 * 60 * 1000) {
      const firedKey = `msc_reminder_fired_${match.id}`;
      if (!localStorage.getItem(firedKey)) {
        new Notification('⚽ Jogo começando em breve!', {
          body: `${match.homeTeam.name} vs ${match.awayTeam.name} - ${match.league.name}`,
          icon: match.homeTeam.logo,
        });
        localStorage.setItem(firedKey, '1');
      }
    }
  });
}

export { isLive, getStatusLabel };
