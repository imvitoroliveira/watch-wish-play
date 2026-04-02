import { useEffect, useState, useRef, useCallback } from 'react';
import { TMDBMovie, tmdbImg, tmdbBackdrop, getMovieVideos } from '@/lib/tmdb';
import { buildProxyUrl } from '@/lib/m3u-client-parser';
import { normalizeTitle } from '@/lib/m3u-parser';
import VideoPlayer from '@/components/VideoPlayer';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Heart, Check, Calendar, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// 🛠️ FUNÇÃO AUXILIAR DE EXTRAÇÃO (ISOLADA PARA EVITAR ERROS DE ESCOPO)
const getCredentialsFromM3uUrl = (urlStr: string) => {
  if (!urlStr) return null;
  try {
    const url = new URL(urlStr);
    const user = url.searchParams.get('username') || url.searchParams.get('user');
    const pass = url.searchParams.get('password') || url.searchParams.get('pass');
    
    if (!user || !pass) return null;

    return {
      domain: url.origin,
      user,
      pass
    };
  } catch (e) { 
    return null; 
  }
};

interface MovieModalProps {
  movie: TMDBMovie | null;
  onClose: () => void;
  isFavorite?: boolean;
  isWatched?: boolean;
  onToggleFavorite?: () => void;
  onToggleWatched?: () => void;
  onTrailerWatched?: () => void;
  availability?: 'available' | 'soon' | 'unknown';
  m3uNormalized?: Map<string, { id: string, isSeries: boolean }>;
}

const MovieModal = ({ 
  movie, 
  onClose, 
  isFavorite, 
  isWatched, 
  onToggleFavorite, 
  onToggleWatched, 
  onTrailerWatched, 
  availability, 
  m3uNormalized 
}: MovieModalProps) => {
  const { currentClient } = useAuth();
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  
  const [isPlayingStream, setIsPlayingStream] = useState(false);
  const [selectedStreamUrl, setSelectedStreamUrl] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seriesEpisodes, setSeriesEpisodes] = useState<{episode: number, season: number, url: string}[]>([]);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailerCreditedRef = useRef(false);

  // Efeito para carregar trailer e resetar estados ao mudar o filme
  useEffect(() => {
    if (movie) {
      const type = movie.media_type === 'tv' ? 'tv' : 'movie';
      getMovieVideos(movie.id, type).then(key => setTrailerKey(key));
    }
    return () => {
      setTrailerKey(null);
      setShowTrailer(false);
      setIsPlayingStream(false);
      setSelectedStreamUrl(null);
      setSeriesEpisodes([]);
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
      trailerCreditedRef.current = false;
    };
  }, [movie]);

  const handlePlayTrailer = useCallback(() => {
    setShowTrailer(true);
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

  if (!movie) return null;

  const title = movie.title || movie.name || 'Sem título';
  const date = movie.release_date || movie.first_air_date;
  const backdrop = tmdbBackdrop(movie.backdrop_path);
  const isAvailable = availability === 'available';

  // 📡 RESOLUÇÃO DE STREAM (LOGICA SENIOR)
  const clientM3uUrl = currentClient?.m3u || localStorage.getItem('msc_m3u_url') || '';
  const credentials = getCredentialsFromM3uUrl(clientM3uUrl);
  
  // Mapeia o título para o item do catálogo M3U
  const m3uItem = m3uNormalized?.get(normalizeTitle(title)) || 
                 m3uNormalized?.get(normalizeTitle((movie as any).original_title || (movie as any).original_name || ''));

  let movieStreamUrl = null;
  if (m3uItem && m3uItem.id && credentials) {
    if (m3uItem.id.startsWith('http')) {
      movieStreamUrl = m3uItem.id
        .replace(/\[USER\]/g, credentials.user)
        .replace(/\[PASS\]/g, credentials.pass);
    } else if (!m3uItem.isSeries) {
      // Padrão XTream: /movie/u/p/id.mp4
      movieStreamUrl = `${credentials.domain}/movie/${credentials.user}/${credentials.pass}/${m3uItem.id}.mp4`;
    }
  }

  // Debug de resolução para evitar ficar "no escuro"
  useEffect(() => {
    if (movie && isAvailable) {
      console.log(`--- [DEBUG-STREAM] Resolvendo: ${title} ---`);
      console.log('Catálogo Match:', m3uItem ? '✅' : '❌');
      if (m3uItem) console.log('Stream ID:', m3uItem.id);
      console.log('Credenciais:', credentials ? '✅' : '❌ (Faltam dados na URL M3U)');
      console.log('URL Final:', movieStreamUrl || 'Não gerada');
      console.log('------------------------------------------');
    }
  }, [movie, isAvailable, m3uItem, credentials, movieStreamUrl]);

  // 📺 BUSCA DE EPISÓDIOS PARA SÉRIES
  useEffect(() => {
    const shouldFetchSeries = movie.media_type === 'tv' && m3uItem?.isSeries && m3uItem.id && credentials;
    if (shouldFetchSeries) {
      setIsSeriesLoading(true);
      const infoUrl = buildProxyUrl(`${credentials.domain}/player_api.php?username=${credentials.user}&password=${credentials.pass}&action=get_series_info&series_id=${m3uItem.id}`);
      
      fetch(infoUrl)
        .then(r => r.json())
        .then(data => {
          if (data && data.episodes) {
            const eps: {episode: number, season: number, url: string}[] = [];
            Object.entries(data.episodes).forEach(([seasonNum, episodesArr]) => {
              (episodesArr as any[]).forEach(ep => {
                const sUrl = `${credentials.domain}/series/${credentials.user}/${credentials.pass}/${ep.id}.${ep.container_extension || 'mkv'}`;
                eps.push({
                  episode: Number(ep.episode_num),
                  season: Number(seasonNum),
                  url: sUrl
                });
              });
            });
            setSeriesEpisodes(eps.sort((a,b) => a.season - b.season || a.episode - b.episode));
            if (eps.length > 0) setSelectedSeason(eps[0].season);
          }
        })
        .catch(err => console.error('[ERROR] Falha ao carregar info da série:', err))
        .finally(() => setIsSeriesLoading(false));
    }
  }, [movie, m3uItem, credentials]);

  const availableSeasons = [...new Set(seriesEpisodes.map(ep => ep.season))].sort((a,b) => a-b);
  const currentSeasonEpisodes = seriesEpisodes.filter(ep => ep.season === selectedSeason);

  const handlePlayStream = (url: string) => {
    setShowTrailer(false);
    setSelectedStreamUrl(url);
    setIsPlayingStream(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border/50 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Top Media Area */}
          <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center group">
            {isPlayingStream && selectedStreamUrl ? (
              <VideoPlayer src={selectedStreamUrl} poster={backdrop} />
            ) : showTrailer && trailerKey ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            ) : (
              <>
                <img src={backdrop || tmdbImg(movie.poster_path, 'w1280')} alt={title} className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                {trailerKey && !isPlayingStream && (
                  <button onClick={handlePlayTrailer} className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center glow-red scale-100 hover:scale-110 transition-transform shadow-2xl">
                      <Play className="w-8 h-8 text-primary-foreground fill-current ml-1" />
                    </div>
                  </button>
                )}
              </>
            )}

            <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-background/50 backdrop-blur-md flex items-center justify-center text-foreground hover:bg-background transition-colors z-20">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Info */}
          <div className="p-8">
            <h2 className="text-4xl font-display text-foreground mb-3">{title}</h2>
            
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
                <Star className="w-4 h-4 text-accent fill-accent" />
                <span className="text-sm font-bold text-accent">{movie.vote_average?.toFixed(1)}</span>
              </div>
              {date && (
                <div className="flex items-center gap-1.5 text-muted-foreground bg-secondary/30 px-3 py-1 rounded-full text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(date).getFullYear()}</span>
                </div>
              )}
              <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                {movie.media_type === 'tv' ? 'Série' : 'Filme'}
              </span>
              {isAvailable && (
                <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  Assista Agora
                </span>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed text-lg mb-8 max-w-2xl">{movie.overview || 'Sinopse não disponível para este título.'}</p>

            {/* Séries: Grid de Episódios */}
            {movie.media_type === 'tv' && seriesEpisodes.length > 0 && (
              <div className="mb-8 p-6 rounded-2xl bg-secondary/20 border border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MonitorPlay className="w-5 h-5 text-accent" /> Episódios
                  </h3>
                  <select 
                    value={selectedSeason} 
                    onChange={e => setSelectedSeason(Number(e.target.value))}
                    className="bg-background border border-border text-sm rounded-lg px-3 py-1.5"
                  >
                    {availableSeasons.map(s => <option key={s} value={s}>Temporada {s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {currentSeasonEpisodes.map(ep => (
                    <Button 
                      key={ep.url} 
                      variant={selectedStreamUrl === ep.url ? "default" : "outline"} 
                      onClick={() => handlePlayStream(ep.url)}
                      className="h-10 text-xs font-medium"
                    >
                      EP {String(ep.episode).padStart(2, '0')}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 flex-wrap">
              {movie.media_type !== 'tv' && movieStreamUrl && !isPlayingStream && (
                <Button onClick={() => handlePlayStream(movieStreamUrl)} className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 h-12 text-lg font-bold shadow-lg glow-accent">
                  <Play className="w-5 h-5 mr-3 fill-current" /> Assistir Agora
                </Button>
              )}

              {onToggleFavorite && (
                <Button variant="outline" onClick={onToggleFavorite} className={`h-12 px-6 border-border/50 ${isFavorite ? 'bg-primary/10 text-primary' : ''}`}>
                  <Heart className={`w-5 h-5 mr-2 ${isFavorite ? 'fill-current' : ''}`} />
                  {isFavorite ? 'Na Lista' : 'Minha Lista'}
                </Button>
              )}
              
              {onToggleWatched && (
                <Button variant="outline" onClick={onToggleWatched} className={`h-12 px-6 border-border/50 ${isWatched ? 'bg-green-500/10 text-green-400' : ''}`}>
                  <Check className="w-5 h-5 mr-2" />
                  {isWatched ? 'Visto' : 'Marcar Visto'}
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
