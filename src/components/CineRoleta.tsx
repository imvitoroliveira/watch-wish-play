import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TMDBMovie, tmdbImg, getMovieVideos } from '@/lib/tmdb';
import { GENRES } from '@/lib/tmdb';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Sparkles, Star, Play, CheckCircle, X, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CineRoletaProps {
  movies: TMDBMovie[];
  onMovieClick: (movie: TMDBMovie) => void;
  favorites: Set<number>;
  watched: Set<number>;
  onToggleFavorite: (id: number) => void;
  onToggleWatched: (id: number) => void;
}

// Generate a click sound using Web Audio API
const playClickSound = (ctx: AudioContext) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1200 + Math.random() * 400;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
};

// Generate a success sound
const playSuccessSound = (ctx: AudioContext) => {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    const t = ctx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  });
};

const CineRoleta = ({ movies, onMovieClick, favorites, watched, onToggleFavorite, onToggleWatched }: CineRoletaProps) => {
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [result, setResult] = useState<TMDBMovie | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const stripRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  // Build a long repeated strip of posters for the carousel
  const pool = useMemo(() => {
    if (selectedGenre) {
      const filtered = movies.filter(m => m.genre_ids?.some(g => g === selectedGenre));
      return filtered.length > 0 ? filtered : movies;
    }
    return movies;
  }, [movies, selectedGenre]);

  // Create a repeated array for the visual strip (needs enough items to look continuous)
  const stripItems = useMemo(() => {
    if (pool.length === 0) return [];
    const repeated: TMDBMovie[] = [];
    const repeatCount = Math.max(60, pool.length * 3);
    for (let i = 0; i < repeatCount; i++) {
      repeated.push(pool[i % pool.length]);
    }
    return repeated;
  }, [pool]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const spin = useCallback(() => {
    if (pool.length === 0 || spinning) return;

    setSpinning(true);
    setResult(null);
    setShowResult(false);
    setTrailerKey(null);

    const ctx = getAudioCtx();
    const strip = stripRef.current;
    if (!strip) return;

    // Pick winner
    const winnerIndex = Math.floor(Math.random() * pool.length);
    const winner = pool[winnerIndex];

    // Card width + gap
    const cardW = 140;
    const gap = 12;
    const step = cardW + gap;

    // Target position: land on the winner somewhere in the middle of the strip
    // We want to spin through many items, so pick an occurrence deep in the strip
    const targetOccurrence = 40 + winnerIndex; // deep enough for a long spin
    const targetOffset = targetOccurrence * step;
    // Center the winner in the viewport
    const containerW = strip.parentElement?.clientWidth || 600;
    const finalX = -(targetOffset - containerW / 2 + cardW / 2);

    // Reset position
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';

    // Force reflow
    void strip.offsetHeight;

    // Animate with CSS transition (cubic-bezier for deceleration)
    const duration = 4000 + Math.random() * 1000;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.25, 1)`;
    strip.style.transform = `translateX(${finalX}px)`;

    // Click sounds during spin
    let clickCount = 0;
    const totalClicks = 30;
    let lastClickX = 0;

    const checkPosition = () => {
      if (clickCount >= totalClicks) return;
      const currentTransform = getComputedStyle(strip).transform;
      const matrix = new DOMMatrix(currentTransform);
      const currentX = Math.abs(matrix.m41);

      // Play click every time we pass a card width
      if (currentX - lastClickX > step) {
        playClickSound(ctx);
        lastClickX = currentX - (currentX % step);
        clickCount++;
      }

      animFrameRef.current = requestAnimationFrame(checkPosition);
    };
    animFrameRef.current = requestAnimationFrame(checkPosition);

    // When animation ends
    setTimeout(() => {
      cancelAnimationFrame(animFrameRef.current);
      setSpinning(false);
      setResult(winner);
      setShowResult(true);

      // Success sound
      playSuccessSound(ctx);

      // Fetch trailer
      const type = winner.media_type === 'tv' ? 'tv' : 'movie';
      getMovieVideos(winner.id, type).then(key => setTrailerKey(key));
    }, duration + 100);
  }, [pool, spinning, getAudioCtx]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const title = result ? (result.title || result.name || 'Sem título') : '';
  const date = result?.release_date || result?.first_air_date;

  return (
    <div className="space-y-8">
      {/* Header */}
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
              onClick={() => { if (!spinning) setSelectedGenre(selectedGenre === g.id ? null : g.id); }}
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

      {/* Carousel strip */}
      <div className="relative overflow-hidden rounded-2xl bg-card/50 border border-border py-6">
        {/* Center indicator */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[148px] border-2 border-primary/60 rounded-xl z-10 pointer-events-none shadow-[0_0_30px_rgba(var(--primary),0.3)]" />
        {/* Gradient edges */}
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-card/90 to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-card/90 to-transparent z-10 pointer-events-none" />

        <div className="overflow-hidden px-4">
          <div
            ref={stripRef}
            className="flex gap-3"
            style={{ willChange: 'transform' }}
          >
            {stripItems.map((movie, i) => (
              <div
                key={`${movie.id}-${i}`}
                className="flex-shrink-0 w-[140px] rounded-lg overflow-hidden"
              >
                <img
                  src={tmdbImg(movie.poster_path, 'w200')}
                  alt={movie.title || movie.name || ''}
                  className="w-full h-[210px] object-cover rounded-lg"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spin button */}
      <div className="text-center py-2">
        <button
          onClick={spin}
          disabled={spinning || pool.length === 0}
          className="relative h-16 px-14 text-xl font-display rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Dices className={`w-7 h-7 inline mr-3 ${spinning ? 'animate-spin' : ''}`} />
          {spinning ? 'GIRANDO...' : '🎬 SORTEAR FILME!'}
        </button>
      </div>

      {/* Result section with trailer */}
      <AnimatePresence mode="wait">
        {showResult && result && (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="rounded-2xl bg-card border border-border overflow-hidden shadow-2xl"
          >
            {/* Trailer or backdrop */}
            <div className="relative aspect-video bg-secondary">
              {trailerKey ? (
                <div className="relative w-full h-full">
                  <iframe
                    src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1`}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    title={`Trailer - ${title}`}
                  />
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="absolute bottom-4 right-4 z-10 w-10 h-10 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:bg-background transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <img
                  src={tmdbImg(result.backdrop_path || result.poster_path, 'w780')}
                  alt={title}
                  className="w-full h-full object-cover"
                />
              )}
              {/* Close result */}
              <button
                onClick={() => setShowResult(false)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:bg-background transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Movie info */}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-display text-foreground">{title}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-accent fill-accent" />
                      <span className="text-sm font-semibold text-accent">{result.vote_average?.toFixed(1)}</span>
                    </div>
                    {date && (
                      <span className="text-sm text-muted-foreground">{new Date(date).getFullYear()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/15 text-green-400 text-xs font-semibold shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  Disponível no seu Aplicativo
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed">
                {result.overview || 'Sem descrição disponível.'}
              </p>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => onMovieClick(result)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Play className="w-4 h-4 mr-2" /> Ver Detalhes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onToggleFavorite(result.id)}
                  className={`border-border ${favorites.has(result.id) ? 'bg-primary/10 text-primary border-primary/30' : 'text-foreground'}`}
                >
                  {favorites.has(result.id) ? '❤️ Favoritado' : '🤍 Favoritar'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CineRoleta;
