import { useState, useCallback } from 'react';
import { TMDBMovie } from '@/lib/tmdb';
import { GENRES } from '@/lib/tmdb';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MovieCard from './MovieCard';

interface CineRoletaProps {
  movies: TMDBMovie[];
  onMovieClick: (movie: TMDBMovie) => void;
  favorites: Set<number>;
  watched: Set<number>;
  onToggleFavorite: (id: number) => void;
  onToggleWatched: (id: number) => void;
}

const VIBES = [
  { label: 'Em Família', icon: '👨‍👩‍👧‍👦' },
  { label: 'Noite Romântica', icon: '❤️' },
  { label: 'Adrenalina', icon: '🔥' },
  { label: 'Para Pensar', icon: '🧠' },
  { label: 'Terror Pesado', icon: '👻' },
  { label: 'Risadas', icon: '😂' },
];

const CineRoleta = ({ movies, onMovieClick, favorites, watched, onToggleFavorite, onToggleWatched }: CineRoletaProps) => {
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [result, setResult] = useState<TMDBMovie | null>(null);
  const [spinning, setSpinning] = useState(false);

  const vibeGenreMap: Record<string, number[]> = {
    'Em Família': [16, 12, 35],
    'Noite Romântica': [10749, 18],
    'Adrenalina': [28, 53],
    'Para Pensar': [18, 9648, 878],
    'Terror Pesado': [27],
    'Risadas': [35],
  };

  const spin = useCallback(() => {
    let pool = movies;
    const genreFilter = selectedGenre
      ? [selectedGenre]
      : selectedVibe
      ? vibeGenreMap[selectedVibe] || []
      : [];

    if (genreFilter.length > 0) {
      pool = movies.filter(m => m.genre_ids?.some(g => genreFilter.includes(g)));
    }
    if (pool.length === 0) pool = movies;

    setSpinning(true);
    setResult(null);

    // Simulate spinning animation
    let count = 0;
    const interval = setInterval(() => {
      const random = pool[Math.floor(Math.random() * pool.length)];
      setResult(random);
      count++;
      if (count > 15) {
        clearInterval(interval);
        setSpinning(false);
      }
    }, 120);
  }, [movies, selectedGenre, selectedVibe]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <Sparkles className="w-6 h-6 inline mr-2 text-accent" />
          CINE-ROLETA
        </h2>
        <p className="text-muted-foreground text-sm">Não sabe o que assistir? Deixe a sorte decidir!</p>
      </div>

      {/* Genre selection */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">Gênero (opcional):</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map(g => (
            <button
              key={g.id}
              onClick={() => { setSelectedGenre(selectedGenre === g.id ? null : g.id); setSelectedVibe(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedGenre === g.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Vibe selection */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">Vibe (opcional):</p>
        <div className="flex flex-wrap gap-2">
          {VIBES.map(v => (
            <button
              key={v.label}
              onClick={() => { setSelectedVibe(selectedVibe === v.label ? null : v.label); setSelectedGenre(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedVibe === v.label
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
              }`}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spin button */}
      <div className="text-center">
        <Button
          onClick={spin}
          disabled={spinning || movies.length === 0}
          className="h-14 px-10 text-lg font-display bg-primary hover:bg-primary/90 text-primary-foreground glow-red disabled:opacity-50"
        >
          <Dices className={`w-6 h-6 mr-2 ${spinning ? 'animate-spin-slow' : ''}`} />
          {spinning ? 'GIRANDO...' : 'ESCOLHA POR MIM!'}
        </Button>
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && !spinning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex justify-center"
          >
            <div className="w-48">
              <MovieCard
                movie={result}
                onClick={() => onMovieClick(result)}
                isFavorite={favorites.has(result.id)}
                isWatched={watched.has(result.id)}
                onToggleFavorite={(e) => { e.stopPropagation(); onToggleFavorite(result.id); }}
                onToggleWatched={(e) => { e.stopPropagation(); onToggleWatched(result.id); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CineRoleta;
