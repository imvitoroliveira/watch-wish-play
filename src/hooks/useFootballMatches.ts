import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/lib/football-api';

async function fetchMatchesFromDB(): Promise<Match[]> {
  const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data, error } = await supabase
    .from('football_cache')
    .select('matches')
    .eq('cache_date', brDate)
    .maybeSingle();

  if (error) {
    console.error('[Football] DB query error:', error);
    throw error;
  }
  
  const matches = (data?.matches as unknown as Match[]) || [];
  console.log(`[Football] Fetched ${matches.length} matches from DB, statuses:`, 
    matches.map(m => `${m.homeTeam?.name} ${m.goals?.home}×${m.goals?.away} ${m.awayTeam?.name} [${m.status}]`).join(', ')
  );
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
