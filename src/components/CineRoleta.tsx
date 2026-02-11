import { useState, useCallback } from 'react';
import { TMDBMovie } from '@/lib/tmdb';
import { GENRES } from '@/lib/tmdb';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Sparkles } from 'lucide-react';
import MovieCard from './MovieCard';

interface CineRoletaProps {
  movies: TMDBMovie[];
  onMovieClick: (movie: TMDBMovie) => void;
  favorites: Set<number>;
  watched: Set<number>;
  onToggleFavorite: (id: number) => void;
  onToggleWatched: (id: number) => void;
}

const CineRoleta = ({ movies, onMovieClick, favorites, watched, onToggleFavorite, onToggleWatched }: CineRoletaProps) => {
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [result, setResult] = useState<TMDBMovie | null>(null);
  const [spinning, setSpinning] = useState(false);

  const spin = useCallback(() => {
    let pool = selectedGenre
      ? movies.filter(m => m.genre_ids?.some(g => g === selectedGenre))
      : movies;
    if (pool.length === 0) pool = movies;

    setSpinning(true);
    setResult(null);

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
  }, [movies, selectedGenre]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <Sparkles className="w-6 h-6 inline mr-2 text-accent" />
          CINE-ROLETA
        </h2>
        <p className="text-muted-foreground text-sm">Não sabe o que assistir? Deixe a sorte decidir!</p>
      </div>

      {/* Genre selection */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">Filtrar por gênero (opcional):</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGenre(selectedGenre === g.id ? null : g.id)}
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

      {/* Spin button - enlarged & highlighted */}
      <div className="text-center py-4">
        <button
          onClick={spin}
          disabled={spinning || movies.length === 0}
          className="relative h-16 px-14 text-xl font-display rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Dices className={`w-7 h-7 inline mr-3 ${spinning ? 'animate-spin' : ''}`} />
          {spinning ? 'GIRANDO...' : '🎬 SORTEAR FILME!'}
        </button>
      </div>

      {/* Result with fade-in */}
      <AnimatePresence mode="wait">
        {result && !spinning && (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex justify-center"
          >
            <div className="w-52">
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
