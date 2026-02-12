import { useState, useEffect } from 'react';
import { Film, Flame } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';

interface ChallengeData {
  today: { trailers_watched: number; point_earned: boolean };
  month: { total_points: number; completed: boolean };
}

const CineTrailerChallenge = () => {
  const { currentClient } = useAuth();
  const [data, setData] = useState<ChallengeData | null>(null);

  useEffect(() => {
    if (!currentClient?.u) return;
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trailer-challenge?username=${encodeURIComponent(currentClient.u)}`;
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        if (res.ok) setData(await res.json());
      } catch {
        // silent
      }
    };
    load();
  }, [currentClient?.u]);

  if (!data) return null;

  const progress = (data.month.total_points / 20) * 100;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Film className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Desafio Cine-Trailer</h3>
          <p className="text-[11px] text-muted-foreground">Assista 3 trailers por dia e concorra!</p>
        </div>
      </div>

      {/* Today's progress */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                i < data.today.trailers_watched
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < data.today.trailers_watched ? '✓' : i + 1}
            </div>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {data.today.point_earned ? (
            <span className="text-primary font-medium flex items-center gap-1">
              <Flame className="w-3 h-3" /> +1 ponto hoje!
            </span>
          ) : (
            `${data.today.trailers_watched}/3 trailers hoje`
          )}
        </span>
      </div>

      {/* Monthly progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Meta mensal</span>
          <span className="font-medium text-foreground">{data.month.total_points}/20 pontos</span>
        </div>
        <Progress value={progress} className="h-2" />
        {data.month.completed && (
          <p className="text-xs text-primary font-medium mt-1">
            🎉 Desafio completo! Você está concorrendo à mensalidade grátis!
          </p>
        )}
      </div>
    </div>
  );
};

export default CineTrailerChallenge;
