import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TMDBMovie, tmdbImg, getMovieVideos, getMovieDetails, searchByTitles, getTrendingByType } from '@/lib/tmdb';
import { GENRES } from '@/lib/tmdb';
import { normalizeTitle } from '@/lib/m3u-parser';
import { fetchRandomM3UTitles } from '@/lib/m3u-parser';
import { Dices, Sparkles, Star, Play, Volume2, VolumeX, Loader2, X, SlidersHorizontal, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface CineRoletaProps {
  movies: TMDBMovie[];
  onMovieClick: (movie: TMDBMovie) => void;
  favorites: Set<number>;
  watched: Set<number>;
  onToggleFavorite: (id: number) => void;
  onToggleWatched: (id: number) => void;
  onTrailerWatched?: () => void;
  favoriteMovies?: TMDBMovie[];
}

const CARD_W = 140;
const CARD_H = 210;
const GAP = 12;
const STEP = CARD_W + GAP;
const HISTORY_KEY = 'msc_roleta_history';
const MAX_HISTORY = 20;

const playClickSound = (ctx: AudioContext, volume: number = 0.08) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1200 + Math.random() * 400;
  osc.type = 'sine';
  gain.gain.setValueAtTime(Math.max(0.001, volume), ctx.currentTime);
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

/** Get spin history from sessionStorage */
function getSpinHistory(): number[] {
  try {
    const saved = sessionStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

/** Add to spin history */
function addToSpinHistory(id: number) {
  const history = getSpinHistory();
  history.push(id);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/** Extract favorite genre weights from favorite movies */
function getFavoriteGenreWeights(favoriteMovies: TMDBMovie[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const m of favoriteMovies) {
    for (const gid of (m.genre_ids || [])) {
      counts.set(gid, (counts.get(gid) || 0) + 1);
    }
  }
  return counts;
}

const CineRoleta = ({ movies, onMovieClick, favorites, watched, onToggleFavorite, onToggleWatched, onTrailerWatched, favoriteMovies = [] }: CineRoletaProps) => {
  const { currentClient } = useAuth();
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [result, setResult] = useState<TMDBMovie | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [displayPool, setDisplayPool] = useState<TMDBMovie[]>([]);
  const [showIndicator, setShowIndicator] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  // Year filter state
  const [yearFilter, setYearFilter] = useState<number>(1970);
  const [useYearFilter, setUseYearFilter] = useState(false);

  // "Baseado no que você curtiu" toggle
  const [useGenreBias, setUseGenreBias] = useState(false);

  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailerCreditedRef = useRef(false);

  // Memoize genre weights from favorites
  const favoriteGenreWeights = useMemo(() => getFavoriteGenreWeights(favoriteMovies), [favoriteMovies]);

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
    setShowIndicator(true);

    try {
      // 1. Fetch random titles from the M3U catalog
      const randomTitles = await fetchRandomM3UTitles(100);

      if (randomTitles.length === 0) {
        toast({ title: '⚠️ Catálogo vazio', description: 'Nenhum título encontrado no catálogo M3U. Peça ao seu gestor para importar a lista M3U.', variant: 'destructive' });
        setLoading(false);
        setSpinning(false);
        setShowIndicator(false);
        return;
      }

      // 2. Search TMDB for those M3U titles
      let combined = await searchByTitles(randomTitles, randomTitles.length, mediaType);

      // 2b. Strict media_type filtering
      combined = combined.filter(m => {
        const type = m.media_type || (m.first_air_date && !m.release_date ? 'tv' : 'movie');
        return type === mediaType;
      });

      // 2c. Year filter
      if (useYearFilter) {
        const yearFiltered = combined.filter(m => {
          const dateStr = m.release_date || m.first_air_date;
          if (!dateStr) return true;
          const year = parseInt(dateStr.substring(0, 4), 10);
          return year >= yearFilter;
        });
        if (yearFiltered.length >= 3) combined = yearFiltered;
      }

      // 3. Filter by genre if selected
      if (selectedGenre) {
        const genreFiltered = combined.filter(m => m.genre_ids?.some(g => g === selectedGenre));
        if (genreFiltered.length >= 3) combined = genreFiltered;
      }

      // 4. Filter out items without posters & dedupe
      combined = combined.filter(m => m.poster_path);
      combined = dedupeMovies(combined);

      // 4b. Remove recently spun titles (anti-repetition)
      const history = new Set(getSpinHistory());
      const withoutHistory = combined.filter(m => !history.has(m.id));
      // Only apply if we still have enough titles
      if (withoutHistory.length >= 3) {
        combined = withoutHistory;
      }

      if (combined.length === 0) {
        toast({ title: '🎲 Sem resultados', description: 'Nenhum título encontrado com esses filtros. Tente outro gênero ou ano.', variant: 'destructive' });
        setLoading(false);
        setSpinning(false);
        setShowIndicator(false);
        return;
      }

      // 5. WEIGHTED ALGORITHM with cascading pool fallback
      const trendingList = await getTrendingByType(mediaType);
      const trendingIds = new Set(trendingList.map(t => t.id));
      const trendingNames = new Set(trendingList.map(t => normalizeTitle(t.title || t.name || '')));

      const poolTrending: TMDBMovie[] = [];
      const poolRegular: TMDBMovie[] = [];

      for (const movie of combined) {
        const isTrending = trendingIds.has(movie.id) ||
          trendingNames.has(normalizeTitle(movie.title || movie.name || ''));
        if (isTrending) {
          poolTrending.push(movie);
        } else {
          poolRegular.push(movie);
        }
      }

      console.log(`[CineRoleta] Pools: ${poolTrending.length} trending, ${poolRegular.length} regular (total ${combined.length})`);

      // Cascading pool fallback: pick pool, if empty → next → combined
      const roll = Math.random();
      let winnerPool: TMDBMovie[];

      if (roll < 0.50) {
        // Try trending → regular → combined
        winnerPool = poolTrending.length > 0 ? poolTrending : poolRegular.length > 0 ? poolRegular : combined;
      } else if (roll < 0.85) {
        // Try regular → trending → combined
        winnerPool = poolRegular.length > 0 ? poolRegular : poolTrending.length > 0 ? poolTrending : combined;
      } else {
        winnerPool = combined;
      }

      // Within the chosen pool, use logarithmic vote_average as weight
      // + genre bias from favorites if enabled
      const weights = winnerPool.map(m => {
        let w = Math.log((m.vote_average || 1) + 1); // logarithmic scale

        // Genre bias: boost movies matching favorite genres
        if (useGenreBias && favoriteGenreWeights.size > 0 && m.genre_ids) {
          let genreBoost = 0;
          for (const gid of m.genre_ids) {
            genreBoost += (favoriteGenreWeights.get(gid) || 0);
          }
          // Multiply weight by genre affinity (1 + normalized boost)
          w *= (1 + Math.min(genreBoost * 0.3, 3));
        }

        return Math.max(0.1, w);
      });

      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let pickRoll = Math.random() * totalWeight;
      let winnerIndex = 0;
      for (let i = 0; i < weights.length; i++) {
        pickRoll -= weights[i];
        if (pickRoll <= 0) { winnerIndex = i; break; }
      }
      let winner = winnerPool[winnerIndex];

      // 5b. For TV: validate winner has seasons
      if (mediaType === 'tv') {
        const tried = new Set<number>();
        for (let attempt = 0; attempt < Math.min(5, winnerPool.length); attempt++) {
          const candidate = winnerPool[(winnerIndex + attempt) % winnerPool.length];
          if (tried.has(candidate.id)) continue;
          tried.add(candidate.id);
          try {
            const details = await getMovieDetails(candidate.id, 'tv');
            if (details && (details.number_of_seasons > 0 || details.number_of_episodes > 0)) {
              winner = candidate;
              break;
            }
          } catch {}
        }
      }

      // Save to history (anti-repetition)
      addToSpinHistory(winner.id);

      // Shuffle combined and place winner
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      const combinedWinnerIdx = combined.findIndex(m => m.id === winner.id);
      const finalWinnerIndex = combinedWinnerIdx >= 0 ? combinedWinnerIdx : 0;

      // 6. Update display and wait for render
      setDisplayPool(combined);
      setLoading(false);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 50));

      // 7. Start spinning animation
      setSpinning(true);
      const ctx = getAudioCtx();
      const strip = stripRef.current;
      const container = containerRef.current;
      if (!strip || !container) { setSpinning(false); return; }

      const poolLen = combined.length;
      const deepOccurrence = 3;
      const targetIdx = deepOccurrence * poolLen + finalWinnerIndex;
      const containerW = container.clientWidth;
      const finalX = -(targetIdx * STEP - (containerW / 2 - CARD_W / 2));

      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      void strip.offsetHeight;

      const duration = 5000 + Math.random() * 1000;
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      strip.style.transform = `translateX(${finalX}px)`;

      const spinStartTime = performance.now();
      let lastClickX = 0;

      const checkPosition = () => {
        const elapsed = performance.now() - spinStartTime;
        const progress = Math.min(elapsed / duration, 1);

        const currentTransform = getComputedStyle(strip).transform;
        const matrix = new DOMMatrix(currentTransform);
        const currentX = Math.abs(matrix.m41);

        if (currentX - lastClickX > STEP) {
          const vol = 0.10 * (1 - progress * 0.9);
          playClickSound(ctx, vol);
          lastClickX = currentX - (currentX % STEP);
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(checkPosition);
        }
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
  }, [spinning, loading, selectedGenre, mediaType, movies, getAudioCtx, currentClient?.u, onTrailerWatched, yearFilter, useYearFilter, useGenreBias, favoriteGenreWeights]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    };
  }, []);

  const title = result ? (result.title || result.name || 'Sem título') : '';
  const date = result?.release_date || result?.first_air_date;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          CINE-ROLETA
        </h2>
        <p className="text-muted-foreground text-sm">Não sabe o que assistir? Deixe a sorte decidir!</p>
      </div>

      {/* Media type toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl bg-secondary p-1 gap-1">
          <button
            onClick={() => { if (!spinning && !loading) setMediaType('movie'); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mediaType === 'movie'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎬 Filmes
          </button>
          <button
            onClick={() => { if (!spinning && !loading) setMediaType('tv'); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mediaType === 'tv'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📺 Séries
          </button>
        </div>
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

      {/* Advanced filters: Year slider + Genre bias */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-card border border-border">
        {/* Year filter */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              Ano mínimo
            </label>
            <button
              onClick={() => { if (!spinning && !loading) setUseYearFilter(!useYearFilter); }}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                useYearFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {useYearFilter ? 'Ativo' : 'Inativo'}
            </button>
          </div>
          <div className={`transition-opacity ${useYearFilter ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <Slider
              min={1970}
              max={2026}
              step={1}
              value={[yearFilter]}
              onValueChange={([v]) => setYearFilter(v)}
              disabled={spinning || loading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1970</span>
              <span className="text-foreground font-semibold">{yearFilter}+</span>
              <span>2026</span>
            </div>
          </div>
        </div>

        {/* Genre bias toggle */}
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Heart className="w-4 h-4 text-muted-foreground" />
            Baseado no que você curtiu
          </label>
          <p className="text-xs text-muted-foreground">
            Prioriza gêneros dos seus filmes favoritados
          </p>
          <button
            onClick={() => { if (!spinning && !loading) setUseGenreBias(!useGenreBias); }}
            disabled={favoriteMovies.length === 0}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              useGenreBias && favoriteMovies.length > 0
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground'
            } ${favoriteMovies.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {favoriteMovies.length === 0
              ? 'Favorite filmes para ativar'
              : useGenreBias ? '❤️ Ativo' : 'Inativo'}
          </button>
        </div>
      </div>

      {/* Carousel strip */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl bg-card/50 border border-border"
        style={{ height: CARD_H + 48 }}
      >
        {/* Center indicator */}
        <div
          onClick={() => { if (showResult && result) { setModalOpen(true); setShowTrailer(false); } }}
          className={`absolute z-20 border-2 border-primary rounded-xl transition-all duration-300 ${showResult && result ? 'cursor-pointer' : 'pointer-events-none'}`}
          style={{
            width: CARD_W,
            height: CARD_H,
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            margin: 'auto',
            opacity: spinning || showResult ? 1 : 0,
            boxShadow: spinning || showResult
              ? '0 0 20px hsl(var(--primary) / 0.6), 0 0 40px hsl(var(--primary) / 0.3), inset 0 0 15px hsl(var(--primary) / 0.1)'
              : 'none',
          }}
        />
        {/* Tap hint */}
        {showResult && result && (
          <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-1 text-[10px] text-primary font-semibold animate-pulse pointer-events-none">
            Toque para ver detalhes
          </div>
        )}
        {/* Gradient edges */}
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />

        <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center">
          <div
            ref={stripRef}
            className="flex items-center"
            style={{ willChange: 'transform', gap: GAP }}
          >
            {stripItems.length === 0 ? (
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
      <div className="flex justify-center py-4">
        <button
          onClick={spin}
          disabled={spinning || loading}
          className="group relative h-14 px-10 text-lg font-display rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/50 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 overflow-hidden"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <span className="relative flex items-center gap-3">
            {loading ? (
              <><Loader2 className="w-6 h-6 animate-spin" /> PREPARANDO...</>
            ) : spinning ? (
              <><Dices className="w-6 h-6 animate-spin" /> GIRANDO...</>
            ) : (
              <><Dices className="w-6 h-6" /> {mediaType === 'tv' ? 'SORTEAR SÉRIE' : 'SORTEAR FILME'}</>
            )}
          </span>
        </button>
      </div>

      {/* Modal for result details */}
      <Dialog open={modalOpen} onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) {
          setShowTrailer(false);
          if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
        }
      }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {result && (
            <>
              <div className="relative aspect-video bg-secondary">
                {showTrailer && trailerKey ? (
                   <div className="relative w-full h-full overflow-hidden">
                    <iframe
                      src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1&showinfo=0&controls=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`}
                      className="w-full h-full scale-[1.04] pointer-events-auto"
                      style={{ border: 'none' }}
                      allow="autoplay; encrypted-media"
                      allowFullScreen={false}
                      title={`Trailer - ${title}`}
                    />
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:bg-background transition-colors"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <img
                    src={tmdbImg(result.backdrop_path || result.poster_path, 'w780')}
                    alt={title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="p-5 space-y-3">
                <div>
                  <h3 className="text-xl font-display text-foreground">{title}</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-accent fill-accent" />
                      <span className="text-sm font-semibold text-accent">{result.vote_average?.toFixed(1)}</span>
                    </div>
                    {date && <span className="text-sm text-muted-foreground">{new Date(date).getFullYear()}</span>}
                  </div>
                </div>

                <p className="text-muted-foreground text-sm leading-relaxed line-clamp-4">
                  {result.overview || 'Sem descrição disponível.'}
                </p>

                <div className="flex gap-3 pt-1">
                  {trailerKey && !showTrailer && (
                    <Button
                      onClick={() => {
                        setShowTrailer(true);
                        trailerCreditedRef.current = false;
                        if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
                        trailerTimerRef.current = setTimeout(async () => {
                          if (trailerCreditedRef.current) return;
                          trailerCreditedRef.current = true;
                          if (currentClient?.u) {
                            try {
                              const { data } = await supabase.functions.invoke('trailer-challenge', {
                                method: 'POST',
                                body: { username: currentClient.u, action: 'watch_trailer' },
                              });
                              if (data) {
                                const w = data.trailers_watched || 0;
                                const earned = data.point_earned;
                                toast({
                                  title: '🎬 Trailer assistido!',
                                  description: earned
                                    ? '🔥 +1 ponto! Meta diária completa!'
                                    : `${w}/3 para completar o desafio de hoje`,
                                });
                                onTrailerWatched?.();
                              }
                            } catch { /* silent */ }
                          }
                        }, 30000);
                      }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <Play className="w-4 h-4 mr-2" /> Assistir Trailer
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => onToggleFavorite(result.id)}
                    className={`border-border ${favorites.has(result.id) ? 'bg-primary/10 text-primary border-primary/30' : 'text-foreground'}`}
                  >
                    {favorites.has(result.id) ? '❤️ Favoritado' : '🤍 Favoritar'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CineRoleta;
