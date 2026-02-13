// Football API integration - fetches from edge function with daily cache
import { supabase } from "@/integrations/supabase/client";

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

const LEAGUE_IDS = {
  SERIE_A: 71, SERIE_B: 72,
  COPA_DO_BRASIL: 73, SUPERCOPA: 625,
  LIBERTADORES: 13, SULAMERICANA: 11, RECOPA_SULAMERICANA: 535,
  ELIMINATORIAS: 34, AMISTOSOS: 10,
  LA_LIGA: 140, BUNDESLIGA: 78, SERIE_A_ITALIA: 135, PREMIER_LEAGUE: 39, MLS: 253,
  CHAMPIONS_LEAGUE: 2, COPA_DO_MUNDO: 1, EUROPA_LEAGUE: 3,
};

const LEAGUE_PRIORITY = [
  LEAGUE_IDS.COPA_DO_MUNDO, LEAGUE_IDS.CHAMPIONS_LEAGUE,
  LEAGUE_IDS.ELIMINATORIAS, LEAGUE_IDS.LIBERTADORES, LEAGUE_IDS.SULAMERICANA,
  LEAGUE_IDS.RECOPA_SULAMERICANA, LEAGUE_IDS.SERIE_A, LEAGUE_IDS.COPA_DO_BRASIL,
  LEAGUE_IDS.PREMIER_LEAGUE, LEAGUE_IDS.LA_LIGA, LEAGUE_IDS.BUNDESLIGA, LEAGUE_IDS.SERIE_A_ITALIA,
  LEAGUE_IDS.EUROPA_LEAGUE, LEAGUE_IDS.MLS, LEAGUE_IDS.SUPERCOPA,
  LEAGUE_IDS.SERIE_B, LEAGUE_IDS.AMISTOSOS,
];

export function getStatusLabel(status: Match['status']): string {
  const map: Record<string, string> = {
    NS: 'A iniciar', '1H': '1º Tempo', HT: 'Intervalo', '2H': '2º Tempo',
    FT: 'Encerrado', AET: 'Prorrogação', PEN: 'Pênaltis',
    SUSP: 'Suspenso', PST: 'Adiado', CANC: 'Cancelado', LIVE: 'Ao Vivo',
  };
  return map[status] || status;
}

export function isLive(status: Match['status']): boolean {
  return ['1H', 'HT', '2H', 'AET', 'PEN', 'LIVE'].includes(status);
}

// Mock data fallback
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
    { id: 1001, league: { id: 71, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' }, homeTeam: teams.serieA[0], awayTeam: teams.serieA[1], date: new Date(now.getTime() - 45 * 60000).toISOString(), status: '2H', elapsed: 67, goals: { home: 2, away: 1 }, broadcast: ['Premiere', 'Globo'] },
    { id: 1002, league: { id: 71, name: 'Brasileirão Série A', logo: 'https://media.api-sports.io/football/leagues/71.png', round: 'Rodada 5' }, homeTeam: teams.serieA[2], awayTeam: teams.serieA[3], date: `${today}T21:30:00-03:00`, status: 'NS', elapsed: null, goals: { home: null, away: null }, broadcast: ['Premiere', 'SporTV'] },
    { id: 1010, league: { id: 13, name: 'Copa Libertadores', logo: 'https://media.api-sports.io/football/leagues/13.png', round: 'Fase de Grupos - 4' }, homeTeam: teams.serieA[0], awayTeam: teams.libertadores[0], date: new Date(now.getTime() - 30 * 60000).toISOString(), status: '1H', elapsed: 30, goals: { home: 1, away: 0 }, broadcast: ['Paramount+', 'SBT'] },
    { id: 1011, league: { id: 11, name: 'Copa Sul-Americana', logo: 'https://media.api-sports.io/football/leagues/11.png', round: 'Fase de Grupos - 3' }, homeTeam: teams.serieA[4], awayTeam: teams.libertadores[1], date: `${today}T19:15:00-03:00`, status: 'FT', elapsed: 90, goals: { home: 2, away: 2 }, broadcast: ['Paramount+', 'ESPN'] },
    { id: 1020, league: { id: 34, name: 'Eliminatórias Copa do Mundo', logo: 'https://media.api-sports.io/football/leagues/34.png', round: 'Rodada 14' }, homeTeam: teams.selecoes[0], awayTeam: teams.selecoes[1], date: `${today}T21:45:00-03:00`, status: 'NS', elapsed: null, goals: { home: null, away: null }, broadcast: ['Globo', 'SporTV', 'CazéTV'] },
    { id: 1004, league: { id: 73, name: 'Copa do Brasil', logo: 'https://media.api-sports.io/football/leagues/73.png', round: 'Oitavas de Final' }, homeTeam: teams.serieA[6], awayTeam: teams.serieA[7], date: `${today}T20:00:00-03:00`, status: 'HT', elapsed: 45, goals: { home: 0, away: 1 }, broadcast: ['Globo', 'SporTV', 'Amazon Prime'] },
    { id: 1030, league: { id: 480, name: 'Campeonato Paulista', logo: 'https://media.api-sports.io/football/leagues/480.png', round: 'Rodada 10' }, homeTeam: teams.serieA[2], awayTeam: teams.serieA[1], date: `${today}T16:00:00-03:00`, status: 'FT', elapsed: 90, goals: { home: 1, away: 3 }, broadcast: ['Record', 'CazéTV'] },
    { id: 1031, league: { id: 352, name: 'Campeonato Carioca', logo: 'https://media.api-sports.io/football/leagues/352.png', round: 'Rodada 8' }, homeTeam: teams.serieA[0], awayTeam: teams.serieA[6], date: `${today}T18:00:00-03:00`, status: 'FT', elapsed: 90, goals: { home: 3, away: 0 }, broadcast: ['Band', 'SporTV'] },
  ];
}

export async function getTodayMatches(): Promise<Match[]> {
  try {
    const { data, error } = await supabase.functions.invoke('football-matches');
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) {
      return sortByPriority(data as Match[]);
    }
  } catch (e) {
    console.warn('[Football] Edge function failed, using mock data:', e);
  }
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
  if (reminders.has(matchId)) reminders.delete(matchId);
  else reminders.add(matchId);
  localStorage.setItem(REMINDERS_KEY, JSON.stringify([...reminders]));
  return new Set(reminders);
}

export function checkAndFireReminders(matches: Match[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reminders = getReminders();
  const now = Date.now();
  matches.forEach(match => {
    if (!reminders.has(match.id)) return;
    const diff = new Date(match.date).getTime() - now;
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
