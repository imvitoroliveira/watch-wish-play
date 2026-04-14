import { useEffect, useState, useRef, useCallback } from 'react';
import { TMDBMovie, tmdbImg, tmdbBackdrop, getMovieVideos, getSeasonDetails } from '@/lib/tmdb';
import { buildProxyUrl, getCredentialsFromM3uUrl } from '@/lib/m3u-client-parser';
import { normalizeTitle } from '@/lib/m3u-parser';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Heart, Check, Calendar, MonitorPlay, Minimize2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVideo } from '@/contexts/VideoContext';
import { toast } from '@/hooks/use-toast';

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
  const { playVideo, minimize } = useVideo();

  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seriesEpisodes, setSeriesEpisodes] = useState<{ episode: number, season: number, url: string }[]>([]);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  const [seasonMetadata, setSeasonMetadata] = useState<any>(null);
  const [isSeasonLoading, setIsSeasonLoading] = useState(false);

  // 🆕 Stream lookup fallback: busca URL via edge function quando credenciais locais falham
  const [lookupStreamUrl, setLookupStreamUrl] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);

  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailerCreditedRef = useRef(false);

  // Carrega trailer e reseta estados quando o filme muda
  useEffect(() => {
    if (movie) {
      const type = movie.media_type === 'tv' ? 'tv' : 'movie';
      getMovieVideos(movie.id, type).then(key => setTrailerKey(key));
    }
    return () => {
      setTrailerKey(null);
      setShowTrailer(false);
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

  // 📡 RESOLUÇÃO DE STREAM
  const clientM3uUrl = currentClient?.m3u || localStorage.getItem('msc_m3u_url') || '';
  const credentials = getCredentialsFromM3uUrl(clientM3uUrl);

  // Mapeia o título para o item do catálogo M3U (priorizando o exato vindo do CatalogUpdates se existir)
  const exactM3uTitle = (movie as any)._exactM3uTitle;
  const m3uItem = (exactM3uTitle && m3uNormalized?.get(normalizeTitle(exactM3uTitle))) ||
    m3uNormalized?.get(normalizeTitle(title)) ||
    m3uNormalized?.get(normalizeTitle((movie as any).original_title || (movie as any).original_name || ''));

  let movieStreamUrl: string | null = null;
  if (m3uItem && m3uItem.id && m3uItem.id !== '0' && credentials) {
    if (m3uItem.id.startsWith('http')) {
      movieStreamUrl = m3uItem.id
        .replace(/\[USER\]/g, credentials.user)
        .replace(/\[PASS\]/g, credentials.pass);
    } else if (!m3uItem.isSeries) {
      // Padrão XTream: /movie/u/p/id - Removemos o .mp4 hardcoded porque o servidor resolve nátivamente a extensão (ex: .mkv) sem dar erro 406 de formato.
      movieStreamUrl = `${credentials.domain}/movie/${credentials.user}/${credentials.pass}/${m3uItem.id}`;
    }
  }

  // 🆕 FALLBACK: Se o filme está no catálogo mas não conseguimos montar a URL localmente,
  // chamamos o stream-lookup edge function que faz stream-parse do M3U original no servidor
  // e retorna a URL real do stream. Isso resolve o problema de credenciais/IDs faltando.
  const finalStreamUrl = movieStreamUrl || lookupStreamUrl;

  useEffect(() => {
    // Só faz lookup se: filme disponível, sem URL local montada, e ainda não tentou
    if (!movie || !isAvailable || movieStreamUrl || lookupAttempted || movie.media_type === 'tv') return;

    const doLookup = async () => {
      setIsLookupLoading(true);
      setLookupAttempted(true);
      console.log(`[STREAM-LOOKUP] Buscando URL para: "${title}"`);
      try {
        const { data, error } = await supabase.functions.invoke('stream-lookup', {
          body: { title: title },
        });
        if (!error && data?.stream_url) {
          console.log(`[STREAM-LOOKUP] ✅ URL encontrada:`, data.stream_url.substring(0, 80));
          setLookupStreamUrl(data.stream_url);
        } else {
          // Tenta com nome original (inglês)
          const originalTitle = (movie as any).original_title || (movie as any).original_name;
          if (originalTitle && originalTitle !== title) {
            console.log(`[STREAM-LOOKUP] Tentando nome original: "${originalTitle}"`);
            const { data: data2 } = await supabase.functions.invoke('stream-lookup', {
              body: { title: originalTitle },
            });
            if (data2?.stream_url) {
              console.log(`[STREAM-LOOKUP] ✅ URL encontrada (original):`, data2.stream_url.substring(0, 80));
              setLookupStreamUrl(data2.stream_url);
            } else {
              console.log(`[STREAM-LOOKUP] ❌ Nenhuma URL encontrada`);
            }
          } else {
            console.log(`[STREAM-LOOKUP] ❌ Nenhuma URL encontrada`);
          }
        }
      } catch (err) {
        console.error('[STREAM-LOOKUP] Erro:', err);
      } finally {
        setIsLookupLoading(false);
      }
    };
    doLookup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, isAvailable, movieStreamUrl]);

  // Reset lookup when movie changes
  useEffect(() => {
    setLookupStreamUrl(null);
    setLookupAttempted(false);
    setIsLookupLoading(false);
  }, [movie?.id]);

  // Log de diagnóstico
  useEffect(() => {
    if (movie && isAvailable) {
      console.log(`--- [DEBUG-STREAM] Resolvendo: ${title} ---`);
      console.log('Catálogo Match:', m3uItem ? '✅' : '❓ (Tentando busca por nome)');
      if (m3uItem) console.log('Stream ID:', `"${m3uItem.id}"`, '| isSeries:', m3uItem.isSeries);
      console.log('Credenciais:', credentials ? '✅ Locais' : '📡 Catálogo Mestre (Server-side)');
      console.log('URL Local:', movieStreamUrl || 'Não gerada');
      console.log('Lookup URL:', lookupStreamUrl || 'Pendente');
      console.log('URL Final:', finalStreamUrl || 'Nenhuma');
      console.log('Ambiente:', window.location.hostname);
      console.log('------------------------------------------');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, isAvailable, finalStreamUrl]);

  // 📺 BUSCA DE EPISÓDIOS PARA SÉRIES (NOVO MODELO BACKEND)
  useEffect(() => {
    // Agora só precisamos do m3uItem.id que representa o series_id no M3U formatado
    // Robustez: consideramos série se o TMDB diz 'tv' OU se o M3U diz que é série!
    const isActuallySeries = movie.media_type === 'tv' || m3uItem?.isSeries;
    // Tenta carregar se tiver ID OU se tivermos o título para busca (fallback)
    const shouldFetchSeries = isActuallySeries && (m3uItem?.id || title);
    if (!shouldFetchSeries) return;

    setIsSeriesLoading(true);

    supabase.functions.invoke('series-lookup', {
      body: { 
        series_id: m3uItem?.id || "SEARCH_BY_TITLE",
        title: title 
      }
    })
    .then(({ data, error }) => {
      console.log(`[SERIES-LOOKUP] Resposta para "${title}":`, data);
      if (error) throw error;
      if (data && data.episodes) {
        setSeriesEpisodes(data.episodes);
        if (data.episodes.length > 0) {
          const firstSeason = data.episodes[0].season;
          setSelectedSeason(firstSeason);
        } else {
          console.warn(`[SERIES-LOOKUP] NENHUM EPISÓDIO ENCONTRADO PARA: "${title}"`);
        }
      }
    })
    .catch(err => {
      console.error('[ERROR] Falha crítica ao carregar info da série:', err);
      // Opcional: só mostrar toast se não for erro de rede temporário
      if (err.message !== 'Failed to fetch') {
        toast({
          title: "Erro na Série",
          description: "Não foi possível carregar os episódios.",
          variant: "destructive"
        });
      }
    })
    .finally(() => setIsSeriesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, m3uItem?.id]);

  // 🖼️ BUSCA DE METADADOS DA TEMPORADA (TMDB)
  useEffect(() => {
    if (movie.media_type !== 'tv' || !selectedSeason) return;
    
    setIsSeasonLoading(true);
    getSeasonDetails(movie.id, selectedSeason)
      .then(data => {
        setSeasonMetadata(data);
      })
      .catch(err => console.error('[TMDB] Erro ao buscar detalhes da temporada:', err))
      .finally(() => setIsSeasonLoading(false));
  }, [movie.id, movie.media_type, selectedSeason]);

  const availableSeasons = [...new Set(seriesEpisodes.map(ep => ep.season))].sort((a, b) => a - b);
  const currentSeasonEpisodes = seriesEpisodes.filter(ep => ep.season === selectedSeason);

  // Helper para buscar metadados de um episódio específico do TMDB
  const getEpMetadata = (epNumber: number) => {
    if (!seasonMetadata?.episodes) return null;
    return seasonMetadata.episodes.find((e: any) => e.episode_number === epNumber);
  };

  // 🎬 INICIAR REPRODUÇÃO via GlobalPlayer
  const handlePlayStream = (url: string, epLabel?: string) => {
    setShowTrailer(false);
    playVideo(url, {
      title,
      poster: backdrop || tmdbImg(movie.poster_path, 'w780') || '',
      id: movie.id,
      media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
      episodeLabel: epLabel,
    });
    onClose(); // Fecha o modal — GlobalPlayer assume a reprodução
  };

  // 📦 MINIMIZAR: mantém modal aberto, passa para mini-player
  const handleMinimize = () => {
    minimize();
    onClose();
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
            {showTrailer && trailerKey ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            ) : (
              <>
                <img src={backdrop || tmdbImg(movie.poster_path, 'original')} alt={title} className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                {trailerKey && (
                  <button onClick={handlePlayTrailer} className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center glow-red scale-100 hover:scale-110 transition-transform shadow-2xl">
                      <Play className="w-8 h-8 text-primary-foreground fill-current ml-1" />
                    </div>
                  </button>
                )}
              </>
            )}

            {/* Controles do Modal: Fechar à direita */}
            <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-background/50 backdrop-blur-md flex items-center justify-center text-foreground hover:bg-background transition-colors z-20">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Info */}
          <div className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-4xl font-display text-foreground mb-3">{title}</h2>
                <div className="flex items-center gap-4 flex-wrap">
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
                      Disponível no Catálogo
                    </span>
                  )}
                </div>
              </div>

              {/* Seletor de Temporadas (Estilo Netflix Desktop) */}
              {movie.media_type === 'tv' && availableSeasons.length > 0 && (
                <select
                  value={selectedSeason}
                  onChange={e => setSelectedSeason(Number(e.target.value))}
                  className="bg-secondary/50 border border-white/10 text-foreground text-sm rounded-lg px-4 py-2 hover:bg-secondary/80 outline-none transition-colors"
                >
                  {availableSeasons.map(s => <option key={s} value={s}>Temporada {s}</option>)}
                </select>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed text-lg mb-10 max-w-2xl">{movie.overview || 'Sinopse não disponível para este título.'}</p>

            {/* Séries: Lista de Episódios (Layout Netflix Inspired) */}
            {movie.media_type === 'tv' && (
              <div className="space-y-6 mb-10">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-2xl font-display flex items-center gap-2">
                    <MonitorPlay className="w-6 h-6 text-primary" /> Episódios
                  </h3>
                  {isSeasonLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {currentSeasonEpisodes.length > 0 ? (
                    currentSeasonEpisodes.map((ep) => {
                      const meta = getEpMetadata(ep.episode);
                      return (
                        <div
                          key={ep.url}
                          onClick={() => handlePlayStream(ep.url, `T${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`)}
                          className="group flex items-center gap-6 p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer"
                        >
                          <div className="text-2xl font-display text-muted-foreground w-8 text-center group-hover:text-foreground transition-colors">
                            {ep.episode}
                          </div>
                          
                          <div className="relative aspect-video w-40 rounded-lg overflow-hidden bg-secondary shadow-lg">
                            <img 
                              src={meta?.still_path ? tmdbImg(meta.still_path, 'w300') : (backdrop || tmdbImg(movie.poster_path, 'w300'))} 
                              className="w-full h-full object-cover transition-transform group-hover:scale-110"
                              alt=""
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Play className="w-8 h-8 fill-white text-white" />
                            </div>
                          </div>

                          <div className="flex-1 space-y-1">
                            <h4 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                              {meta?.name || `Episódio ${ep.episode}`}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                              {meta?.overview || 'Assista a este episódio emocionante do catálogo.'}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center space-y-4">
                      {isSeriesLoading ? (
                        <p className="text-muted-foreground flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Carregando episódios...
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Nenhum episódio encontrado no provedor para esta temporada.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 flex-wrap items-center mt-6">
              {/* Assistir Agora: para filmes com URL resolvida (local ou via lookup) */}
              {movie.media_type !== 'tv' && finalStreamUrl && (
                <Button
                  onClick={() => handlePlayStream(finalStreamUrl!)}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 h-12 text-lg font-bold shadow-lg"
                >
                  <Play className="w-5 h-5 mr-3 fill-current" /> Assistir Agora
                </Button>
              )}

              {/* Loading: buscando URL no servidor para filmes */}
              {movie.media_type !== 'tv' && isAvailable && !finalStreamUrl && isLookupLoading && (
                <Button
                  disabled
                  className="bg-accent/50 text-accent-foreground px-8 h-12 text-lg font-bold shadow-lg"
                >
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" /> Localizando stream...
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

              {finalStreamUrl && (
                <Button
                  variant="outline"
                  onClick={handleMinimize}
                  className="h-12 px-6 border-border/50 text-muted-foreground hover:text-foreground"
                >
                  <Minimize2 className="w-5 h-5 mr-2" />
                  Mini-player
                </Button>
              )}
            </div>

            {/* Info quando disponível mas sem URL e lookup já terminou (Filmes) */}
            {isAvailable && !finalStreamUrl && lookupAttempted && !isLookupLoading && movie.media_type !== 'tv' && (
              <p className="mt-4 text-xs text-muted-foreground/60">
                ⚠️ Conteúdo encontrado no catálogo, mas o servidor não retornou a URL do stream. Verifique se a lista M3U está atualizada no Painel do Gestor.
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MovieModal;
