import { useState } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Signal, AlertTriangle, Loader2 } from 'lucide-react';
import { useChannelStatus, ChannelStatus } from '@/hooks/useChannelStatus';

interface ChannelVote {
  name: string;
  up: number;
  down: number;
}

const defaultChannels: ChannelVote[] = [
  { name: 'Premiere 4K', up: 45, down: 3 },
  { name: 'ESPN HD', up: 38, down: 5 },
  { name: 'HBO Max', up: 52, down: 2 },
  { name: 'Globo HD', up: 40, down: 8 },
  { name: 'TNT HD', up: 35, down: 4 },
  { name: 'Discovery 4K', up: 28, down: 1 },
];

/** Check if a monitored channel matches a thermometer channel by fuzzy name */
function findMonitorStatus(name: string, monitored: ChannelStatus[]): ChannelStatus | undefined {
  const lower = name.toLowerCase().replace(/\s*(hd|4k|fhd|uhd|max)\s*/gi, '').trim();
  return monitored.find(m => {
    const mLower = m.name.toLowerCase().replace(/\s*(hd|4k|fhd|uhd|max)\s*/gi, '').trim();
    return mLower.includes(lower) || lower.includes(mLower);
  });
}

const QualityThermometer = () => {
  const [channels, setChannels] = useState<ChannelVote[]>(() => {
    const saved = localStorage.getItem('msc_quality');
    return saved ? JSON.parse(saved) : defaultChannels;
  });
  const [voted, setVoted] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('msc_voted');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  const { channels: monitored, loading: monitorLoading, lastCheck } = useChannelStatus();

  const vote = (name: string, type: 'up' | 'down') => {
    if (voted.has(name)) return;
    const updated = channels.map(c => {
      if (c.name === name) {
        return { ...c, [type === 'up' ? 'up' : 'down']: c[type === 'up' ? 'up' : 'down'] + 1 };
      }
      return c;
    });
    setChannels(updated);
    const newVoted = new Set(voted);
    newVoted.add(name);
    setVoted(newVoted);
    localStorage.setItem('msc_quality', JSON.stringify(updated));
    localStorage.setItem('msc_voted', JSON.stringify([...newVoted]));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <Signal className="w-6 h-6 inline mr-2 text-green-400" />
          TERMÓMETRO DE QUALIDADE
        </h2>
        <p className="text-muted-foreground text-sm">Vote na estabilidade dos canais em tempo real</p>
        {monitorLoading && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Verificando status dos canais...
          </p>
        )}
        {lastCheck && !monitorLoading && (
          <p className="text-xs text-muted-foreground/60 mt-1">
            Última verificação: {new Date(lastCheck).toLocaleTimeString('pt-BR')}
          </p>
        )}
      </div>

      <div className="grid gap-3">
        {channels
          .sort((a, b) => {
            const aScore = a.up / (a.up + a.down) * 100;
            const bScore = b.up / (b.up + b.down) * 100;
            return bScore - aScore;
          })
          .map((ch, i) => {
            const total = ch.up + ch.down;
            const pct = total > 0 ? Math.round((ch.up / total) * 100) : 0;
            const hasVoted = voted.has(ch.name);
            const monitorStatus = findMonitorStatus(ch.name, monitored);
            const isOffline = monitorStatus && monitorStatus.status !== 'online';

            return (
              <motion.div
                key={ch.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl border p-4 flex items-center justify-between ${
                  isOffline
                    ? 'bg-red-950/30 border-red-500/40'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-foreground">{ch.name}</span>
                    {isOffline ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Em Manutenção
                      </span>
                    ) : (
                      <span className={`text-sm font-bold ${
                        pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-accent' : 'text-primary'
                      }`}>
                        {pct}%
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: isOffline ? '100%' : `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={`h-full rounded-full ${
                        isOffline
                          ? 'bg-red-500'
                          : pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-accent' : 'bg-primary'
                      }`}
                    />
                  </div>
                  {isOffline && monitorStatus && (
                    <p className="text-xs text-red-400/70 mt-1">
                      HTTP {monitorStatus.httpCode || 'timeout'} — equipe já está ciente
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => vote(ch.name, 'up')}
                    disabled={hasVoted || !!isOffline}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted || isOffline ? 'opacity-40 cursor-not-allowed' : 'hover:bg-green-500/10'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4 text-green-400" />
                  </button>
                  <button
                    onClick={() => vote(ch.name, 'down')}
                    disabled={hasVoted || !!isOffline}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted || isOffline ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/10'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4 text-primary" />
                  </button>
                </div>
              </motion.div>
            );
          })}
      </div>

      {/* Show additional monitored channels that are offline */}
      {monitored.filter(m => m.status !== 'online' && !channels.some(c => findMonitorStatus(c.name, [m]))).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Outros canais em manutenção
          </h3>
          <div className="grid gap-2">
            {monitored
              .filter(m => m.status !== 'online' && !channels.some(c => findMonitorStatus(c.name, [m])))
              .slice(0, 10)
              .map(m => (
                <div key={m.name} className="bg-red-950/20 border border-red-500/20 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs text-red-400">HTTP {m.httpCode || 'timeout'}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityThermometer;
