import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTrending, TMDBMovie, searchMovies, searchByTitles } from '@/lib/tmdb';
import { fetchM3UCatalog, normalizeTitle, isInM3UCatalog } from '@/lib/m3u-parser';
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

export function useMovieState() {
  const { currentClient } = useAuth();

  // Favorites: persist full movie objects
  const [favoriteMap, setFavoriteMap] = useState<Map<number, TMDBMovie>>(() => loadMovieMap('msc_fav_movies'));
  const [watchedMap, setWatchedMap] = useState<Map<number, TMDBMovie>>(() => loadMovieMap('msc_watched_movies'));

  const favorites = new Set(favoriteMap.keys());
  const watchedSet = new Set(watchedMap.keys());

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  const [m3uNormalized, setM3uNormalized] = useState<Set<string>>(new Set());
  const [hasM3U, setHasM3U] = useState(false);
  const [m3uConfirmedMovies, setM3uConfirmedMovies] = useState<TMDBMovie[]>([]);
  const [contentAlerts, setContentAlerts] = useState<Set<number>>(new Set());
  const [challengeKey, setChallengeKey] = useState(0);

  // Trending with React Query cache
  const { data: movies = [], isLoading: moviesLoading } = useQuery({
    queryKey: ['tmdb-trending'],
    queryFn: getTrending,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,
  });

  // Load M3U catalog
  useEffect(() => {
    const loadM3U = async () => {
      const { titles: m3uTitles } = await fetchM3UCatalog();
      if (m3uTitles.length > 0) {
        setHasM3U(true);
        setM3uNormalized(new Set(m3uTitles.map(normalizeTitle)));
        const m3uMovies = await searchByTitles(m3uTitles, 80);
        setM3uConfirmedMovies(m3uMovies);
      }
    };
    loadM3U();
  }, []);

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
    try {
      const { data } = await supabase.functions.invoke('content-alerts', {
        method: 'POST',
        body: { username: currentClient.u, action: 'toggle', movie_title: title, movie_id: movie.id },
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
    return isInM3UCatalog(title, m3uNormalized) ? 'available' : 'soon';
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
    challengeKey,
    setChallengeKey,
  };
}
