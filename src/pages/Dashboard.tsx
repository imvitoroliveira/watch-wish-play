import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getTrending, TMDBMovie, searchMovies, searchByTitles } from '@/lib/tmdb';
import { fetchM3UCatalog, normalizeTitle, isInM3UCatalog } from '@/lib/m3u-parser';
import { motion } from 'framer-motion';
import { Film, Search, Heart, Clock, Dices, HelpCircle, LogOut, Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import MovieCard from '@/components/MovieCard';
import MovieModal from '@/components/MovieModal';
import CineRoleta from '@/components/CineRoleta';
import SupportTickets from '@/components/SupportTickets';
import ExpirationBanner from '@/components/ExpirationBanner';
import AgendaJogos from '@/components/AgendaJogos';
import CineTrailerChallenge from '@/components/CineTrailerChallenge';
import { supabase } from '@/integrations/supabase/client';

type Tab = 'home' | 'watchlist' | 'history' | 'roleta' | 'jogos' | 'support';

const Dashboard = () => {
  const { currentClient, isClient, isExpiringSoon, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('msc_favorites');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [watchedSet, setWatchedSet] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('msc_watched');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [m3uNormalized, setM3uNormalized] = useState<Set<string>>(new Set());
  const [hasM3U, setHasM3U] = useState(false);
  const [m3uConfirmedMovies, setM3uConfirmedMovies] = useState<TMDBMovie[]>([]);
  const [contentAlerts, setContentAlerts] = useState<Set<number>>(new Set());
  const [challengeKey, setChallengeKey] = useState(0);

  useEffect(() => {
    if (!isClient) navigate('/');
  }, [isClient, navigate]);

  // Load content alerts from DB
  useEffect(() => {
    if (!currentClient?.u) return;
    const loadAlerts = async () => {
      try {
        const { data } = await supabase.functions.invoke('content-alerts', {
          method: 'POST',
          body: { username: currentClient.u, action: 'list' },
        });
        if (data?.alerts) setContentAlerts(new Set(data.alerts));
      } catch { /* silent */ }
    };
    loadAlerts();
  }, [currentClient?.u]);

  useEffect(() => {
    const loadMovies = async () => {
      const trending = await getTrending();
      setMovies(trending);
      const { titles: m3uTitles } = await fetchM3UCatalog();
      if (m3uTitles.length > 0) {
        setHasM3U(true);
        setM3uNormalized(new Set(m3uTitles.map(normalizeTitle)));
        const m3uMovies = await searchByTitles(m3uTitles, 80);
        setM3uConfirmedMovies(m3uMovies);
      }
    };
    loadMovies();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(() => {
      searchMovies(searchQuery).then(setSearchResults);
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('msc_favorites', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleWatched = useCallback((id: number) => {
    setWatchedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('msc_watched', JSON.stringify([...next]));
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
  const favoriteMovies = movies.filter(m => favorites.has(m.id));
  const watchedMovies = movies.filter(m => watchedSet.has(m.id));

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Início', icon: <Film className="w-4 h-4" /> },
    { id: 'watchlist', label: 'Favoritos', icon: <Heart className="w-4 h-4" /> },
    { id: 'history', label: 'Assistidos', icon: <Clock className="w-4 h-4" /> },
    { id: 'roleta', label: 'Cine-Roleta', icon: <Dices className="w-4 h-4" /> },
    { id: 'jogos', label: 'Jogos VIP', icon: <Trophy className="w-4 h-4" /> },
    { id: 'support', label: 'Suporte', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  const renderMovieCard = (movie: TMDBMovie) => (
    <MovieCard
      key={movie.id}
      movie={movie}
      onClick={() => setSelectedMovie(movie)}
      isFavorite={favorites.has(movie.id)}
      isWatched={watchedSet.has(movie.id)}
      onToggleFavorite={(e) => { e.stopPropagation(); toggleFavorite(movie.id); }}
      onToggleWatched={(e) => { e.stopPropagation(); toggleWatched(movie.id); }}
      availability={getAvailability(movie)}
      hasContentAlert={contentAlerts.has(movie.id)}
      onToggleContentAlert={(e) => { e.stopPropagation(); toggleContentAlert(movie); }}
    />
  );

  return (
    <div className="min-h-screen bg-background">
      {isExpiringSoon && <ExpirationBanner />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Film className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl text-foreground tracking-wide hidden sm:block">MEU STREAM</span>
          </div>

          {tab === 'home' && (
            <div className="flex-1 max-w-md mx-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar filmes e séries..."
                  className="pl-10 h-9 bg-card border-border text-foreground placeholder:text-muted-foreground text-sm"
                  maxLength={200}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {currentClient?.u}
            </span>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Cine-Trailer Challenge Widget */}
            <CineTrailerChallenge key={challengeKey} />

            <h2 className="text-2xl font-display text-foreground mb-4">
              {searchQuery.trim() ? 'RESULTADOS DA BUSCA' : 'EM ALTA ESTA SEMANA'}
            </h2>
            {displayMovies.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-xl overflow-hidden bg-card border border-border">
                    <Skeleton className="aspect-[2/3] w-full" />
                    <div className="p-2.5 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {displayMovies.map(renderMovieCard)}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'watchlist' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-display text-foreground mb-4">MEUS FAVORITOS</h2>
            {favoriteMovies.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">Você ainda não adicionou favoritos.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {favoriteMovies.map(renderMovieCard)}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-display text-foreground mb-4">JÁ ASSISTIDOS</h2>
            {watchedMovies.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">Marque filmes como assistidos para acompanhar seu histórico.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {watchedMovies.map(renderMovieCard)}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'roleta' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CineRoleta
              movies={m3uConfirmedMovies.length > 0 ? m3uConfirmedMovies : movies}
              onMovieClick={setSelectedMovie}
              favorites={favorites}
              watched={watchedSet}
              onToggleFavorite={toggleFavorite}
              onToggleWatched={toggleWatched}
              onTrailerWatched={() => setChallengeKey(k => k + 1)}
            />
          </motion.div>
        )}

        {tab === 'jogos' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AgendaJogos />
          </motion.div>
        )}

        {tab === 'support' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SupportTickets />
          </motion.div>
        )}
      </main>

      {/* Movie Modal */}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          isFavorite={favorites.has(selectedMovie.id)}
          isWatched={watchedSet.has(selectedMovie.id)}
          onToggleFavorite={() => toggleFavorite(selectedMovie.id)}
          onToggleWatched={() => toggleWatched(selectedMovie.id)}
          onTrailerWatched={() => setChallengeKey(k => k + 1)}
        />
      )}
    </div>
  );
};

export default Dashboard;
