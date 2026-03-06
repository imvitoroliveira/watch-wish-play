import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Package, Film, Clock, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
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

export function markUpdatesSeen() {
  localStorage.setItem('catalog_updates_last_seen', new Date().toISOString());
}

export function getLastSeenDate(): string | null {
  return localStorage.getItem('catalog_updates_last_seen');
}

const POSTER_CACHE_KEY = 'catalog_poster_cache';
const POSTER_CACHE_TTL = 24 * 60 * 60 * 1000;

function getPosterCache(): Record<string, { poster: string | null; ts: number }> {
  try { return JSON.parse(localStorage.getItem(POSTER_CACHE_KEY) || '{}'); } catch { return {}; }
}

function setPosterCache(cache: Record<string, { poster: string | null; ts: number }>) {
  const entries = Object.entries(cache);
  if (entries.length > 300) {
    entries.sort((a, b) => b[1].ts - a[1].ts);
    cache = Object.fromEntries(entries.slice(0, 300));
  }
  localStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(cache));
}

const INITIAL_VISIBLE = 30;
const LOAD_MORE_COUNT = 20;

const CatalogUpdates = () => {
  const [updates, setUpdates] = useState<M3UUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [posterMap, setPosterMap] = useState<Record<string, string | null>>({});
  const [fetchingPosters, setFetchingPosters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const fetchedRef = useRef(new Set<string>());

  // Flatten all titles from all updates (most recent first, deduplicated)
  const allTitles: { title: string; date: Date; updateId: string }[] = [];
  const seen = new Set<string>();
  for (const update of updates) {
    const date = new Date(update.updated_at);
    for (const title of (update.new_titles || [])) {
      if (!seen.has(title)) {
        seen.add(title);
        allTitles.push({ title, date, updateId: update.id });
      }
    }
  }

  const visibleTitles = allTitles.slice(0, visibleCount);
  const hasMore = visibleCount < allTitles.length;
  const latestUpdate = updates[0];

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
    markUpdatesSeen();
  }, []);

  // Auto-fetch posters for visible titles
  const fetchPosters = useCallback(async (titles: string[]) => {
    const toFetch = titles.filter(t => !fetchedRef.current.has(t));
    if (toFetch.length === 0) return;

    setFetchingPosters(true);
    const cache = getPosterCache();
    const now = Date.now();
    const newMap: Record<string, string | null> = {};

    // Load from cache
    const uncached: string[] = [];
    for (const title of toFetch) {
      fetchedRef.current.add(title);
      const cached = cache[title];
      if (cached && (now - cached.ts) < POSTER_CACHE_TTL) {
        newMap[title] = cached.poster;
      } else {
        uncached.push(title);
      }
    }

    if (Object.keys(newMap).length > 0) {
      setPosterMap(prev => ({ ...prev, ...newMap }));
    }

    // Fetch uncached in batches of 5
    for (let i = 0; i < uncached.length; i += 5) {
      const batch = uncached.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (title) => {
          const movies = await searchMovies(title);
          const match = movies.find((m: TMDBMovie) => m.poster_path);
          return { title, poster: match?.poster_path || null };
        })
      );

      const updatedCache = getPosterCache();
      const batchMap: Record<string, string | null> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { title, poster } = result.value;
          batchMap[title] = poster;
          updatedCache[title] = { poster, ts: now };
        }
      }
      setPosterCache(updatedCache);
      setPosterMap(prev => ({ ...prev, ...batchMap }));
    }

    setFetchingPosters(false);
  }, []);

  // Fetch posters whenever visible titles change
  useEffect(() => {
    if (visibleTitles.length > 0) {
      fetchPosters(visibleTitles.map(t => t.title));
    }
  }, [visibleCount, updates]);

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
    <div className="space-y-5">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Novos Títulos Adicionados</h3>
        </div>
        {latestUpdate && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              +{latestUpdate.total_new} recentes
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(new Date(latestUpdate.updated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
        )}
      </div>

      {/* Poster grid — always visible */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {visibleTitles.map(({ title }, i) => {
          const poster = posterMap[title];
          return (
            <motion.div
              key={title}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.02, 0.6) }}
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
                ) : fetchingPosters ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}
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

      {/* Ver Mais button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount(prev => prev + LOAD_MORE_COUNT)}
            className="gap-2"
          >
            <ChevronDown className="w-4 h-4" />
            Ver Mais ({Math.min(LOAD_MORE_COUNT, allTitles.length - visibleCount)} títulos)
          </Button>
        </div>
      )}

      {/* Total info */}
      <p className="text-xs text-muted-foreground text-center">
        Exibindo {Math.min(visibleCount, allTitles.length)} de {allTitles.length} títulos recentes
      </p>
    </div>
  );
};

export default CatalogUpdates;
