import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/lib/football-api';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useRealtimeFootball() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Initial load from DB
  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const { data } = await supabase
        .from('football_cache')
        .select('matches')
        .eq('cache_date', brDate)
        .maybeSingle();

      if (data?.matches) {
        setMatches(data.matches as unknown as Match[]);
      }
    } catch (e) {
      console.warn('[Realtime] Initial load failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Subscribe to Realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('football-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'football_cache',
        },
        (payload) => {
          console.log('[Realtime] football_cache updated');
          const newMatches = (payload.new as any)?.matches;
          if (Array.isArray(newMatches)) {
            setMatches(newMatches as Match[]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'football_cache',
        },
        (payload) => {
          console.log('[Realtime] football_cache inserted');
          const newMatches = (payload.new as any)?.matches;
          if (Array.isArray(newMatches)) {
            setMatches(newMatches as Match[]);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { matches, loading, connectionStatus, refresh: loadInitial };
}
