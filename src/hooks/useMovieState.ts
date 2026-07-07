import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTrending, TMDBMovie, searchMovies, searchByTitles } from '@/lib/tmdb';
import { fetchM3UCatalog, normalizeTitle, parseCatalogItem } from '@/lib/m3u-parser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Store full movie objects for persistence
function loadMovieMap(key: string): Map<number, TMDBMovie> {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return new Map();
    const arr: TMDBMovie[] = JSON.parse(saved);
    return new Map(arr.map(m => [m.id, m]));
  } catch {
    return new Map();
  }
}

function saveMovieMap(key: string, map: Map<number, TMDBMovie>) {
  localStorage.setItem(key, JSON.stringify([...map.values()]));
}

// Normaliza o rótulo bruto de categoria numa chave curta de gênero (deve casar com AssistirPortal)
function normalizeGenreKey(raw: string): string {
  if (!raw) return '';
  return raw.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(FILMES?|SERIES?|VOD|MOVIES?|CANAIS?)\b/g, '')
    .replace(/\b(4K|UHD|FHD|HD|SD|DUBLADO|LEGENDADO|DUB|LEG|NACIONAL|LANCAMENTOS?|LANCAMENTO)\b/g, '')
    .replace(/[|\-–:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useMovieState() {
  const { currentClient } = useAuth();

  // Favorites: persist full movie objects
  const [favoriteMap, setFavoriteMap] = useState<Map<number, TMDBMovie>>(() => loadMovieMap('msc_fav_movies'));
  const [watchedMap, setWatchedMap] = useState<Map<number, TMDBMovie>>(() => loadMovieMap('msc_watched_movies'));

  const favorites = new Set(favoriteMap.keys());
  const watchedSet = new Set(watchedMap.keys());

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  // Normalized map now holds { stream_id, isSeries } along with the title key
  const [m3uNormalized, setM3uNormalized] = useState<Map<string, { id: string, isSeries: boolean, cat: string, raw: string }>>(new Map());
  const [hasM3U, setHasM3U] = useState(false);
  const [m3uConfirmedMovies, setM3uConfirmedMovies] = useState<TMDBMovie[]>([]);
  const [contentAlerts, setContentAlerts] = useState<Set<number>>(new Set());
  const [challengeKey, setChallengeKey] = useState(0);
  const [m3uStats, setM3uStats] = useState<any>(null);

  // Trending with React Query cache
  const { data: movies = [], isLoading: moviesLoading } = useQuery({
    queryKey: ['tmdb-trending'],
    queryFn: getTrending,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,
  });

  const [m3uMovies, setM3uMovies] = useState<TMDBMovie[]>([]);
  const [m3uSeries, setM3uSeries] = useState<TMDBMovie[]>([]);

  // Load M3U catalog
  useEffect(() => {
    const loadM3U = async () => {
      try {
        const { titles: m3uTitles, stats } = await fetchM3UCatalog();
        if (stats) setM3uStats(stats);

        // Fetch vod/series category id -> name map (best effort)
        let catMaps: { vod: Record<string,string>, series: Record<string,string> } = { vod: {}, series: {} };
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-m3u?action=vod_categories`;
          const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
          if (res.ok) catMaps = await res.json();
        } catch { /* ignore */ }

        if (m3uTitles.length > 0) {
          setHasM3U(true);
          const map = new Map<string, { id: string, isSeries: boolean, cat: string, raw: string }>();
          const movieTitles: string[] = [];
          const seriesTitles: string[] = [];
          const categoryByTitle = new Map<string, string>(); // normalized title -> category name

          for (const t of m3uTitles) {
            const firstPipe = t.indexOf('|');
            
            if (firstPipe > 0 && firstPipe <= 2 && ['0','1','2'].includes(t[0])) {
              const { type, id, catId, name } = parseCatalogItem(t);
              if (type === '2') continue;
              
              const normalized = normalizeTitle(name);
              const isSeries = type === '1';
              if (id && normalized) {
                // Resolve numeric ids to names via catMaps; otherwise use as-is
                let catLabel = catId || '';
                if (catLabel && /^\d+$/.test(catLabel)) {
                  const pool = isSeries ? catMaps.series : catMaps.vod;
                  catLabel = pool?.[catLabel] || catLabel;
                }
                map.set(normalized, { id, isSeries, cat: catLabel, raw: name });
                if (catLabel) categoryByTitle.set(normalized, catLabel);
                if (isSeries) seriesTitles.push(name);
                else movieTitles.push(name);
              }
            } else {
              const isLikelyLive = /\b(globo|sbt|record|band|tv|canal|sportv|premiere|espn|uhf|hbo|max)\b/i.test(t);
              if (isLikelyLive) continue;
              
              const normalized = normalizeTitle(t);
              if (normalized && !map.has(normalized)) {
                map.set(normalized, { id: '', isSeries: false, cat: '', raw: t });
                movieTitles.push(t);
              }
            }
          }


        setM3uNormalized(map);

        // Amostragem para VODs Home
        const [foundMovies, foundSeries] = await Promise.all([
          searchByTitles(movieTitles, 150, 'movie'),
          searchByTitles(seriesTitles, 150, 'tv')
        ]);
        
        const attachMeta = (m: TMDBMovie, pool: string[]) => {
          const tMatch = pool.find(t => normalizeTitle(t) === normalizeTitle(m.title || m.name || ''));
          const exact = tMatch || m.title || m.name || '';
          const cat = categoryByTitle.get(normalizeTitle(exact)) || '';
          return { ...m, _exactM3uTitle: exact, _m3uCategory: cat };
        };
        const foundMoviesWithNames = foundMovies.map(m => attachMeta(m, movieTitles));
        const foundSeriesWithNames = foundSeries.map(m => attachMeta(m, seriesTitles));
        
        setM3uMovies(foundMoviesWithNames);
        setM3uSeries(foundSeriesWithNames);
          setM3uConfirmedMovies([...foundMoviesWithNames, ...foundSeriesWithNames].sort(() => Math.random() - 0.5));
        } // Fim do if (m3uTitles.length > 0)
      } catch (e) {
        console.error("Erro ao carregar M3U:", e);
      }
    };
    loadM3U();
  }, [currentClient?.m3u]);

  const searchFullM3U = useCallback(async (query: string, type: 'movie' | 'tv'): Promise<TMDBMovie[]> => {
    if (!query.trim()) return [];
    
    const normalizedQuery = normalizeTitle(query);
    const m3uMatches: string[] = [];
    
    // 1. Buscamos no mapa de títulos do M3U (milhares de itens)
    for (const [title] of m3uNormalized.entries()) {
      if (title.includes(normalizedQuery)) {
        m3uMatches.push(title);
      }
      if (m3uMatches.length > 30) break;
    }

    if (m3uMatches.length === 0) return [];
    
    // 2. Buscamos metadados no TMDB para esses nomes
    const results = await searchByTitles(m3uMatches, 30);
    
    // 3. Injetamos o título exato do M3U para garantir match perfeito no MovieModal
    const finalResults = results.map(m => {
      // Tenta achar qual título do M3U originou este resultado (busca simples)
      const exactMatch = m3uMatches.find(t => normalizeTitle(t) === normalizeTitle(m.title || m.name || ''));
      return { ...m, _exactM3uTitle: exactMatch || m.title || m.name };
    });

    // 4. Filtramos para garantir que o resultado bate com a categoria da aba (tv ou movie)
    return finalResults.filter(m => m.media_type === type);
  }, [m3uNormalized]);

  // Contagem total de títulos por gênero no catálogo M3U completo (para exibir "de X no catálogo")
  const genreTotals = useCallback((type: 'movie' | 'tv') => {
    const totals = new Map<string, number>();
    const wantSeries = type === 'tv';
    for (const { isSeries, cat } of m3uNormalized.values()) {
      if (isSeries !== wantSeries) continue;
      const key = normalizeGenreKey(cat);
      if (!key) continue;
      totals.set(key, (totals.get(key) || 0) + 1);
    }
    return totals;
  }, [m3uNormalized]);

  const [loadingMoreGenre, setLoadingMoreGenre] = useState<string | null>(null);

  const loadMoreByGenre = useCallback(async (genreKey: string, type: 'movie' | 'tv', batchSize = 50) => {
    if (!genreKey) return 0;
    const wantSeries = type === 'tv';
    const alreadyIds = new Set<string>((type === 'tv' ? m3uSeries : m3uMovies).map(m => normalizeTitle((m as any)._exactM3uTitle || m.title || m.name || '')));

    const candidates: string[] = [];
    for (const [norm, info] of m3uNormalized.entries()) {
      if (info.isSeries !== wantSeries) continue;
      if (normalizeGenreKey(info.cat) !== genreKey) continue;
      if (alreadyIds.has(norm)) continue;
      candidates.push(info.raw);
      if (candidates.length >= batchSize) break;
    }
    if (candidates.length === 0) return 0;

    setLoadingMoreGenre(genreKey);
    try {
      const found = await searchByTitles(candidates, batchSize, type);
      const withMeta = found.map(m => {
        const exact = candidates.find(t => normalizeTitle(t) === normalizeTitle(m.title || m.name || '')) || m.title || m.name || '';
        const cat = m3uNormalized.get(normalizeTitle(exact))?.cat || '';
        return { ...m, _exactM3uTitle: exact, _m3uCategory: cat };
      });
      if (type === 'tv') {
        setM3uSeries(prev => {
          const seen = new Set(prev.map(p => p.id));
          return [...prev, ...withMeta.filter(m => !seen.has(m.id))];
        });
      } else {
        setM3uMovies(prev => {
          const seen = new Set(prev.map(p => p.id));
          return [...prev, ...withMeta.filter(m => !seen.has(m.id))];
        });
      }
      return withMeta.length;
    } finally {
      setLoadingMoreGenre(null);
    }
  }, [m3uNormalized, m3uMovies, m3uSeries]);

  // Content alerts
  useEffect(() => {
    if (!currentClient?.u) return;
    supabase.functions.invoke('content-alerts', {
      method: 'POST',
      body: { username: currentClient.u, action: 'list' },
    }).then(({ data }) => {
      if (data?.alerts) setContentAlerts(new Set(data.alerts));
    }).catch(() => {});
  }, [currentClient?.u]);

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(() => {
      searchMovies(searchQuery).then(setSearchResults);
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const toggleFavorite = useCallback((movie: TMDBMovie) => {
    setFavoriteMap(prev => {
      const next = new Map(prev);
      if (next.has(movie.id)) next.delete(movie.id);
      else next.set(movie.id, movie);
      saveMovieMap('msc_fav_movies', next);
      return next;
    });
  }, []);

  const toggleWatched = useCallback((movie: TMDBMovie) => {
    setWatchedMap(prev => {
      const next = new Map(prev);
      if (next.has(movie.id)) next.delete(movie.id);
      else next.set(movie.id, movie);
      saveMovieMap('msc_watched_movies', next);
      return next;
    });
  }, []);

  const toggleContentAlert = useCallback(async (movie: TMDBMovie) => {
    if (!currentClient?.u) return;
    const title = movie.title || movie.name || '';
    // For movies, original_title is the English title; for TV, use name as fallback
    const originalTitle = (movie as any).original_title || (movie as any).original_name || '';
    try {
      const { data } = await supabase.functions.invoke('content-alerts', {
        method: 'POST',
        body: { username: currentClient.u, action: 'toggle', movie_title: title, original_title: originalTitle, movie_id: movie.id },
      });
      if (data) {
        setContentAlerts(prev => {
          const next = new Set(prev);
          if (data.active) next.add(movie.id); else next.delete(movie.id);
          return next;
        });
      }
    } catch { /* silent */ }
  }, [currentClient?.u]);

  const getAvailability = useCallback((movie: TMDBMovie): 'available' | 'soon' | 'unknown' => {
    if (!hasM3U) return 'unknown';
    const title = movie.title || movie.name || '';
    const originalTitle = (movie as any).original_title || (movie as any).original_name || '';
    const exactM3u = (movie as any)._exactM3uTitle || '';
    
    const hasMatch = m3uNormalized.has(normalizeTitle(title)) || 
                     m3uNormalized.has(normalizeTitle(originalTitle)) ||
                     (exactM3u && m3uNormalized.has(normalizeTitle(exactM3u)));
    
    return hasMatch ? 'available' : 'soon';
  }, [hasM3U, m3uNormalized]);


  const displayMovies = searchQuery.trim() ? searchResults : movies;
  const favoriteMovies = [...favoriteMap.values()];
  const watchedMovies = [...watchedMap.values()];

  return {
    movies,
    moviesLoading,
    displayMovies,
    favoriteMovies,
    watchedMovies,
    favorites,
    watchedSet,
    searchQuery,
    setSearchQuery,
    toggleFavorite,
    toggleWatched,
    toggleContentAlert,
    getAvailability,
    contentAlerts,
    m3uConfirmedMovies,
    m3uMovies,
    m3uSeries,
    searchFullM3U,
    challengeKey,
    setChallengeKey,
    m3uNormalized, // Exportamos o map para montar o Link Pessoal
    m3uStats,      // Estatísticas para o Dashboard
    loadMoreByGenre,
    loadingMoreGenre,
    genreTotals,
  };
}
