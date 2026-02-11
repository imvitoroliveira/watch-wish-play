// Football API integration for Brazilian leagues
// Uses API-Football (api-football.com) when key is available, falls back to mock data

const API_FOOTBALL_KEY = ''; // Set your API-Football key here (RapidAPI)
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
  date: string; // ISO string
  status: 'NS' | '1H' | 'HT' | '2H' | 'FT' | 'AET' | 'PEN' | 'SUSP' | 'PST' | 'CANC' | 'LIVE';
  elapsed: number | null;
  goals: MatchGoals;
  broadcast: string[];
}

// Brazilian league IDs in API-Football
const LEAGUE_IDS = {
  SERIE_A: 71,
  SERIE_B: 72,
  COPA_DO_BRASIL: 73,
  COPA_NORDESTE: 475,
  FEMININO: 606,
};

const LEAGUE_PRIORITY = [
  LEAGUE_IDS.SERIE_A,
  LEAGUE_IDS.COPA_DO_BRASIL,
  LEAGUE_IDS.SERIE_B,
  LEAGUE_IDS.COPA_NORDESTE,
  LEAGUE_IDS.FEMININO,
];

// Broadcast mapping (common Brazilian TV channels per league)
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

// Fetch today's matches from API-Football
async function fetchFromAPI(): Promise<Match[]> {
  if (!API_FOOTBALL_KEY) return [];

  const today = new Date().toISOString().split('T')[0];
  const allMatches: Match[] = [];

  for (const leagueId of LEAGUE_PRIORITY) {
    try {
      const res = await fetch(
        `${API_BASE}/fixtures?league=${leagueId}&date=${today}&season=2026&timezone=America/Sao_Paulo`,
        {
          headers: {
            'x-apisports-key': API_FOOTBALL_KEY,
          },
        }
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
            status: fixture.fixture.status.short,
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
      console.warn(`Failed to fetch league ${leagueId}:`, e);
    }
  }

  return allMatches;
}

// Generate realistic mock data for demo
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
      { id: 22, name: 'Goiás', logo: 'https://media.api-sports.io/football/teams/1193.png' },
      { id: 23, name: 'Ponte Preta', logo: 'https://media.api-sports.io/football/teams/7752.png' },
    ],
    nordeste: [
      { id: 30, name: 'Bahia', logo: 'https://media.api-sports.io/football/teams/118.png' },
      { id: 31, name: 'Fortaleza', logo: 'https://media.api-sports.io/football/teams/1191.png' },
      { id: 32, name: 'CRB', logo: 'https://media.api-sports.io/football/teams/2317.png' },
      { id: 33, name: 'CSA', logo: 'https://media.api-sports.io/football/teams/2318.png' },
    ],
  };

  const matches: Match[] = [
    // Série A - Live match
    {
      id: 1001,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[0],
      awayTeam: teams.serieA[1],
      date: new Date(now.getTime() - 45 * 60000).toISOString(),
      status: '2H',
      elapsed: 67,
      goals: { home: 2, away: 1 },
      broadcast: ['Premiere', 'Globo'],
    },
    // Série A - Upcoming
    {
      id: 1002,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[2],
      awayTeam: teams.serieA[3],
      date: `${today}T21:30:00-03:00`,
      status: 'NS',
      elapsed: null,
      goals: { home: null, away: null },
      broadcast: ['Premiere', 'SporTV'],
    },
    // Série A - Another
    {
      id: 1003,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[4],
      awayTeam: teams.serieA[5],
      date: `${today}T19:00:00-03:00`,
      status: 'FT',
      elapsed: 90,
      goals: { home: 0, away: 0 },
      broadcast: ['Premiere'],
    },
    // Copa do Brasil
    {
      id: 1004,
      league: { id: LEAGUE_IDS.COPA_DO_BRASIL, name: 'Copa do Brasil', logo: 'https://media.api-sports.io/football/leagues/73.png', round: 'Oitavas de Final' },
      homeTeam: teams.serieA[6],
      awayTeam: teams.serieA[7],
      date: `${today}T20:00:00-03:00`,
      status: '1H',
      elapsed: 23,
      goals: { home: 0, away: 1 },
      broadcast: ['Globo', 'SporTV', 'Amazon Prime'],
    },
    // Série B
    {
      id: 1005,
      league: { id: LEAGUE_IDS.SERIE_B, name: 'Brasileirão Série B', logo: 'https://media.api-sports.io/football/leagues/72.png', round: 'Rodada 8' },
      homeTeam: teams.serieB[0],
      awayTeam: teams.serieB[1],
      date: `${today}T16:00:00-03:00`,
      status: 'FT',
      elapsed: 90,
      goals: { home: 3, away: 2 },
      broadcast: ['Premiere', 'SporTV'],
    },
    // Copa do Nordeste
    {
      id: 1006,
      league: { id: LEAGUE_IDS.COPA_NORDESTE, name: 'Copa do Nordeste', logo: 'https://media.api-sports.io/football/leagues/475.png', round: 'Semifinal' },
      homeTeam: teams.nordeste[0],
      awayTeam: teams.nordeste[1],
      date: `${today}T22:00:00-03:00`,
      status: 'NS',
      elapsed: null,
      goals: { home: null, away: null },
      broadcast: ['SBT', 'ESPN'],
    },
    // Série A extra
    {
      id: 1007,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[8],
      awayTeam: teams.serieA[9],
      date: `${today}T18:30:00-03:00`,
      status: 'HT',
      elapsed: 45,
      goals: { home: 1, away: 1 },
      broadcast: ['Premiere'],
    },
    {
      id: 1008,
      league: { id: LEAGUE_IDS.SERIE_A, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' },
      homeTeam: teams.serieA[10],
      awayTeam: teams.serieA[11],
      date: `${today}T20:30:00-03:00`,
      status: 'NS',
      elapsed: null,
      goals: { home: null, away: null },
      broadcast: ['Premiere', 'Globo'],
    },
  ];

  return matches;
}

export async function getTodayMatches(): Promise<Match[]> {
  const apiMatches = await fetchFromAPI();
  if (apiMatches.length > 0) return sortByPriority(apiMatches);
  return sortByPriority(generateMockMatches());
}

function sortByPriority(matches: Match[]): Match[] {
  return matches.sort((a, b) => {
    // Live matches first
    const aLive = isLive(a.status) ? 0 : 1;
    const bLive = isLive(b.status) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;

    // Then by league priority
    const aPrio = LEAGUE_PRIORITY.indexOf(a.league.id);
    const bPrio = LEAGUE_PRIORITY.indexOf(b.league.id);
    if (aPrio !== bPrio) return aPrio - bPrio;

    // Then by time
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
    // Schedule notification
    scheduleNotification(matchId);
  }
  localStorage.setItem(REMINDERS_KEY, JSON.stringify([...reminders]));
  return new Set(reminders);
}

function scheduleNotification(matchId: number) {
  // Request notification permission
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
    // Fire if within 15 minutes
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
