import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Tv, Clock, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useJogosAtivos, JogoAtivo } from '@/hooks/useJogosAtivos';

const AgendaJogos = () => {
  const { currentClient } = useAuth();
  const { data: jogos = [], isLoading } = useJogosAtivos();
  const [reminders, setReminders] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<string>('all');
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    if (jogos.length > 0) setInitialLoad(false);
  }, [jogos]);

  useEffect(() => {
    if (!currentClient?.u) return;
    const loadReminders = async () => {
      try {
        const { data } = await supabase.functions.invoke('match-reminders', {
          method: 'POST',
          body: { username: currentClient.u, action: 'list' },
        });
        if (data?.reminders) setReminders(new Set(data.reminders));
      } catch { /* silent */ }
    };
    loadReminders();
  }, [currentClient?.u]);

  const handleToggleReminder = async (jogo: JogoAtivo) => {
    if (!currentClient?.u) return;
    try {
      const { data } = await supabase.functions.invoke('match-reminders', {
        method: 'POST',
        body: {
          username: currentClient.u,
          action: 'toggle',
          match_id: jogo.id_partida,
          match_date: jogo.horario_inicio,
          home_team: jogo.time_casa,
          away_team: jogo.time_fora,
          league_name: jogo.liga_nome,
        },
      });
      if (data) {
        setReminders(prev => {
          const next = new Set(prev);
          if (data.active) next.add(jogo.id_partida);
          else next.delete(jogo.id_partida);
          return next;
        });
      }
    } catch { /* silent */ }
  };

  const leagues = [...new Set(jogos.map(j => j.liga_nome))];

  const jogosWithInferred = jogos.map(j => ({ ...j, inferredStatus: inferStatus(j) }));

  const filteredJogos = filter === 'all'
    ? jogosWithInferred
    : filter === 'ao_vivo'
      ? jogosWithInferred.filter(j => j.inferredStatus === 'ao_vivo' || j.inferredStatus === 'intervalo' || j.inferredStatus === 'provavelmente_em_andamento')
      : jogosWithInferred.filter(j => j.liga_nome === filter);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const showLoading = isLoading && initialLoad && jogos.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            AGENDA DE JOGOS VIP
          </h2>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 pb-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</FilterChip>
        <FilterChip active={filter === 'ao_vivo'} onClick={() => setFilter('ao_vivo')}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Ao Vivo
        </FilterChip>
        {leagues.map(l => (
          <FilterChip key={l} active={filter === l} onClick={() => setFilter(l)}>{l}</FilterChip>
        ))}
      </div>

      {showLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredJogos.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {filter === 'ao_vivo' ? 'Nenhum jogo ao vivo no momento.' : 'Nenhum jogo encontrado hoje.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredJogos.map((jogo, i) => (
              <motion.div
                key={jogo.id_partida}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                layout
              >
                <MatchCard
                  jogo={jogo}
                  inferredStatus={jogo.inferredStatus}
                  hasReminder={reminders.has(jogo.id_partida)}
                  onToggleReminder={() => handleToggleReminder(jogo)}
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

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    programado: 'A iniciar',
    ao_vivo: 'Ao Vivo',
    intervalo: 'Intervalo',
    finalizado: 'Encerrado',
    suspenso: 'Suspenso',
    adiado: 'Adiado',
    cancelado: 'Cancelado',
    provavelmente_em_andamento: 'Provável em andamento',
    provavelmente_encerrado: 'Provável encerrado',
  };
  return map[status] || status;
}

/**
 * Infere o status real com base no horário de início quando o backend 
 * não atualizou (ex: Cloud pausado). Só aplica em jogos "programado".
 */
function inferStatus(jogo: JogoAtivo): JogoAtivo['status'] | 'provavelmente_em_andamento' | 'provavelmente_encerrado' {
  if (jogo.status !== 'programado') return jogo.status;
  
  const now = new Date();
  const start = new Date(jogo.horario_inicio);
  const diffMinutes = (now.getTime() - start.getTime()) / 60000;
  
  // Jogo deveria ter começado há mais de 120 min → provavelmente encerrado
  if (diffMinutes >= 120) return 'provavelmente_encerrado';
  // Jogo deveria ter começado há mais de 5 min → provavelmente em andamento
  if (diffMinutes >= 5) return 'provavelmente_em_andamento';
  
  return 'programado';
}

function MatchCard({
  jogo,
  inferredStatus,
  hasReminder,
  onToggleReminder,
  formatTime,
}: {
  jogo: JogoAtivo;
  inferredStatus: string;
  hasReminder: boolean;
  onToggleReminder: () => void;
  formatTime: (d: string) => string;
}) {
  const live = inferredStatus === 'ao_vivo';
  const halftime = inferredStatus === 'intervalo';
  const finished = inferredStatus === 'finalizado' || inferredStatus === 'provavelmente_encerrado';
  const inProgress = inferredStatus === 'provavelmente_em_andamento';
  const upcoming = inferredStatus === 'programado';
  const showScore = live || halftime || finished;
  const showInProgress = inProgress;

  return (
    <div className={`relative rounded-xl border overflow-hidden transition-all ${
      live
        ? 'border-primary/50 bg-gradient-to-r from-primary/5 via-card to-primary/5 shadow-lg shadow-primary/10'
        : halftime
          ? 'border-yellow-500/40 bg-gradient-to-r from-yellow-500/5 via-card to-yellow-500/5'
          : 'border-border bg-card hover:border-border/80'
    }`}>
      {/* League header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/50">
        <div className="flex items-center gap-2">
          {jogo.liga_logo && (
            <img
              src={jogo.liga_logo}
              alt={jogo.liga_nome}
              className="w-4 h-4 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span className="text-xs font-medium text-muted-foreground">{jogo.liga_nome}</span>
          {jogo.rodada && (
            <span className="text-xs text-muted-foreground/60">• {jogo.rodada}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Ao Vivo {jogo.elapsed ? `• ${jogo.elapsed}'` : ''}
            </span>
          )}
          {halftime && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 text-[10px] font-medium uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              Intervalo
            </span>
          )}
          {finished && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Encerrado</span>
          )}
          {upcoming && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTime(jogo.horario_inicio)}
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
              src={jogo.emblema_casa || '/placeholder.svg'}
              alt={jogo.time_casa}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
            <span className="text-xs sm:text-sm font-medium text-foreground text-center leading-tight">
              {jogo.time_casa}
            </span>
          </div>

          {/* Score / VS */}
          <div className="flex-shrink-0 mx-4 text-center">
            {showScore ? (
              <div className="flex items-center gap-2">
                <motion.span
                  key={`home-${jogo.placar_casa}`}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`text-3xl sm:text-4xl font-display ${
                    live ? 'text-foreground' : halftime ? 'text-yellow-400' : 'text-muted-foreground'
                  }`}
                >
                  {jogo.placar_casa ?? 0}
                </motion.span>
                <span className="text-lg text-muted-foreground font-light">×</span>
                <motion.span
                  key={`away-${jogo.placar_fora}`}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`text-3xl sm:text-4xl font-display ${
                    live ? 'text-foreground' : halftime ? 'text-yellow-400' : 'text-muted-foreground'
                  }`}
                >
                  {jogo.placar_fora ?? 0}
                </motion.span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-display text-muted-foreground">VS</span>
              </div>
            )}
            {halftime && (
              <span className="text-[10px] text-yellow-500 font-medium mt-1 block">
                Intervalo
              </span>
            )}
            {live && (
              <span className="text-[10px] text-primary font-medium mt-1 block">
                {getStatusLabel(jogo.status)}
              </span>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <img
              src={jogo.emblema_fora || '/placeholder.svg'}
              alt={jogo.time_fora}
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
            <span className="text-xs sm:text-sm font-medium text-foreground text-center leading-tight">
              {jogo.time_fora}
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tv className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {jogo.transmissao.map(ch => (
              <span key={ch} className="px-2 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
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
