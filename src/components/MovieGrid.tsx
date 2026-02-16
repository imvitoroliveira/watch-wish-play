import { TMDBMovie } from '@/lib/tmdb';
import { Skeleton } from '@/components/ui/skeleton';
import MovieCard from '@/components/MovieCard';

interface MovieGridProps {
  movies: TMDBMovie[];
  loading?: boolean;
  favorites: Set<number>;
  watchedSet: Set<number>;
  contentAlerts: Set<number>;
  onMovieClick: (movie: TMDBMovie) => void;
  onToggleFavorite: (movie: TMDBMovie) => void;
  onToggleWatched: (movie: TMDBMovie) => void;
  onToggleContentAlert: (movie: TMDBMovie) => void;
  getAvailability: (movie: TMDBMovie) => 'available' | 'soon' | 'unknown';
  emptyMessage?: string;
}

const MovieGrid = ({
  movies,
  loading,
  favorites,
  watchedSet,
  contentAlerts,
  onMovieClick,
  onToggleFavorite,
  onToggleWatched,
  onToggleContentAlert,
  getAvailability,
  emptyMessage = 'Nenhum filme encontrado.',
}: MovieGridProps) => {
  if (loading || movies.length === 0) {
    if (loading) {
      return (
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
      );
    }
    return <p className="text-muted-foreground text-center py-12">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {movies.map(movie => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onClick={() => onMovieClick(movie)}
          isFavorite={favorites.has(movie.id)}
          isWatched={watchedSet.has(movie.id)}
          onToggleFavorite={(e) => { e.stopPropagation(); onToggleFavorite(movie); }}
          onToggleWatched={(e) => { e.stopPropagation(); onToggleWatched(movie); }}
          availability={getAvailability(movie)}
          hasContentAlert={contentAlerts.has(movie.id)}
          onToggleContentAlert={(e) => { e.stopPropagation(); onToggleContentAlert(movie); }}
        />
      ))}
    </div>
  );
};

export default MovieGrid;
