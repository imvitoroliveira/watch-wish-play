import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getTrending, TMDBMovie, searchMovies, searchByTitles } from '@/lib/tmdb';
import { fetchM3UCatalog, normalizeTitle, isInM3UCatalog } from '@/lib/m3u-parser';
import { motion } from 'framer-motion';
import { Search, Heart, Clock, Dices, HelpCircle, LogOut, Trophy, Menu, X, Film } from 'lucide-react';
import eagleLogo from '@/assets/eagle-logo.png';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import MovieCard from '@/components/MovieCard';
import MovieModal from '@/components/MovieModal';
import CineRoleta from '@/components/CineRoleta';
import SupportTickets from '@/components/SupportTickets';
import ExpirationBanner from '@/components/ExpirationBanner';
import AgendaJogos from '@/components/AgendaJogos';
import CineTrailerChallenge from '@/components/CineTrailerChallenge';
import { supabase } from '@/integrations/supabase/client';

type Tab = 'home' | 'watchlist' | 'roleta' | 'jogos' | 'support';

const Dashboard = () => {
  const { currentClient, isClient, isExpiringSoon, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Heartbeat: send presence every 3 minutes
  useEffect(() => {
    if (!currentClient?.u) return;
    const sendHeartbeat = () => {
      supabase.functions.invoke('user-presence', {
        method: 'POST',
        body: { action: 'heartbeat', username: currentClient.u },
      }).catch(() => {});
    };
    sendHeartbeat(); // immediate
    const interval = setInterval(sendHeartbeat, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentClient?.u]);

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
    { id: 'home', label: 'Explorar', icon: <Film className="w-4 h-4" /> },
    { id: 'watchlist', label: 'Minha Lista', icon: <Heart className="w-4 h-4" /> },
    { id: 'roleta', label: 'Cine-Roleta', icon: <Dices className="w-4 h-4" /> },
    { id: 'jogos', label: 'Agenda Esportiva', icon: <Trophy className="w-4 h-4" /> },
    { id: 'support', label: 'Central de Ajuda', icon: <HelpCircle className="w-4 h-4" /> },
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
            {isMobile && (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button className="text-foreground p-1">
                    <Menu className="w-6 h-6" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 bg-card border-border p-0">
                  <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center">
                        <img src={eagleLogo} alt="StreamTV" className="w-9 h-9 object-contain" />
                      </div>
                      <span className="font-display text-xl text-foreground tracking-wide">MEU STREAM</span>
                    </div>
                  </div>
                  <nav className="p-3 space-y-1">
                    {tabs.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                          tab === t.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </nav>
                  <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">{currentClient?.u}</p>
                    <button
                      onClick={() => { logout(); navigate('/'); }}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sair
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center">
              <img src={eagleLogo} alt="StreamTV" className="w-9 h-9 object-contain" />
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

        {/* Tabs - desktop only */}
        {!isMobile && (
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
        )}
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
            <h2 className="text-2xl font-display text-foreground mb-4">MINHA LISTA</h2>
            {favoriteMovies.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">Você ainda não adicionou itens à sua lista.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {favoriteMovies.map(renderMovieCard)}
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
