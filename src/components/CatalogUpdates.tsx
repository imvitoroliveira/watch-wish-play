import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Package, Clock, ChevronDown, ChevronUp, Film } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { searchMovies, tmdbImg, TMDBMovie } from '@/lib/tmdb';

interface M3UUpdate {
  id: string;
  new_titles: string[];
  total_new: number;
  previous_count: number;
  current_count: number;
  updated_at: string;
}

// Mark updates as seen
export function markUpdatesSeen() {
  localStorage.setItem('catalog_updates_last_seen', new Date().toISOString());
}

// Check if there are unseen updates
export function getLastSeenDate(): string | null {
  return localStorage.getItem('catalog_updates_last_seen');
}

const POSTER_CACHE_KEY = 'catalog_poster_cache';
const POSTER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getPosterCache(): Record<string, { poster: string | null; ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(POSTER_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function setPosterCache(cache: Record<string, { poster: string | null; ts: number }>) {
  // Keep max 200 entries
  const entries = Object.entries(cache);
  if (entries.length > 200) {
    entries.sort((a, b) => b[1].ts - a[1].ts);
    cache = Object.fromEntries(entries.slice(0, 200));
  }
  localStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(cache));
}

const CatalogUpdates = () => {
  const [updates, setUpdates] = useState<M3UUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [posterMap, setPosterMap] = useState<Record<string, string | null>>({});
  const [loadingPosters, setLoadingPosters] = useState<string | null>(null);

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
    // Mark as seen
    markUpdatesSeen();
  }, []);

  // Fetch posters for expanded update
  const fetchPosters = useCallback(async (titles: string[], updateId: string) => {
    if (loadingPosters === updateId) return;
    setLoadingPosters(updateId);

    const cache = getPosterCache();
    const now = Date.now();
    const newMap: Record<string, string | null> = { ...posterMap };
    const toFetch: string[] = [];

    // Check cache first
    for (const title of titles.slice(0, 30)) {
      const cached = cache[title];
      if (cached && (now - cached.ts) < POSTER_CACHE_TTL) {
        newMap[title] = cached.poster;
      } else {
        toFetch.push(title);
      }
    }

    setPosterMap(newMap);

    // Fetch uncached in batches of 5
    for (let i = 0; i < toFetch.length; i += 5) {
      const batch = toFetch.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (title) => {
          const movies = await searchMovies(title);
          const match = movies.find((m: TMDBMovie) => m.poster_path);
          return { title, poster: match?.poster_path || null };
        })
      );

      const updatedCache = getPosterCache();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { title, poster } = result.value;
          newMap[title] = poster;
          updatedCache[title] = { poster, ts: now };
        }
      }
      setPosterCache(updatedCache);
      setPosterMap({ ...newMap });
    }

    setLoadingPosters(null);
  }, [posterMap, loadingPosters]);

  const handleExpand = (update: M3UUpdate) => {
    const isExpanded = expandedId === update.id;
    setExpandedId(isExpanded ? null : update.id);
    if (!isExpanded && update.new_titles?.length > 0) {
      fetchPosters(update.new_titles, update.id);
    }
  };

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
              onClick={() => handleExpand(update)}
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
                    <Badge variant="secondary" className="text-xs">
                      +{update.total_new}
                    </Badge>
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
                    <CardContent className="pt-2 px-4 pb-4">
                      {/* Poster grid */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto pr-1">
                        {titles.slice(0, 30).map((title, i) => {
                          const poster = posterMap[title];
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.02 }}
                              className="flex flex-col items-center gap-1.5"
                            >
                              <div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-secondary/50 relative">
                                {poster ? (
                                  <img
                                    src={tmdbImg(poster, 'w200')}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : loadingPosters === update.id ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Film className="w-8 h-8 text-muted-foreground/40" />
                                  </div>
                                )}
                                {/* NEW badge */}
                                <div className="absolute top-1 left-1">
                                  <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                                    NOVO
                                  </span>
                                </div>
                              </div>
                              <p className="text-[11px] text-foreground text-center leading-tight line-clamp-2 w-full">
                                {title}
                              </p>
                            </motion.div>
                          );
                        })}
                      </div>
                      {update.total_new > 30 && (
                        <p className="text-xs text-muted-foreground mt-3 text-center">
                          ...e mais {update.total_new - 30} títulos adicionados
                        </p>
                      )}
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
