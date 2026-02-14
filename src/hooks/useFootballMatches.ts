import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/lib/football-api';

async function fetchMatchesFromDB(): Promise<Match[]> {
  const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  console.log(`[Football] Fetching matches for date: ${brDate}`);
  
  const { data, error } = await supabase
    .from('football_cache')
    .select('matches, fetched_at')
    .eq('cache_date', brDate)
    .maybeSingle();

  if (error) {
    console.error('[Football] DB query error:', error);
    throw error;
  }
  
  console.log(`[Football] Cache fetched_at: ${data?.fetched_at}`);
  const matches = (data?.matches as unknown as Match[]) || [];
  
  // Detailed logging per match
  matches.forEach((m, i) => {
    console.log(
      `[Football][${i}] ${m.homeTeam?.name} vs ${m.awayTeam?.name} | ` +
      `Liga: "${m.league?.name}" | Status: ${m.status} | Elapsed: ${m.elapsed} | ` +
      `Placar: ${m.goals?.home ?? '-'}x${m.goals?.away ?? '-'} | ` +
      `Date: ${m.date} | Hora local: ${new Date(m.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    );
  });
  
  console.log(`[Football] Total: ${matches.length} matches`);
  return matches;
}

export function useFootballMatches() {
  return useQuery<Match[]>({
    queryKey: ['football-matches'],
    queryFn: fetchMatchesFromDB,
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });
}
