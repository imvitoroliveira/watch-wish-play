import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Package, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { searchMovies, TMDBMovie, tmdbImg } from '@/lib/tmdb';
import { Skeleton } from '@/components/ui/skeleton';

interface M3UUpdate {
  id: string;
  new_titles: string[];
  total_new: number;
  previous_count: number;
  current_count: number;
  updated_at: string;
}

const POSTER_CACHE = new Map<string, TMDBMovie[]>();

const TitlePosterGrid = ({ titles }: { titles: string[] }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cacheKey = titles.slice(0, 20).join('|');
    if (POSTER_CACHE.has(cacheKey)) {
      setMovies(POSTER_CACHE.get(cacheKey)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchPosters = async () => {
      const sampled = titles.slice(0, 20);
      const results: TMDBMovie[] = [];
      const seen = new Set<number>();

      // Search in small batches to avoid hammering the API
      for (let i = 0; i < sampled.length; i += 5) {
        const batch = sampled.slice(i, i + 5);
        const promises = batch.map(t => searchMovies(t).then(r => r[0]).catch(() => null));
        const found = await Promise.all(promises);
        for (const m of found) {
          if (m && !seen.has(m.id) && m.poster_path) {
            seen.add(m.id);
            results.push(m);
          }
        }
        if (cancelled) return;
      }

      if (!cancelled) {
        POSTER_CACHE.set(cacheKey, results);
        setMovies(results);
        setLoading(false);
      }
    };

    fetchPosters();
    return () => { cancelled = true; };
  }, [titles]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
        ))}
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
        {titles.map((title, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-secondary/50 text-sm text-foreground"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <span className="truncate">{title}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
      {movies.map((movie) => (
        <motion.div
          key={movie.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-lg overflow-hidden bg-secondary/30 group"
        >
          <img
            src={tmdbImg(movie.poster_path, 'w200')}
            alt={movie.title || movie.name || ''}
            className="w-full aspect-[2/3] object-cover"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6">
            <p className="text-[10px] sm:text-xs text-white font-medium leading-tight truncate">
              {movie.title || movie.name}
            </p>
          </div>
        </motion.div>
      ))}
      {titles.length > movies.length && (
        <div className="aspect-[2/3] rounded-lg bg-secondary/50 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center px-2">
            +{titles.length - movies.length} títulos
          </p>
        </div>
      )}
    </div>
  );
};

const CatalogUpdates = () => {
  const [updates, setUpdates] = useState<M3UUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('m3u_updates')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(15);
      if (data) setUpdates(data as unknown as M3UUpdate[]);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">Nenhuma atualização registrada ainda</p>
        <p className="text-sm mt-1">As atualizações do catálogo aparecerão aqui automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Últimas Atualizações do Catálogo</h3>
      </div>

      {updates.map((update, idx) => {
        const isExpanded = expandedId === update.id;
        const date = new Date(update.updated_at);
        const titles = update.new_titles || [];

        return (
          <motion.div
            key={update.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : update.id)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        +{update.total_new} novo{update.total_new !== 1 ? 's' : ''} título{update.total_new !== 1 ? 's' : ''}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        {format(date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <CardContent className="pt-2 px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                      <TitlePosterGrid titles={titles} />
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};

export default CatalogUpdates;
