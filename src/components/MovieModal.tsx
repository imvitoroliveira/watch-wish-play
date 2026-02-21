import { useEffect, useState, useRef, useCallback } from 'react';
import { TMDBMovie, tmdbImg, tmdbBackdrop, getMovieVideos } from '@/lib/tmdb';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Heart, Check, Calendar, Tv, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import Hls from 'hls.js';

interface MovieModalProps {
  movie: TMDBMovie | null;
  onClose: () => void;
  isFavorite?: boolean;
  isWatched?: boolean;
  onToggleFavorite?: () => void;
  onToggleWatched?: () => void;
  onTrailerWatched?: () => void;
  availability?: 'available' | 'soon' | 'unknown';
}

const MovieModal = ({ movie, onClose, isFavorite, isWatched, onToggleFavorite, onToggleWatched, onTrailerWatched, availability }: MovieModalProps) => {
  const { currentClient } = useAuth();
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailerCreditedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (movie) {
      const type = movie.media_type === 'tv' ? 'tv' : 'movie';
      getMovieVideos(movie.id, type).then(key => setTrailerKey(key));
    }
    return () => {
      setTrailerKey(null);
      setShowTrailer(false);
      setShowStream(false);
      setStreamUrl(null);
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
      trailerCreditedRef.current = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [movie]);

  // Attach HLS when stream URL is ready
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;

    if (streamUrl.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          toast({ title: '❌ Erro no stream', description: 'Não foi possível reproduzir. Tente novamente.' });
          setShowStream(false);
          setStreamUrl(null);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = streamUrl;
      video.play().catch(() => {});
    } else {
      // Direct MP4 or other format
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  const handlePlayTrailer = useCallback(() => {
    setShowTrailer(true);
    setShowStream(false);
    trailerCreditedRef.current = false;
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
            const watched = data.trailers_watched || 0;
            const earned = data.point_earned;
            toast({
              title: '🎬 Trailer assistido!',
              description: earned
                ? '🔥 +1 ponto! Meta diária completa!'
                : `${watched}/3 para completar o desafio de hoje`,
            });
            onTrailerWatched?.();
          }
        } catch { /* silent */ }
      }
    }, 30000);
  }, [currentClient?.u, onTrailerWatched]);

  const handleWatchNow = useCallback(async () => {
    if (!movie) return;
    const title = movie.title || movie.name || '';
    setStreamLoading(true);
    setShowTrailer(false);

    try {
      const { data, error } = await supabase.functions.invoke('stream-lookup', {
        method: 'POST',
        body: { title },
      });

      if (error || !data?.stream_url) {
        toast({
          title: '😕 Stream não encontrado',
          description: 'Não foi possível localizar este conteúdo no catálogo M3U.',
        });
        setStreamLoading(false);
        return;
      }

      setStreamUrl(data.stream_url);
      setShowStream(true);
    } catch {
      toast({
        title: '❌ Erro',
        description: 'Falha ao buscar o stream. Tente novamente.',
      });
    } finally {
      setStreamLoading(false);
    }
  }, [movie]);

  if (!movie) return null;

  const title = movie.title || movie.name || 'Sem título';
  const date = movie.release_date || movie.first_air_date;
  const backdrop = tmdbBackdrop(movie.backdrop_path);
  const isAvailable = availability === 'available';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 25 }}
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Media area */}
          <div className="relative aspect-video bg-secondary overflow-hidden">
            {showStream && streamUrl ? (
              <video
                ref={videoRef}
                className="w-full h-full bg-black"
                controls
                autoPlay
                playsInline
              />
            ) : showTrailer && trailerKey ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={`Trailer - ${title}`}
              />
            ) : (
              <>
                <img
                  src={backdrop || tmdbImg(movie.poster_path, 'w780')}
                  alt={title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                {trailerKey && (
                  <button
                    onClick={handlePlayTrailer}
                    className="absolute inset-0 flex items-center justify-center group"
                  >
                    <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center glow-red group-hover:scale-110 transition-transform">
                      <Play className="w-8 h-8 text-primary-foreground ml-1" />
                    </div>
                  </button>
                )}
              </>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/80 flex items-center justify-center text-foreground hover:bg-background transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Info */}
          <div className="p-6">
            <h2 className="text-3xl font-display text-foreground mb-2">{title}</h2>

            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-accent fill-accent" />
                <span className="text-sm font-semibold text-accent">{movie.vote_average?.toFixed(1)}</span>
              </div>
              {date && (
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(date).getFullYear()}</span>
                </div>
              )}
              <span className="text-xs uppercase px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                {movie.media_type === 'tv' ? 'Série' : 'Filme'}
              </span>
              {isAvailable && (
                <span className="text-xs uppercase px-2 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-600/30">
                  Disponível
                </span>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed mb-6">{movie.overview || 'Sem descrição disponível.'}</p>

            <div className="flex gap-3 flex-wrap">
              {/* ASSISTIR AGORA - only when available in M3U */}
              {isAvailable && (
                <Button
                  onClick={handleWatchNow}
                  disabled={streamLoading || showStream}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-600/30"
                >
                  {streamLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Tv className="w-4 h-4 mr-2" />
                  )}
                  {streamLoading ? 'Buscando...' : showStream ? 'Reproduzindo' : 'Assistir Agora'}
                </Button>
              )}
              {trailerKey && !showTrailer && !showStream && (
                <Button onClick={handlePlayTrailer} className="bg-primary hover:bg-primary/90 text-primary-foreground glow-red">
                  <Play className="w-4 h-4 mr-2" /> Assistir Trailer
                </Button>
              )}
              {onToggleFavorite && (
                <Button
                  variant="outline"
                  onClick={onToggleFavorite}
                  className={`border-border ${isFavorite ? 'bg-primary/10 text-primary border-primary/30' : 'text-foreground'}`}
                >
                  <Heart className={`w-4 h-4 mr-2 ${isFavorite ? 'fill-current text-primary' : ''}`} />
                  {isFavorite ? 'Favoritado' : 'Favoritar'}
                </Button>
              )}
              {onToggleWatched && (
                <Button
                  variant="outline"
                  onClick={onToggleWatched}
                  className={`border-border ${isWatched ? 'bg-green-600/10 text-green-400 border-green-600/30' : 'text-foreground'}`}
                >
                  <Check className={`w-4 h-4 mr-2 ${isWatched ? 'text-green-400' : ''}`} />
                  {isWatched ? 'Assistido' : 'Marcar Assistido'}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MovieModal;
