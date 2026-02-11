import { TMDBMovie, tmdbImg } from '@/lib/tmdb';
import { motion } from 'framer-motion';
import { Star, Heart, Check } from 'lucide-react';

interface MovieCardProps {
  movie: TMDBMovie;
  onClick: () => void;
  isFavorite?: boolean;
  isWatched?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  onToggleWatched?: (e: React.MouseEvent) => void;
  availability?: 'available' | 'soon' | 'unknown';
}

const MovieCard = ({ movie, onClick, isFavorite, isWatched, onToggleFavorite, onToggleWatched, availability }: MovieCardProps) => {
  const title = movie.title || movie.name || 'Sem título';

  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group cursor-pointer rounded-xl overflow-hidden bg-card border border-border transition-all hover:border-primary/30 hover:glow-red"
      onClick={onClick}
    >
      {/* Availability badge */}
      {availability === 'available' && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px] font-bold uppercase tracking-wide shadow">
          ✓ Disponível
        </div>
      )}
      {availability === 'soon' && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wide shadow opacity-80">
          Em breve
        </div>
      )}

      {/* Poster */}
      <div className="aspect-[2/3] bg-secondary overflow-hidden">
        <img
          src={tmdbImg(movie.poster_path, 'w300')}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <div className="flex items-center gap-1 mb-1">
          <Star className="w-3.5 h-3.5 text-accent fill-accent" />
          <span className="text-xs font-medium text-accent">{movie.vote_average?.toFixed(1)}</span>
        </div>
        <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
      </div>

      {/* Quick action buttons */}
      <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isFavorite ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-foreground hover:bg-primary/80'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        )}
        {onToggleWatched && (
          <button
            onClick={onToggleWatched}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isWatched ? 'bg-green-600 text-primary-foreground' : 'bg-background/80 text-foreground hover:bg-green-600/80'
            }`}
          >
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Bottom title always visible */}
      <div className="p-2.5 group-hover:opacity-0 transition-opacity">
        <p className="text-xs font-medium text-foreground line-clamp-1">{title}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Star className="w-3 h-3 text-accent fill-accent" />
          <span className="text-xs text-muted-foreground">{movie.vote_average?.toFixed(1)}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default MovieCard;
