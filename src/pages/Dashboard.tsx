import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TMDBMovie } from '@/lib/tmdb';
import { useMovieState } from '@/hooks/useMovieState';
import { motion } from 'framer-motion';
import DashboardHeader, { Tab } from '@/components/DashboardHeader';
import MovieGrid from '@/components/MovieGrid';
import MovieModal from '@/components/MovieModal';
import CineRoleta from '@/components/CineRoleta';
import SupportTickets from '@/components/SupportTickets';
import ExpirationBanner from '@/components/ExpirationBanner';
import AgendaJogos from '@/components/AgendaJogos';
import CineTrailerChallenge from '@/components/CineTrailerChallenge';
import CatalogUpdates from '@/components/CatalogUpdates';
import RenewalModal from '@/components/RenewalModal';
import { useBillingEnabled } from '@/hooks/useBillingEnabled';
import { usePushNotifications } from '@/hooks/usePushNotifications';


import { supabase } from '@/integrations/supabase/client';

const Dashboard = () => {
  const { currentClient, isClient, isExpiringSoon, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
  const [showRenewalPopup, setShowRenewalPopup] = useState(false);
  const { billingEnabled } = useBillingEnabled();
  usePushNotifications();

  // Show renewal popup on first access when expiring soon
  useEffect(() => {
    if (billingEnabled && isExpiringSoon) {
      const dismissed = sessionStorage.getItem('renewal_popup_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => setShowRenewalPopup(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [isExpiringSoon, billingEnabled]);

  const dismissRenewalPopup = () => {
    setShowRenewalPopup(false);
    sessionStorage.setItem('renewal_popup_dismissed', '1');
  };

  const {
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
  } = useMovieState();

  // Heartbeat: send presence every 3 minutes
  useEffect(() => {
    if (!currentClient?.u) return;
    const sendHeartbeat = () => {
      supabase.functions.invoke('user-presence', {
        method: 'POST',
        body: { action: 'heartbeat', username: currentClient.u },
      }).catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentClient?.u]);


  useEffect(() => {
    if (!isClient) navigate('/');
  }, [isClient, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {billingEnabled && isExpiringSoon && <ExpirationBanner />}

      <DashboardHeader
        tab={tab}
        setTab={setTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CineTrailerChallenge key={challengeKey} />
            <h2 className="text-2xl font-display text-foreground mb-4">
              {searchQuery.trim() ? 'RESULTADOS DA BUSCA' : 'EM ALTA ESTA SEMANA'}
            </h2>
            <MovieGrid
              movies={displayMovies}
              loading={moviesLoading && displayMovies.length === 0}
              favorites={favorites}
              watchedSet={watchedSet}
              contentAlerts={contentAlerts}
              onMovieClick={setSelectedMovie}
              onToggleFavorite={toggleFavorite}
              onToggleWatched={toggleWatched}
              onToggleContentAlert={toggleContentAlert}
              getAvailability={getAvailability}
            />
          </motion.div>
        )}

        {tab === 'watchlist' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-display text-foreground mb-4">MINHA LISTA</h2>
            <MovieGrid
              movies={favoriteMovies}
              favorites={favorites}
              watchedSet={watchedSet}
              contentAlerts={contentAlerts}
              onMovieClick={setSelectedMovie}
              onToggleFavorite={toggleFavorite}
              onToggleWatched={toggleWatched}
              onToggleContentAlert={toggleContentAlert}
              getAvailability={getAvailability}
              emptyMessage="Você ainda não adicionou itens à sua lista."
            />
          </motion.div>
        )}

        {tab === 'roleta' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CineRoleta
              movies={m3uConfirmedMovies.length > 0 ? m3uConfirmedMovies : movies}
              onMovieClick={setSelectedMovie}
              favorites={favorites}
              watched={watchedSet}
              favoriteMovies={favoriteMovies}
              onToggleFavorite={(id) => {
                const movie = [...displayMovies, ...m3uConfirmedMovies].find(m => m.id === id);
                if (movie) toggleFavorite(movie);
              }}
              onToggleWatched={(id) => {
                const movie = [...displayMovies, ...m3uConfirmedMovies].find(m => m.id === id);
                if (movie) toggleWatched(movie);
              }}
              onTrailerWatched={() => setChallengeKey(k => k + 1)}
            />
          </motion.div>
        )}

        {tab === 'jogos' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AgendaJogos />
          </motion.div>
        )}

        {tab === 'updates' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-display text-foreground mb-4">ATUALIZAÇÕES DO CATÁLOGO</h2>
            <CatalogUpdates onMovieClick={setSelectedMovie} />
          </motion.div>
        )}

        {tab === 'support' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SupportTickets />
          </motion.div>
        )}
      </main>

      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          isFavorite={favorites.has(selectedMovie.id)}
          isWatched={watchedSet.has(selectedMovie.id)}
          onToggleFavorite={() => toggleFavorite(selectedMovie)}
          onToggleWatched={() => toggleWatched(selectedMovie)}
          onTrailerWatched={() => setChallengeKey(k => k + 1)}
          availability={getAvailability(selectedMovie)}
        />
      )}

      {billingEnabled && showRenewalPopup && (
        <RenewalModal
          username={currentClient?.u || ''}
          onClose={dismissRenewalPopup}
        />
      )}
    </div>
  );
};

export default Dashboard;
