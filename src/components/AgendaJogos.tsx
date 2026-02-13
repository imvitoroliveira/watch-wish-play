import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Tv, Clock, Trophy, RefreshCw } from 'lucide-react';
import { Match, getTodayMatches, isLive, getStatusLabel } from '@/lib/football-api';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const AgendaJogos = () => {
  const { currentClient } = useAuth();
  const queryClient = useQueryClient();
  const [reminders, setReminders] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<string>('all');

  // Silent refresh with React Query
  const { data: matches = [], isLoading: initialLoading, dataUpdatedAt } = useQuery({
    queryKey: ['footballMatches'],
    queryFn: getTodayMatches,
    staleTime: 2 * 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as Match[] | undefined;
      const hasLive = data?.some(m => isLive(m.status));
      return hasLive ? 2 * 60 * 1000 : 10 * 60 * 1000;
    },
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: true,
  });

  // Halftime intelligence: if any match is HT for >20min, force refetch
  useEffect(() => {
    if (!matches.length) return;
    const check = setInterval(() => {
      const now = Date.now();
      const staleHalftime = matches.some(m => {
        if (m.status !== 'HT') return false;
        // If data hasn't updated in 20min and match is still HT, force refresh
        return (now - dataUpdatedAt) > 20 * 60 * 1000;
      });
      if (staleHalftime) {
        queryClient.invalidateQueries({ queryKey: ['footballMatches'] });
      }
    }, 60 * 1000);
    return () => clearInterval(check);
  }, [matches, dataUpdatedAt, queryClient]);

  // Load reminders from DB
  useEffect(() => {
    if (!currentClient?.u) return;
    const loadReminders = async () => {
      try {
        const { data } = await supabase.functions.invoke('match-reminders', {
          method: 'POST',
          body: { username: currentClient.u, action: 'list' },
        });
        if (data?.reminders) setReminders(new Set(data.reminders));
      } catch {
        // silent
      }
    };
    loadReminders();
  }, [currentClient?.u]);

  const handleToggleReminder = async (match: Match) => {
    if (!currentClient?.u) return;
    try {
      const { data } = await supabase.functions.invoke('match-reminders', {
        method: 'POST',
        body: {
          username: currentClient.u,
          action: 'toggle',
          match_id: match.id,
          match_date: match.date,
          home_team: match.homeTeam.name,
          away_team: match.awayTeam.name,
          league_name: match.league.name,
        },
      });
      if (data) {
        setReminders(prev => {
          const next = new Set(prev);
          if (data.active) next.add(match.id);
          else next.delete(match.id);
          return next;
        });
      }
    } catch {
      // silent
    }
  };

  const leagues = useMemo(() => [...new Set(matches.map(m => m.league.name))], [matches]);

  const filteredMatches = filter === 'all'
    ? matches
    : filter === 'live'
      ? matches.filter(m => isLive(m.status))
      : matches.filter(m => m.league.name === filter);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Only show skeleton on first ever load, never again
  const showSkeleton = initialLoading && matches.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            AGENDA DE JOGOS VIP
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Jogos de hoje • Brasil & Europa</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 pb-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</FilterChip>
        <FilterChip active={filter === 'live'} onClick={() => setFilter('live')}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Ao Vivo
        </FilterChip>
        {leagues.map(l => (
          <FilterChip key={l} active={filter === l} onClick={() => setFilter(l)}>{l}</FilterChip>
        ))}
      </div>

      {showSkeleton ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card animate-pulse h-36" />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {filter === 'live' ? 'Nenhum jogo ao vivo no momento.' : 'Nenhum jogo encontrado hoje.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {filteredMatches.map((match, i) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <MatchCard
                  match={match}
                  hasReminder={reminders.has(match.id)}
                  onToggleReminder={() => handleToggleReminder(match)}
                  formatTime={formatTime}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card border border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function MatchCard({
  match,
  hasReminder,
  onToggleReminder,
  formatTime,
}: {
  match: Match;
  hasReminder: boolean;
  onToggleReminder: () => void;
  formatTime: (d: string) => string;
}) {
  const live = isLive(match.status);
  const finished = match.status === 'FT' || match.status === 'AET' || match.status === 'PEN';
  const upcoming = match.status === 'NS';

  return (
    <div className={`relative rounded-xl border overflow-hidden transition-all ${
      live
        ? 'border-primary/50 bg-gradient-to-r from-primary/5 via-card to-primary/5 shadow-lg shadow-primary/10'
        : 'border-border bg-card hover:border-border/80'
    }`}>
      {/* League header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/50">
        <div className="flex items-center gap-2">
          <img
            src={match.league.logo}
            alt={match.league.name}
            className="w-4 h-4 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-xs font-medium text-muted-foreground">{match.league.name}</span>
          {match.league.round && (
            <span className="text-xs text-muted-foreground/60">• {match.league.round}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Ao Vivo {match.elapsed ? `• ${match.elapsed}'` : ''}
            </span>
          )}
          {finished && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Encerrado</span>
          )}
          {upcoming && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTime(match.date)}
            </span>
          )}
        </div>
      </div>

      {/* Match content */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <img
              src={match.homeTeam.logo}
              alt={match.homeTeam.name}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
            <span className="text-xs sm:text-sm font-medium text-foreground text-center leading-tight">
              {match.homeTeam.name}
            </span>
          </div>

          {/* Score / VS */}
          <div className="flex-shrink-0 mx-4 text-center">
            {(live || finished) ? (
              <div className="flex items-center gap-2">
                <span className={`text-3xl sm:text-4xl font-display ${live ? 'text-primary' : 'text-foreground'}`}>
                  {match.goals.home ?? 0}
                </span>
                <span className="text-lg text-muted-foreground font-light">×</span>
                <span className={`text-3xl sm:text-4xl font-display ${live ? 'text-primary' : 'text-foreground'}`}>
                  {match.goals.away ?? 0}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-display text-muted-foreground">VS</span>
              </div>
            )}
            {live && (
              <span className="text-[10px] text-primary font-medium mt-1 block">
                {getStatusLabel(match.status)}
              </span>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <img
              src={match.awayTeam.logo}
              alt={match.awayTeam.name}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
            <span className="text-xs sm:text-sm font-medium text-foreground text-center leading-tight">
              {match.awayTeam.name}
            </span>
          </div>
        </div>

        {/* Bottom bar: broadcast + reminder */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tv className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {match.broadcast.map(ch => (
              <span
                key={ch}
                className="px-2 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground"
              >
                {ch}
              </span>
            ))}
          </div>

          {upcoming && (
            <button
              onClick={onToggleReminder}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                hasReminder
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {hasReminder ? (
                <><BellRing className="w-3.5 h-3.5" /> Lembrete ativo</>
              ) : (
                <><Bell className="w-3.5 h-3.5" /> Lembrar</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgendaJogos;
