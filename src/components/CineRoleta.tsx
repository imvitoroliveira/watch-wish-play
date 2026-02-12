import { useState, useCallback, useRef, useEffect } from 'react';
import { TMDBMovie, tmdbImg, getMovieVideos, searchByTitles, getByGenre } from '@/lib/tmdb';
import { GENRES } from '@/lib/tmdb';
import { fetchRandomM3UTitles } from '@/lib/m3u-parser';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Sparkles, Star, Play, CheckCircle, X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface CineRoletaProps {
  movies: TMDBMovie[];
  onMovieClick: (movie: TMDBMovie) => void;
  favorites: Set<number>;
  watched: Set<number>;
  onToggleFavorite: (id: number) => void;
  onToggleWatched: (id: number) => void;
}

const CARD_W = 140;
const CARD_H = 210;
const GAP = 12;
const STEP = CARD_W + GAP;

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

const playSuccessSound = (ctx: AudioContext) => {
  const notes = [523.25, 659.25, 783.99, 1046.5];
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

/** Deduplicate movies by id */
function dedupeMovies(movies: TMDBMovie[]): TMDBMovie[] {
  const seen = new Set<number>();
  return movies.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

const CineRoleta = ({ movies, onMovieClick, favorites, watched, onToggleFavorite, onToggleWatched }: CineRoletaProps) => {
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [result, setResult] = useState<TMDBMovie | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  // The actual pool used for current spin (rendered directly, not via state for timing)
  const [displayPool, setDisplayPool] = useState<TMDBMovie[]>([]);

  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  // Initialize display pool from trending
  useEffect(() => {
    if (movies.length > 0 && displayPool.length === 0) {
      setDisplayPool(movies);
    }
  }, [movies]);

  // Build repeated strip for visual carousel
  const buildStrip = (pool: TMDBMovie[]) => {
    if (pool.length === 0) return [];
    const repeated: TMDBMovie[] = [];
    const count = Math.max(80, pool.length * 4);
    for (let i = 0; i < count; i++) {
      repeated.push(pool[i % pool.length]);
    }
    return repeated;
  };

  const stripItems = buildStrip(displayPool.length > 0 ? displayPool : movies);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const spin = useCallback(async () => {
    if (spinning || loading) return;

    setLoading(true);
    setResult(null);
    setShowResult(false);
    setTrailerKey(null);

    try {
      // 1. Fetch 50 random titles from the full M3U catalog
      const randomTitles = await fetchRandomM3UTitles(50);

      // 2. Search TMDB for those titles
      const m3uMovies = randomTitles.length > 0
        ? await searchByTitles(randomTitles, randomTitles.length)
        : [];

      // 3. Get trending movies (already have them as prop)
      let trendingPool = [...movies];

      // 4. If genre selected, also fetch TMDB discover for that genre
      if (selectedGenre) {
        const genreMovies = await getByGenre(selectedGenre);
        trendingPool = [...trendingPool, ...genreMovies];
      }

      // 5. Combine and filter by genre if selected
      let combined = dedupeMovies([...m3uMovies, ...trendingPool]);

      if (selectedGenre) {
        const genreFiltered = combined.filter(m => m.genre_ids?.some(g => g === selectedGenre));
        if (genreFiltered.length >= 5) combined = genreFiltered;
      }

      // Filter out movies without posters
      combined = combined.filter(m => m.poster_path);

      if (combined.length === 0) {
        setLoading(false);
        return;
      }

      // Shuffle for variety
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }

      // 6. Pick winner
      const winnerIndex = Math.floor(Math.random() * combined.length);
      const winner = combined[winnerIndex];

      // 7. Update display and wait for render
      setDisplayPool(combined);
      setLoading(false);

      // Wait for DOM to update with new pool
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 50));

      // 8. Start spinning animation
      setSpinning(true);
      const ctx = getAudioCtx();
      const strip = stripRef.current;
      const container = containerRef.current;
      if (!strip || !container) { setSpinning(false); return; }

      // Calculate where the winner lands in the repeated strip
      // The strip repeats `combined`, so occurrence N of winnerIndex is at position: N * combined.length + winnerIndex
      const poolLen = combined.length;
      const deepOccurrence = 3; // Land on the 3rd repetition for a long spin
      const targetIdx = deepOccurrence * poolLen + winnerIndex;
      const containerW = container.clientWidth;
      // Center the target card: offset = targetIdx * STEP, center = containerW/2 - CARD_W/2
      const finalX = -(targetIdx * STEP - (containerW / 2 - CARD_W / 2));

      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      void strip.offsetHeight;

      const duration = 4000 + Math.random() * 1500;
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.8, 0.2, 1)`;
      strip.style.transform = `translateX(${finalX}px)`;

      // Click sounds
      let clickCount = 0;
      let lastClickX = 0;

      const checkPosition = () => {
        if (clickCount >= 40) return;
        const currentTransform = getComputedStyle(strip).transform;
        const matrix = new DOMMatrix(currentTransform);
        const currentX = Math.abs(matrix.m41);
        if (currentX - lastClickX > STEP) {
          playClickSound(ctx);
          lastClickX = currentX - (currentX % STEP);
          clickCount++;
        }
        animFrameRef.current = requestAnimationFrame(checkPosition);
      };
      animFrameRef.current = requestAnimationFrame(checkPosition);

      setTimeout(() => {
        cancelAnimationFrame(animFrameRef.current);
        setSpinning(false);
        setResult(winner);
        setShowResult(true);
        playSuccessSound(ctx);

        const type = winner.media_type === 'tv' ? 'tv' : 'movie';
        getMovieVideos(winner.id, type).then(key => setTrailerKey(key));
      }, duration + 100);
    } catch (e) {
      console.error('[CineRoleta] Error:', e);
      setLoading(false);
      setSpinning(false);
    }
  }, [spinning, loading, selectedGenre, movies, getAudioCtx]);

  useEffect(() => {
    return () => { cancelAnimationFrame(animFrameRef.current); };
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
              onClick={() => { if (!spinning && !loading) setSelectedGenre(selectedGenre === g.id ? null : g.id); }}
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
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl bg-card/50 border border-border"
        style={{ height: CARD_H + 48 }} /* card + vertical padding */
      >
        {/* Center indicator — perfectly sized to frame one card */}
        <div
          className="absolute z-20 pointer-events-none border-2 border-primary rounded-xl"
          style={{
            width: CARD_W + 4,
            height: CARD_H + 4,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 15px hsl(var(--primary) / 0.5), 0 0 30px hsl(var(--primary) / 0.25), inset 0 0 15px hsl(var(--primary) / 0.1)',
          }}
        />
        {/* Gradient edges */}
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />

        <div
          className="absolute top-0 bottom-0 left-0 right-0 flex items-center"
        >
          <div
            ref={stripRef}
            className="flex items-center"
            style={{ willChange: 'transform', gap: GAP }}
          >
            {stripItems.length === 0 ? (
              // Skeleton loading for carousel
              Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="flex-shrink-0 rounded-lg overflow-hidden"
                  style={{ width: CARD_W, height: CARD_H }}
                >
                  <Skeleton className="w-full h-full" />
                </div>
              ))
            ) : (
              stripItems.map((movie, i) => (
                <div
                  key={`${movie.id}-${i}`}
                  className="flex-shrink-0 rounded-lg overflow-hidden"
                  style={{ width: CARD_W, height: CARD_H }}
                >
                  <img
                    src={tmdbImg(movie.poster_path, 'w200')}
                    alt={movie.title || movie.name || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Spin button */}
      <div className="text-center py-2">
        <button
          onClick={spin}
          disabled={spinning || loading}
          className="relative h-16 px-14 text-xl font-display rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? (
            <><Loader2 className="w-7 h-7 inline mr-3 animate-spin" /> PREPARANDO...</>
          ) : spinning ? (
            <><Dices className="w-7 h-7 inline mr-3 animate-spin" /> GIRANDO...</>
          ) : (
            <><Dices className="w-7 h-7 inline mr-3" /> 🎬 SORTEAR FILME!</>
          )}
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
              <button
                onClick={() => setShowResult(false)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:bg-background transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-display text-foreground">{title}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-accent fill-accent" />
                      <span className="text-sm font-semibold text-accent">{result.vote_average?.toFixed(1)}</span>
                    </div>
                    {date && <span className="text-sm text-muted-foreground">{new Date(date).getFullYear()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-semibold shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  Disponível no seu Aplicativo
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed">
                {result.overview || 'Sem descrição disponível.'}
              </p>

              <div className="flex gap-3 pt-2">
                <Button onClick={() => onMovieClick(result)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
