// Football API integration for Brazilian + South American leagues
// Uses API-Football (api-football.com / api-sports.io) — free plan: 100 req/day, all leagues

const API_FOOTBALL_KEY = ''; // User must add their API-Football key (from dashboard.api-football.com)
const API_BASE = 'https://v3.football.api-sports.io';

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

// API-Football league IDs
const LEAGUE_IDS = {
  // Nacionais
  SERIE_A: 71,
  SERIE_B: 72,
  SERIE_C: 75,
  COPA_DO_BRASIL: 73,
  COPA_NORDESTE: 475,
  FEMININO: 606,
  SUPERCOPA: 625,
  // Estaduais
  CARIOCA: 352,
  PAULISTA: 480,
  // Internacionais / Continental
  LIBERTADORES: 13,
  SULAMERICANA: 11,
  RECOPA_SULAMERICANA: 535,
  // Seleções
  ELIMINATORIAS: 34,
  AMISTOSOS: 10,
};

const LEAGUE_PRIORITY = [
  LEAGUE_IDS.ELIMINATORIAS,
  LEAGUE_IDS.LIBERTADORES,
  LEAGUE_IDS.SULAMERICANA,
  LEAGUE_IDS.RECOPA_SULAMERICANA,
  LEAGUE_IDS.SERIE_A,
  LEAGUE_IDS.COPA_DO_BRASIL,
  LEAGUE_IDS.SERIE_B,
  LEAGUE_IDS.CARIOCA,
  LEAGUE_IDS.PAULISTA,
  LEAGUE_IDS.COPA_NORDESTE,
  LEAGUE_IDS.FEMININO,
  LEAGUE_IDS.SUPERCOPA,
  LEAGUE_IDS.SERIE_C,
  LEAGUE_IDS.AMISTOSOS,
];

const BROADCAST_MAP: Record<number, string[]> = {
  [LEAGUE_IDS.SERIE_A]: ['Premiere', 'Globo', 'SporTV'],
  [LEAGUE_IDS.SERIE_B]: ['Premiere', 'SporTV', 'TV Brasil'],
  [LEAGUE_IDS.SERIE_C]: ['DAZN', 'NSports'],
  [LEAGUE_IDS.COPA_DO_BRASIL]: ['Premiere', 'Globo', 'SporTV', 'Amazon Prime'],
  [LEAGUE_IDS.COPA_NORDESTE]: ['SBT', 'ESPN', 'SporTV'],
  [LEAGUE_IDS.FEMININO]: ['SporTV', 'Globo', 'TV Brasil'],
  [LEAGUE_IDS.SUPERCOPA]: ['Globo', 'SporTV'],
  [LEAGUE_IDS.CARIOCA]: ['Band', 'SporTV', 'Premiere'],
  [LEAGUE_IDS.PAULISTA]: ['Record', 'CazéTV', 'Premiere'],
  [LEAGUE_IDS.LIBERTADORES]: ['Paramount+', 'SBT', 'ESPN'],
  [LEAGUE_IDS.SULAMERICANA]: ['Paramount+', 'SBT', 'ESPN'],
  [LEAGUE_IDS.RECOPA_SULAMERICANA]: ['ESPN', 'SBT'],
  [LEAGUE_IDS.ELIMINATORIAS]: ['Globo', 'SporTV', 'CazéTV'],
  [LEAGUE_IDS.AMISTOSOS]: ['Globo', 'SporTV', 'ESPN'],
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

// Fetch today's matches from API-Football
async function fetchFromAPI(): Promise<Match[]> {
  if (!API_FOOTBALL_KEY) return [];

  const today = new Date().toISOString().split('T')[0];
  const allMatches: Match[] = [];
  const leagueIds = Object.values(LEAGUE_IDS);

  // Batch: fetch all leagues in parallel (each league = 1 request)
  const fetches = leagueIds.map(async (leagueId) => {
    try {
      const res = await fetch(
        `${API_BASE}/fixtures?league=${leagueId}&date=${today}&season=2026&timezone=America/Sao_Paulo`,
        { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
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
            status: fixture.fixture.status.short as Match['status'],
            elapsed: fixture.fixture.status.elapsed,
            goals: {
              home: fixture.goals.home,
              away: fixture.goals.away,
            },
            broadcast: BROADCAST_MAP[leagueId] || ['Premiere'],
          });
        }
      }
    } catch (e) {
      console.warn(`[Football API] Failed to fetch league ${leagueId}:`, e);
    }
  });

  await Promise.all(fetches);
  console.log(`[Football API] Loaded ${allMatches.length} fixtures from API-Football`);
  return allMatches;
}

// Generate mock data for demo (fallback when no API key)
function generateMockMatches(): Match[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const teams = {
    serieA: [
      { id: 127, name: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/127.png' },
      { id: 121, name: 'Palmeiras', logo: 'https://media.api-sports.io/football/teams/121.png' },
      { id: 131, name: 'Corinthians', logo: 'https://media.api-sports.io/football/teams/131.png' },
      { id: 126, name: 'São Paulo', logo: 'https://media.api-sports.io/football/teams/126.png' },
      { id: 124, name: 'Fluminense', logo: 'https://media.api-sports.io/football/teams/124.png' },
      { id: 128, name: 'Botafogo', logo: 'https://media.api-sports.io/football/teams/128.png' },
      { id: 133, name: 'Vasco', logo: 'https://media.api-sports.io/football/teams/133.png' },
      { id: 130, name: 'Grêmio', logo: 'https://media.api-sports.io/football/teams/130.png' },
      { id: 119, name: 'Internacional', logo: 'https://media.api-sports.io/football/teams/119.png' },
      { id: 1062, name: 'Atlético-MG', logo: 'https://media.api-sports.io/football/teams/1062.png' },
    ],
    libertadores: [
      { id: 1020, name: 'River Plate', logo: 'https://media.api-sports.io/football/teams/1020.png' },
      { id: 451, name: 'Boca Juniors', logo: 'https://media.api-sports.io/football/teams/451.png' },
    ],
    selecoes: [
      { id: 6, name: 'Brasil', logo: 'https://media.api-sports.io/football/teams/6.png' },
      { id: 26, name: 'Argentina', logo: 'https://media.api-sports.io/football/teams/26.png' },
    ],
  };

  return [
    // Série A — Ao Vivo
    {
      id: 1001,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[0], awayTeam: teams.serieA[1],
      date: new Date(now.getTime() - 45 * 60000).toISOString(),
      status: '2H', elapsed: 67, goals: { home: 2, away: 1 },
      broadcast: ['Premiere', 'Globo'],
    },
    // Série A — A iniciar
    {
      id: 1002,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[2], awayTeam: teams.serieA[3],
      date: `${today}T21:30:00-03:00`,
      status: 'NS', elapsed: null, goals: { home: null, away: null },
      broadcast: ['Premiere', 'SporTV'],
    },
    // Copa Libertadores — Ao Vivo
    {
      id: 1010,
      league: { id: LEAGUE_IDS.LIBERTADORES, name: 'Copa Libertadores', logo: 'https://media.api-sports.io/football/leagues/13.png', round: 'Fase de Grupos - 4' },
      homeTeam: teams.serieA[0], awayTeam: teams.libertadores[0],
      date: new Date(now.getTime() - 30 * 60000).toISOString(),
      status: '1H', elapsed: 30, goals: { home: 1, away: 0 },
      broadcast: ['Paramount+', 'SBT'],
    },
    // Copa Sul-Americana
    {
      id: 1011,
      league: { id: LEAGUE_IDS.SULAMERICANA, name: 'Copa Sul-Americana', logo: 'https://media.api-sports.io/football/leagues/11.png', round: 'Fase de Grupos - 3' },
      homeTeam: teams.serieA[4], awayTeam: teams.libertadores[1],
      date: `${today}T19:15:00-03:00`,
      status: 'FT', elapsed: 90, goals: { home: 2, away: 2 },
      broadcast: ['Paramount+', 'ESPN'],
    },
    // Eliminatórias
    {
      id: 1020,
      league: { id: LEAGUE_IDS.ELIMINATORIAS, name: 'Eliminatórias Copa do Mundo', logo: 'https://media.api-sports.io/football/leagues/34.png', round: 'Rodada 14' },
      homeTeam: teams.selecoes[0], awayTeam: teams.selecoes[1],
      date: `${today}T21:45:00-03:00`,
      status: 'NS', elapsed: null, goals: { home: null, away: null },
      broadcast: ['Globo', 'SporTV', 'CazéTV'],
    },
    // Copa do Brasil
    {
      id: 1004,
      league: { id: LEAGUE_IDS.COPA_DO_BRASIL, name: 'Copa do Brasil', logo: 'https://media.api-sports.io/football/leagues/73.png', round: 'Oitavas de Final' },
      homeTeam: teams.serieA[6], awayTeam: teams.serieA[7],
      date: `${today}T20:00:00-03:00`,
      status: 'HT', elapsed: 45, goals: { home: 0, away: 1 },
      broadcast: ['Globo', 'SporTV', 'Amazon Prime'],
    },
    // Paulista
    {
      id: 1030,
      league: { id: LEAGUE_IDS.PAULISTA, name: 'Campeonato Paulista', logo: 'https://media.api-sports.io/football/leagues/480.png', round: 'Rodada 10' },
      homeTeam: teams.serieA[2], awayTeam: teams.serieA[1],
      date: `${today}T16:00:00-03:00`,
      status: 'FT', elapsed: 90, goals: { home: 1, away: 3 },
      broadcast: ['Record', 'CazéTV'],
    },
    // Carioca
    {
      id: 1031,
      league: { id: LEAGUE_IDS.CARIOCA, name: 'Campeonato Carioca', logo: 'https://media.api-sports.io/football/leagues/352.png', round: 'Rodada 8' },
      homeTeam: teams.serieA[0], awayTeam: teams.serieA[6],
      date: `${today}T18:00:00-03:00`,
      status: 'FT', elapsed: 90, goals: { home: 3, away: 0 },
      broadcast: ['Band', 'SporTV'],
    },
    // Amistosos
    {
      id: 1040,
      league: { id: LEAGUE_IDS.AMISTOSOS, name: 'Amistosos Internacionais', logo: 'https://media.api-sports.io/football/leagues/10.png' },
      homeTeam: teams.selecoes[0], awayTeam: { id: 16, name: 'Uruguai', logo: 'https://media.api-sports.io/football/teams/16.png' },
      date: `${today}T20:00:00-03:00`,
      status: 'NS', elapsed: null, goals: { home: null, away: null },
      broadcast: ['Globo', 'SporTV'],
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
    if (aPrio !== bPrio) return (aPrio === -1 ? 99 : aPrio) - (bPrio === -1 ? 99 : bPrio);

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
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
  localStorage.setItem(REMINDERS_KEY, JSON.stringify([...reminders]));
  return new Set(reminders);
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
