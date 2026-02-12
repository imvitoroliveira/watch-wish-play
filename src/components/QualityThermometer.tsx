import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Signal, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useChannelStatus } from '@/hooks/useChannelStatus';

interface CanalStatus {
  id: string;
  channel_name: string;
  channel_group: string;
  votes_up: number;
  votes_down: number;
}

const QualityThermometer = () => {
  const [channels, setChannels] = useState<CanalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [voted, setVoted] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('msc_voted_db');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  const { channels: monitored } = useChannelStatus();

  const fetchChannels = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('canal_status')
        .select('*')
        .order('votes_up', { ascending: false });

      if (err) throw err;
      setChannels((data as unknown as CanalStatus[]) || []);
    } catch (e: any) {
      console.error('[Quality] Failed to fetch:', e);
      setError('Erro ao carregar canais. Verifique a conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Seed channels if empty
  const seedChannels = useCallback(async () => {
    try {
      setLoading(true);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/channel-votes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'seed' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchChannels();
    } catch (e: any) {
      setError('Erro ao carregar canais do M3U: ' + (e.message || ''));
      setLoading(false);
    }
  }, [fetchChannels]);

  useEffect(() => {
    fetchChannels().then(() => {
      // If no channels, try seeding from M3U
      setChannels(prev => {
        if (prev.length === 0) seedChannels();
        return prev;
      });
    });
  }, [fetchChannels, seedChannels]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('canal_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'canal_status' },
        () => {
          fetchChannels();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchChannels]);

  const vote = async (channelName: string, type: 'up' | 'down') => {
    if (voted.has(channelName) || voting) return;

    setVoting(channelName);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/channel-votes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'vote', channel_name: channelName, vote_type: type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Optimistic update
      setChannels(prev => prev.map(c => {
        if (c.channel_name === channelName) {
          return { ...c, [type === 'up' ? 'votes_up' : 'votes_down']: (type === 'up' ? c.votes_up : c.votes_down) + 1 };
        }
        return c;
      }));

      const newVoted = new Set(voted);
      newVoted.add(channelName);
      setVoted(newVoted);
      localStorage.setItem('msc_voted_db', JSON.stringify([...newVoted]));
    } catch (e) {
      console.error('[Quality] Vote failed:', e);
    } finally {
      setVoting(null);
    }
  };

  // Find monitor status for a channel
  const isOffline = (name: string) => {
    const lower = name.toLowerCase();
    return monitored.some(m =>
      m.status !== 'online' &&
      (m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()))
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Carregando canais do M3U...</p>
      </div>
    );
  }

  if (error && channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-destructive text-sm text-center">{error}</p>
        <button
          onClick={seedChannels}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <Signal className="w-6 h-6 inline mr-2 text-green-400" />
          TERMÓMETRO DE QUALIDADE
        </h2>
        <p className="text-muted-foreground text-sm">
          Vote na estabilidade dos canais em tempo real
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          {channels.length} canais monitorados • votos em tempo real
        </p>
      </div>

      <div className="grid gap-3">
        {channels
          .sort((a, b) => {
            const aTotal = a.votes_up + a.votes_down;
            const bTotal = b.votes_up + b.votes_down;
            const aScore = aTotal > 0 ? (a.votes_up / aTotal) * 100 : 50;
            const bScore = bTotal > 0 ? (b.votes_up / bTotal) * 100 : 50;
            return bScore - aScore;
          })
          .map((ch, i) => {
            const total = ch.votes_up + ch.votes_down;
            const pct = total > 0 ? Math.round((ch.votes_up / total) * 100) : 0;
            const hasVoted = voted.has(ch.channel_name);
            const offline = isOffline(ch.channel_name);
            const isLowQuality = pct < 50 && total > 0;

            return (
              <motion.div
                key={ch.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-xl border p-4 flex items-center justify-between ${
                  offline
                    ? 'bg-red-950/30 border-red-500/40'
                    : isLowQuality
                    ? 'bg-yellow-950/20 border-yellow-500/30'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-medium text-foreground text-sm truncate">{ch.channel_name}</span>
                    <span className="text-[10px] text-muted-foreground/50 bg-secondary px-1.5 py-0.5 rounded">
                      {ch.channel_group}
                    </span>
                    {offline ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Em Manutenção
                      </span>
                    ) : isLowQuality ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Instável
                      </span>
                    ) : total > 0 ? (
                      <span className={`text-sm font-bold ${
                        pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-accent' : 'text-primary'
                      }`}>
                        {pct}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">sem votos</span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: total > 0 ? `${pct}%` : '0%' }}
                      transition={{ duration: 0.8, delay: i * 0.03 }}
                      className={`h-full rounded-full ${
                        offline
                          ? 'bg-red-500'
                          : pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-accent' : pct >= 50 ? 'bg-primary' : 'bg-yellow-500'
                      }`}
                    />
                  </div>
                  {total > 0 && (
                    <p className="text-[10px] text-muted-foreground/40 mt-1">
                      👍 {ch.votes_up} • 👎 {ch.votes_down}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <button
                    onClick={() => vote(ch.channel_name, 'up')}
                    disabled={hasVoted || !!voting || offline}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted || offline ? 'opacity-40 cursor-not-allowed' : 'hover:bg-green-500/10'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4 text-green-400" />
                  </button>
                  <button
                    onClick={() => vote(ch.channel_name, 'down')}
                    disabled={hasVoted || !!voting || offline}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted || offline ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/10'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4 text-primary" />
                  </button>
                </div>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
};

export default QualityThermometer;
