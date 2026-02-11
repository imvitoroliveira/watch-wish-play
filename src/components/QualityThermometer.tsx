import { useState } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Signal } from 'lucide-react';

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

const QualityThermometer = () => {
  const [channels, setChannels] = useState<ChannelVote[]>(() => {
    const saved = localStorage.getItem('msc_quality');
    return saved ? JSON.parse(saved) : defaultChannels;
  });
  const [voted, setVoted] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('msc_voted');
    return new Set(saved ? JSON.parse(saved) : []);
  });

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

            return (
              <motion.div
                key={ch.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl border border-border p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-foreground">{ch.name}</span>
                    <span className={`text-sm font-bold ${
                      pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-accent' : 'text-primary'
                    }`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={`h-full rounded-full ${
                        pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-accent' : 'bg-primary'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => vote(ch.name, 'up')}
                    disabled={hasVoted}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted ? 'opacity-40 cursor-not-allowed' : 'hover:bg-green-500/10'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4 text-green-400" />
                  </button>
                  <button
                    onClick={() => vote(ch.name, 'down')}
                    disabled={hasVoted}
                    className={`p-2 rounded-lg transition-colors ${
                      hasVoted ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/10'
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
