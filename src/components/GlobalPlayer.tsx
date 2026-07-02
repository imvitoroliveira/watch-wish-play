import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { useVideo } from '@/contexts/VideoContext';
import { buildProxyUrl } from '@/lib/m3u-client-parser';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Maximize2, Play, Pause, Volume2, VolumeX, Loader2, AlertTriangle } from 'lucide-react';

/**
 * GlobalPlayer — Player de vídeo fullscreen + mini-player para a V2.
 * 
 * Reproduz streams IPTV diretamente no navegador:
 * - HLS (.m3u8) via hls.js
 * - Direto (.mp4, .ts, .mkv) via <video> nativo
 * - Todas as URLs passam pelo Cloudflare Proxy (CORS bypass)
 * 
 * Estados:
 * - Fullscreen overlay (z-[100]) com controles customizados
 * - Mini-player (PiP) no canto inferior direito
 * - Fechado (sem stream ativo)
 */
const GlobalPlayer: React.FC = () => {
  const { currentUrl, currentMedia, isFullscreen, isMini, minimize, restore, stopVideo } = useVideo();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [retryKey, setRetryKey] = useState(0); // Força re-execução do useEffect

  // --- SETUP: Carregar stream quando URL muda ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentUrl) return;

    // Resetar estados
    setIsLoading(true);
    setHasError(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setCurrentTime(0);

    // Destruir instâncias antigas
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    let normalizedUrl = currentUrl;

    // Normalizar URL: servidores IPTV usam HTTP (não possuem certificado SSL).
    if (normalizedUrl.startsWith('https://') && !normalizedUrl.includes('.m3u8') && !normalizedUrl.includes('youtube') && !normalizedUrl.includes('workers.dev') && !normalizedUrl.includes('supabase.co')) {
      normalizedUrl = normalizedUrl.replace(/^https:\/\//i, 'http://');
    }
    
    console.log('[GlobalPlayer] URL original processada:', normalizedUrl.substring(0, 80));

    const isHls = normalizedUrl.toLowerCase().includes('.m3u8');

    // Estratégia DEFINITIVA: Servidores IPTV NUNCA enviam CORS headers.
    // Portanto, o browser SEMPRE bloqueará fetch/HLS direto ao servidor IPTV.
    // A ÚNICA forma de funcionar é via proxy server-side (Supabase Edge Function).
    // O proxy faz o fetch do lado do servidor e repassa com CORS headers corretos.
    // Usamos _cb (Cache-Buster) para OBRIGAR a infraestrutura CDN (Cloudflare/Supabase) a não retornar streams
    // cacheados do passado caso a conexão caia e precisemos recarregar o proxy.
    const supabaseStreamProxy = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy?url=${encodeURIComponent(normalizedUrl)}&_cb=${Date.now()}`;
    
    // Para streams TS/Raw sem extensão, mpegts.js requer CORS, então o proxy é obrigatório.
    // Para MP4/MKV (filmes/séries), a tag nativa <video src> NÃO sofre bloqueio estrito de CORS e vamos tentar direto.
    const playAttempts: { id: string; url: string; kind: 'hls' | 'mpegts' | 'native' }[] = [];

    // Se for URL de filme sem extensão definida (originado do MovieModal)
    // Adicionamos as extensões corretas para evitar que o NGINX devolva text/html (Erro de Formato)
    if (normalizedUrl.includes('/movie/') && !normalizedUrl.match(/\.(mkv|mp4|avi|ts|m3u8)$/i)) {
      playAttempts.push({ id: 'direta_mp4', url: `${normalizedUrl}.mp4`, kind: 'native' });
      playAttempts.push({ id: 'direta_mkv', url: `${normalizedUrl}.mkv`, kind: 'native' });
      playAttempts.push({ id: 'proxy_mp4', url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy?url=${encodeURIComponent(normalizedUrl + '.mp4')}`, kind: 'native' });
    } else {
      const isDirectFirst = Boolean(
        normalizedUrl.toLowerCase().match(/\.(mp4|mkv|avi|mov)$/) || 
        normalizedUrl.toLowerCase().includes('/movie/') || 
        normalizedUrl.toLowerCase().includes('/series/')
      );
      
      if (isHls) {
        // Live TV em painéis XTream nem sempre entrega uma playlist HLS real.
        // Muitas rotas terminadas em .m3u8 respondem MPEG-TS contínuo (video/mp2t),
        // então tentamos HLS primeiro e MPEG-TS em seguida na mesma URL proxied.
        playAttempts.push({ id: 'hls_proxy', url: supabaseStreamProxy, kind: 'hls' });
        playAttempts.push({ id: 'mpegts_proxy', url: supabaseStreamProxy, kind: 'mpegts' });
        playAttempts.push({ id: 'hls_direta', url: normalizedUrl, kind: 'hls' });
      } else if (isDirectFirst) {
        playAttempts.push({ id: 'direta', url: normalizedUrl, kind: 'native' });
        playAttempts.push({ id: 'supabase_proxy', url: supabaseStreamProxy, kind: 'native' });
      } else {
        // Canais ao vivo vindos do M3U mestre costumam chegar sem extensão e com
        // Content-Type video/mp2t; mpegts.js é o caminho correto nesses casos.
        playAttempts.push({ id: 'mpegts_proxy', url: supabaseStreamProxy, kind: 'mpegts' });
        playAttempts.push({ id: 'nativo_proxy', url: supabaseStreamProxy, kind: 'native' });
        playAttempts.push({ id: 'direta', url: normalizedUrl, kind: 'native' });
      }
    }


    let currentAttempt = 0;
    let disposed = false;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    let activeAttemptCleanup: (() => void) | null = null;

    const clearLoadTimeout = () => {
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
    };

    const goToNextAttempt = () => {
      if (disposed) return;
      clearLoadTimeout();
      if (activeAttemptCleanup) {
        activeAttemptCleanup();
        activeAttemptCleanup = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      currentAttempt++;
      tryLoadNext();
    };

    const tryLoadNext = () => {
      if (currentAttempt >= playAttempts.length) {
        setHasError('Formato incompatível ou acesso bloqueado pelo servidor (CORS/403). Todas as rotas falharam.');
        setIsLoading(false);
        console.error('[GlobalPlayer] ✅ Todas as tentativas falharam para:', normalizedUrl);
        return;
      }

      const attempt = playAttempts[currentAttempt];
      console.log(`[GlobalPlayer] 🔄 Tentativa ${currentAttempt + 1}/${playAttempts.length}: ${attempt.id} -> ${attempt.url.substring(0, 100)}`);

      clearLoadTimeout();
      if (activeAttemptCleanup) {
        activeAttemptCleanup();
        activeAttemptCleanup = null;
      }
      loadTimeout = setTimeout(() => {
        console.warn(`[GlobalPlayer] ⏱️ Timeout de carregamento (${attempt.id}), tentando próxima rota...`);
        goToNextAttempt();
      }, 18000);

      if (attempt.kind === 'hls' && Hls.isSupported()) {
        const hls = new Hls({ 
          maxBufferLength: 30, 
          maxMaxBufferLength: 60, 
          startLevel: -1,
          debug: false 
        });
        hlsRef.current = hls;
        
        hls.loadSource(attempt.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log(`[GlobalPlayer] ✅ HLS OK: ${attempt.id}`);
          clearLoadTimeout();
          setIsLoading(false);
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn(`[GlobalPlayer] ⚠️ HLS Erro (${attempt.id}):`, data.type);
            goToNextAttempt();
          }
        });
      } else if (attempt.kind === 'mpegts' && mpegts.isSupported()) {
        // Live TV fallback to raw TS over MSE via mpegts.js
        const player = mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url: attempt.url
        }, {
          enableWorker: true,
          enableStashBuffer: false,
          stashInitialSize: 128 * 1024,
          liveBufferLatencyChasing: true,
        });
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();

        const markMpegReady = () => {
          clearLoadTimeout();
          video.removeEventListener('canplay', markMpegReady);
          activeAttemptCleanup = null;
          setIsLoading(false);
          setHasError(null);
          const playPromise = player.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
        };

        video.addEventListener('canplay', markMpegReady, { once: true });
        activeAttemptCleanup = () => video.removeEventListener('canplay', markMpegReady);
        
        player.on(mpegts.Events.ERROR, (errType, errDetail) => {
          console.warn(`[GlobalPlayer] ⚠️ MPEGTS Erro (${attempt.id}):`, errType, errDetail);
          
          // Se a conexão cair (Timeout da Supabase Edge Function ou painel XTream)
          // mas o vídeo já estava tocando ha alguns segundos, é o fim da sessão de stream.
          // Disparamos o setRetryKey para reabrir a conexão silenciosamente na mesma hora (Auto-Reconnect).
          if (video.currentTime > 5) {
            console.log('[GlobalPlayer] Conexão live TV encerrada. Iniciando auto-reconnect...');
            clearLoadTimeout();
            player.destroy();
            mpegtsRef.current = null;
            setRetryKey(k => k + 1);
            return;
          }

          video.removeEventListener('canplay', markMpegReady);
          activeAttemptCleanup = null;
          goToNextAttempt();
        });
        
        player.on(mpegts.Events.MEDIA_INFO, () => {
          console.log(`[GlobalPlayer] ✅ MPEGTS OK: ${attempt.id}`);
          markMpegReady();
        });

        // Quando o stream proxy corta graciosamente (Supabase Timeout), 
        // o vídeo atinge o EOF natural sem erro. Ocorrendo isso na LiveTV, forçamos o auto-reconnect.
        const onEndedMpegts = () => {
          console.log('[GlobalPlayer] Conexão live TV encerrou (EOF Graceful). Iniciando auto-reconnect...');
          clearLoadTimeout();
          setRetryKey(k => k + 1);
        };
        video.onended = onEndedMpegts;
      } else {
        // Direct Playback (MP4, MKV) ou Native Safari para HLS
        video.src = attempt.url;
        
        const onLoaded = () => {
          console.log(`[GlobalPlayer] ✅ Video OK: ${attempt.id}`);
          clearLoadTimeout();
          setIsLoading(false);
          setHasError(null);
          setDuration(video.duration || 0);
          video.play().then(() => setIsPlaying(true)).catch(e => {
            console.warn('[GlobalPlayer] Autoplay bloqueado ou erro no play:', e);
            setIsPlaying(false);
          });
          cleanup();
        };
        
        const onError = (e: any) => {
          console.warn(`[GlobalPlayer] ⚠️ Erro Nativo (${attempt.id}):`, video.error?.message || 'Falha no carregamento');
          cleanup();
          goToNextAttempt();
        };

        const cleanup = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
          video.removeEventListener('stalled', onError);
        };
        
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
        video.addEventListener('stalled', onError);
        activeAttemptCleanup = cleanup;
        video.load();
      }
    };

    tryLoadNext();

    return () => {
      disposed = true;
      clearLoadTimeout();
      if (activeAttemptCleanup) {
        activeAttemptCleanup();
        activeAttemptCleanup = null;
      }
      // Limpeza brutal do listener de ended pra evitar leaks em multi-reconnects
      if (video) video.onended = null;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [currentUrl, retryKey]);

  // --- PROGRESS: Atualizar barra de progresso ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && isFinite(video.duration)) {
        setProgress((video.currentTime / video.duration) * 100);
        setDuration(video.duration);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [currentUrl]);

  // --- CONTROLS: Auto-hide após 3s ---
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (isFullscreen) resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isFullscreen, resetControlsTimer]);

  // --- AÇÕES ---
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * duration;
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    stopVideo();
  };

  const requestFullscreen = () => {
    const video = videoRef.current;
    const container = video?.closest('[data-player-root]') as HTMLElement | null;

    // 1. Padrão W3C — Chrome/Android moderno
    if (video?.requestFullscreen) {
      video.requestFullscreen().catch(() => {
        // Silencioso: alguns WebViews rejeitam a Promise sem motivo
      });
    // 2. Webkit prefixado — Android WebView legado + Safari desktop
    } else if ((video as any)?.webkitRequestFullscreen) {
      (video as any).webkitRequestFullscreen();
    // 3. webkitEnterFullscreen — iOS Safari (única forma que funciona no Safari mobile)
    } else if ((video as any)?.webkitEnterFullscreen) {
      (video as any).webkitEnterFullscreen();
    // 4. Fallback no container — quando o WebView bloqueia fullscreen no <video>
    } else if (container?.requestFullscreen) {
      container.requestFullscreen();
    } else if ((container as any)?.webkitRequestFullscreen) {
      (container as any).webkitRequestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Nada para renderizar se não houver URL
  if (!currentUrl) return null;

  // ==========================================
  // UNIFIED PLAYER (MANTÉM O <VIDEO> VIVO NA TRANSIÇÃO)
  // ==========================================
  return (
    <AnimatePresence>
      {(isFullscreen || isMini) && (
        <motion.div
          key="global-player-container"
          data-player-root
          initial={{ opacity: 0, scale: isMini ? 0.8 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: isMini ? 0.8 : 1 }}
          layout="position"
          className={
            isMini
              ? "fixed bottom-6 right-6 z-[100] w-[320px] aspect-video rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-black group cursor-pointer"
              : "fixed inset-0 z-[100] bg-black flex items-center justify-center"
          }
          onClick={isMini ? restore : resetControlsTimer}
          onMouseMove={!isMini ? resetControlsTimer : undefined}
        >
          {/* O Video Element permanece inalterado no DOM */}
          <video
            ref={videoRef}
            className={isMini ? "w-full h-full object-cover" : "w-full h-full object-contain pointer-events-auto"}
            playsInline
            poster={currentMedia?.poster}
            muted={isMuted}
            onClick={!isMini ? togglePlay : undefined}
            {...{ referrerPolicy: "no-referrer" } as any}
          />

          {/* ======================= OVERLAY DO MINI ======================= */}
          {isMini && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
                <p className="text-white text-xs font-medium truncate max-w-[200px]">
                  {currentMedia?.title || 'Reproduzindo...'}
                </p>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); restore(); }} className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </button>
                  <button onClick={handleClose} className="w-7 h-7 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center hover:bg-red-500 transition-colors">
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================= OVERLAYS DO FULLSCREEN ======================= */}
          {!isMini && isFullscreen && (
            <>
              {isLoading && !hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
                  <Loader2 className="w-14 h-14 text-primary animate-spin mb-4" />
                  <p className="text-white/70 text-sm">Conectando ao servidor...</p>
                </div>
              )}

              {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 pointer-events-auto">
                  <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
                  <p className="text-white text-lg font-semibold mb-2">Falha na Reprodução</p>
                  <p className="text-white/60 text-sm text-center max-w-md px-4 mb-6">{hasError}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRetryKey(k => k + 1)}
                      className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors"
                    >
                      Tentar Novamente
                    </button>
                    <button
                      onClick={handleClose}
                      className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {showControls && !hasError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {/* Top Bar */}
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-6 pointer-events-none">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 mr-4">
                          <h3 className="text-white text-lg font-semibold truncate">
                            {currentMedia?.title || 'Reproduzindo'}
                          </h3>
                          {currentMedia?.episodeLabel && (
                            <p className="text-white/60 text-sm">{currentMedia.episodeLabel}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pointer-events-auto">
                          <button
                            onClick={handleClose}
                            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors shadow-lg"
                            title="Fechar"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Center Re-Play/Pause */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                        className="w-20 h-20 rounded-full bg-primary/80 backdrop-blur-md flex items-center justify-center text-primary-foreground hover:bg-primary transition-all hover:scale-110 shadow-2xl pointer-events-auto"
                      >
                        {isPlaying ? <Pause className="w-9 h-9" /> : <Play className="w-9 h-9 ml-1" />}
                      </button>
                    </div>

                    {/* Bottom Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 pointer-events-none">
                      {/* Progress Bar */}
                      {duration > 0 && (
                        <div
                          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-4 group/progress pointer-events-auto"
                          onClick={seekTo}
                        >
                          <div
                            className="h-full bg-primary rounded-full relative transition-[width] duration-100"
                            style={{ width: `${progress}%` }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pointer-events-auto">
                        <div className="flex items-center gap-4">
                          <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-primary transition-colors">
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-primary transition-colors">
                            {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                          </button>
                          {duration > 0 && (
                            <span className="text-white/70 text-sm font-mono">
                              {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); minimize(); }}
                            className="text-white hover:text-primary transition-colors"
                            title="Minimizar (Modo Miniatura)"
                          >
                            <Minimize2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); requestFullscreen(); }}
                            className="text-white hover:text-primary transition-colors"
                            title="Tela cheia nativa"
                          >
                            <Maximize2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalPlayer;
