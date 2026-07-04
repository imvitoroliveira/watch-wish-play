import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { useVideo } from '@/contexts/VideoContext';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Maximize2, Play, Pause, Volume2, VolumeX, Loader2, AlertTriangle } from 'lucide-react';

type WebkitVideoElement = HTMLVideoElement & {
  webkitRequestFullscreen?: () => void;
  webkitEnterFullscreen?: () => void;
};

type WebkitContainerElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

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

  // Detecção robusta de mobile/iOS — iOS não suporta MSE (mpegts.js/hls.js falham),
  // e navegadores mobile exigem `muted` ao iniciar autoplay.
  const uaRef = useRef<{ isMobile: boolean; isIOS: boolean }>({
    isMobile: typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    isIOS: typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1)),
  });

  const [isPlaying, setIsPlaying] = useState(false);
  // Mobile: começar mudo para permitir autoplay. Usuário pode desmutar via controle.
  const [isMuted, setIsMuted] = useState(() => uaRef.current.isMobile);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [retryKey, setRetryKey] = useState(0); // Força re-execução do useEffect
  const lastReconnectAtRef = useRef<number>(0);
  const playbackStartAtRef = useRef<number>(0);
  const reconnectCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeUpdateAtRef = useRef<number>(0);
  const lastPlaybackTimeRef = useRef<number>(0);
  const playbackConfirmedRef = useRef<boolean>(false);
  // Reconexão silenciosa: quando true, próximo (re)load NÃO mostra spinner nem apaga a tela.
  const silentReconnectRef = useRef<boolean>(false);
  const framePosterRef = useRef<string | null>(null);

  // Reset contadores de reconexão sempre que a URL muda (novo canal)
  useEffect(() => {
    lastReconnectAtRef.current = 0;
    playbackStartAtRef.current = 0;
    reconnectCountRef.current = 0;
    lastTimeUpdateAtRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    playbackConfirmedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
  }, [currentUrl]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Captura o frame atual do vídeo para usar como poster durante o reconnect (evita tela preta).
  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      framePosterRef.current = canvas.toDataURL('image/jpeg', 0.6);
    } catch {
      // Alguns browsers/streams marcam o canvas como "tainted" — ignorar silenciosamente.
    }
  }, []);

  // Reconexão controlada: só recarrega quando o vídeo realmente parou de avançar.
  // Erros/transições curtas de buffer em TV ao vivo são comuns e não devem derrubar o player.
  // `silent`: reconexão esperada (ex.: EOF do proxy a cada ~6min) — sem spinner, sem cooldown, sem limite.
  const scheduleLiveReconnect = useCallback((reason: string, delayMs = 10_000, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const now = Date.now();
    const playedFor = playbackStartAtRef.current ? now - playbackStartAtRef.current : 0;
    const sinceLast = now - lastReconnectAtRef.current;

    if (!silent) {
      if (!playbackConfirmedRef.current || playedFor < 60_000) {
        console.warn(`[GlobalPlayer] Reconexão ignorada (${reason}): reprodução ainda não ficou estável (${playedFor}ms).`);
        const video = videoRef.current;
        const recentlyAdvanced = Date.now() - lastTimeUpdateAtRef.current < 4_000;
        const hasFutureData = Boolean(video && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
        setIsLoading(Boolean(video && !video.paused && !recentlyAdvanced && !hasFutureData));
        return;
      }

      if (sinceLast < 45_000) {
        console.warn(`[GlobalPlayer] Reconexão ignorada (${reason}): cooldown (${sinceLast}ms desde a última).`);
        return;
      }

      if (reconnectCountRef.current >= 3) {
        console.warn('[GlobalPlayer] Reconexão abortada: limite de 3 atingido.');
        setHasError('O sinal deste canal ficou instável. Feche e abra o canal novamente.');
        setIsLoading(false);
        return;
      }
    }

    if (reconnectTimerRef.current) {
      console.warn(`[GlobalPlayer] Reconexão já em observação (${reason}); aguardando confirmação de travamento.`);
      return;
    }

    clearReconnectTimer();
    const snapshotTime = lastPlaybackTimeRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      reconnectTimerRef.current = null;
      if (!video || !currentUrl) return;

      if (!silent) {
        const advanced = video.currentTime > snapshotTime + 0.75;
        const recentlyAdvanced = Date.now() - lastTimeUpdateAtRef.current < 4_000;
        if (advanced || recentlyAdvanced) {
          console.log(`[GlobalPlayer] Reconexão cancelada (${reason}): stream voltou a avançar.`);
          setIsLoading(false);
          return;
        }
      }

      if (silent) {
        // Congela o último frame como poster para eliminar o flash preto.
        captureCurrentFrame();
        silentReconnectRef.current = true;
      } else {
        reconnectCountRef.current += 1;
      }
      lastReconnectAtRef.current = Date.now();
      playbackStartAtRef.current = 0;
      playbackConfirmedRef.current = false;
      console.log(`[GlobalPlayer] Auto-reconnect${silent ? ' (silent)' : ` #${reconnectCountRef.current}`} (${reason}).`);
      setRetryKey(k => k + 1);
    }, delayMs);
  }, [clearReconnectTimer, currentUrl, captureCurrentFrame]);


  // --- SETUP: Carregar stream quando URL muda ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentUrl) return;

    const silent = silentReconnectRef.current;
    silentReconnectRef.current = false;

    // Resetar estados (mas em reconexão silenciosa mantemos loading=false e último frame como poster)
    if (!silent) {
      setIsLoading(true);
      setProgress(0);
      setDuration(0);
      setCurrentTime(0);
    }
    setHasError(null);
    setIsPlaying(false);
    clearReconnectTimer();
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }

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

    // Mobile: NÃO fazer downgrade https→http (Mixed Content bloqueia). Manter proxy.
    const { isMobile, isIOS } = uaRef.current;
    if (!isMobile && normalizedUrl.startsWith('https://') && !normalizedUrl.includes('.m3u8') && !normalizedUrl.includes('youtube') && !normalizedUrl.includes('workers.dev') && !normalizedUrl.includes('supabase.co')) {
      normalizedUrl = normalizedUrl.replace(/^https:\/\//i, 'http://');
    }

    console.log('[GlobalPlayer] URL processada:', normalizedUrl.substring(0, 80), '| mobile:', isMobile, '| iOS:', isIOS);

    const lowerUrl = normalizedUrl.toLowerCase();
    const isHls = lowerUrl.includes('.m3u8');
    const isLiveMedia = currentMedia?.media_type === 'tv' || lowerUrl.includes('/live/');
    // iOS Safari NÃO suporta MSE — mpegts.js/hls.js retornam isSupported()=false.
    const canUseMSE = !isIOS && typeof MediaSource !== 'undefined';

    const buildSupabaseStreamProxy = (url: string) => (
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy?url=${encodeURIComponent(url)}&_cb=${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    const playAttempts: { id: string; url: string; kind: 'hls' | 'mpegts' | 'native' }[] = [];
    const attemptedUrls = new Set<string>();
    const addAttempt = (id: string, url: string, kind: 'hls' | 'mpegts' | 'native') => {
      const key = `${kind}:${url}`;
      if (attemptedUrls.has(key)) return;
      attemptedUrls.add(key);
      playAttempts.push({ id, url, kind });
    };
    const liveMatch = normalizedUrl.match(/^(https?:\/\/[^/]+)\/live\/([^/]+)\/([^/]+)\/(\d+)(?:\.(m3u8|ts))?(?:\?.*)?$/i);

    if (normalizedUrl.includes('/movie/') && !normalizedUrl.match(/\.(mkv|mp4|avi|ts|m3u8)$/i)) {
      if (!isMobile) {
        addAttempt('direta_mp4', `${normalizedUrl}.mp4`, 'native');
        addAttempt('direta_mkv', `${normalizedUrl}.mkv`, 'native');
      }
      addAttempt('proxy_mp4', buildSupabaseStreamProxy(normalizedUrl + '.mp4'), 'native');
      addAttempt('proxy_mkv', buildSupabaseStreamProxy(normalizedUrl + '.mkv'), 'native');
    } else {
      const isDirectFirst = Boolean(
        lowerUrl.match(/\.(mp4|mkv|avi|mov)$/) ||
        lowerUrl.includes('/movie/') ||
        lowerUrl.includes('/series/')
      );

      if (isLiveMedia && liveMatch) {
        const [, origin, user, pass, id] = liveMatch;
        const tsUrl = `${origin}/live/${user}/${pass}/${id}.ts`;
        const rawUrl = `${origin}/${user}/${pass}/${id}`;
        const rawTsUrl = `${origin}/${user}/${pass}/${id}.ts`;
        const hlsUrl = `${origin}/live/${user}/${pass}/${id}.m3u8`;

        if (canUseMSE) {
          addAttempt('live_mpegts_ts', buildSupabaseStreamProxy(tsUrl), 'mpegts');
          addAttempt('live_mpegts_raw', buildSupabaseStreamProxy(rawUrl), 'mpegts');
          addAttempt('live_mpegts_raw_ts', buildSupabaseStreamProxy(rawTsUrl), 'mpegts');
          addAttempt('live_hls_fallback', buildSupabaseStreamProxy(hlsUrl), 'hls');
          addAttempt('live_native_ts', buildSupabaseStreamProxy(tsUrl), 'native');
        } else {
          // iOS: usar HLS nativo (Safari suporta .m3u8 direto no <video>)
          addAttempt('live_hls_ios_proxy', buildSupabaseStreamProxy(hlsUrl), 'native');
          addAttempt('live_hls_ios_direct', hlsUrl, 'native');
        }
      } else if (isHls) {
        if (canUseMSE) {
          addAttempt('hls_proxy', buildSupabaseStreamProxy(normalizedUrl), 'hls');
          addAttempt('mpegts_proxy', buildSupabaseStreamProxy(normalizedUrl), 'mpegts');
        }
        addAttempt('hls_nativo_proxy', buildSupabaseStreamProxy(normalizedUrl), 'native');
        if (!isMobile) addAttempt('hls_direta', normalizedUrl, 'native');
      } else if (isDirectFirst) {
        if (!isMobile) addAttempt('direta', normalizedUrl, 'native');
        addAttempt('supabase_proxy', buildSupabaseStreamProxy(normalizedUrl), 'native');
      } else {
        if (canUseMSE) addAttempt('mpegts_proxy', buildSupabaseStreamProxy(normalizedUrl), 'mpegts');
        addAttempt('nativo_proxy', buildSupabaseStreamProxy(normalizedUrl), 'native');
        if (!isMobile) addAttempt('direta', normalizedUrl, 'native');
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
      video.onended = null;
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
      }, isLiveMedia ? 10_000 : 18_000);

      if (attempt.kind === 'hls' && Hls.isSupported()) {
        const hls = new Hls({ 
          maxBufferLength: isLiveMedia ? 12 : 30, 
          maxMaxBufferLength: isLiveMedia ? 24 : 60, 
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 10,
          lowLatencyMode: false,
          backBufferLength: isLiveMedia ? 30 : 60,
          manifestLoadingTimeOut: 12_000,
          levelLoadingTimeOut: 12_000,
          fragLoadingTimeOut: 20_000,
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
            if (playbackConfirmedRef.current) {
              clearLoadTimeout();
              scheduleLiveReconnect(`hls-error:${data.type}`, 12_000);
              return;
            }
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
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,
          liveBufferLatencyChasing: false,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 30,
          autoCleanupMinBackwardDuration: 10,
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
          if (!playbackStartAtRef.current) playbackStartAtRef.current = Date.now();
          const playPromise = player.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
        };

        video.addEventListener('canplay', markMpegReady, { once: true });
        activeAttemptCleanup = () => video.removeEventListener('canplay', markMpegReady);

        player.on(mpegts.Events.ERROR, (errType, errDetail) => {
          console.warn(`[GlobalPlayer] ⚠️ MPEGTS Erro (${attempt.id}):`, errType, errDetail);

          // Erros MPEG-TS em live podem ser apenas troca/atraso de segmento.
          // Só reconecta se, após alguns segundos, o tempo do vídeo não avançar.
          if (playbackConfirmedRef.current) {
            clearLoadTimeout();
            scheduleLiveReconnect(`mpegts-error:${errType}`, 12_000);
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
          clearLoadTimeout();
          scheduleLiveReconnect('mpegts-eof', 6_000);
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
        
        const onError = () => {
          console.warn(`[GlobalPlayer] ⚠️ Erro Nativo (${attempt.id}):`, video.error?.message || 'Falha no carregamento');
          cleanup();
          goToNextAttempt();
        };

        const cleanup = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
        };
        
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
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
      clearReconnectTimer();
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
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
  }, [currentUrl, currentMedia?.media_type, retryKey, clearReconnectTimer, scheduleLiveReconnect]);

  // --- PROGRESS: Atualizar barra de progresso ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      lastTimeUpdateAtRef.current = Date.now();
      lastPlaybackTimeRef.current = video.currentTime;
      if (!playbackStartAtRef.current) playbackStartAtRef.current = Date.now();
      if (video.currentTime > 3) playbackConfirmedRef.current = true;
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
      setIsLoading(false);
      if (video.duration && isFinite(video.duration)) {
        setProgress((video.currentTime / video.duration) * 100);
        setDuration(video.duration);
      }
    };

    const clearBufferingState = () => {
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
      setIsLoading(false);
    };

    const onPlay = () => {
      setIsPlaying(true);
      if (!playbackStartAtRef.current) playbackStartAtRef.current = Date.now();
      clearBufferingState();
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => {
      if (!playbackConfirmedRef.current) {
        setIsLoading(true);
        return;
      }

      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = setTimeout(() => {
        const stalledFor = Date.now() - lastTimeUpdateAtRef.current;
        const hasFutureData = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
        if (!video.paused && !hasFutureData && stalledFor > 12_000) {
          setIsLoading(true);
          scheduleLiveReconnect('buffering-stall', 10_000);
        }
      }, 12_000);
    };
    const onCanPlay = clearBufferingState;
    const onPlaying = clearBufferingState;

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
    };
  }, [currentUrl, scheduleLiveReconnect]);

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
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
    stopVideo();
  };

  const requestFullscreen = () => {
    const video = videoRef.current;
    const container = video?.closest('[data-player-root]') as HTMLElement | null;
    const webkitVideo = video as WebkitVideoElement | null;
    const webkitContainer = container as WebkitContainerElement | null;

    // 1. Padrão W3C — Chrome/Android moderno
    if (video?.requestFullscreen) {
      video.requestFullscreen().catch(() => {
        // Silencioso: alguns WebViews rejeitam a Promise sem motivo
      });
    // 2. Webkit prefixado — Android WebView legado + Safari desktop
    } else if (webkitVideo?.webkitRequestFullscreen) {
      webkitVideo.webkitRequestFullscreen();
    // 3. webkitEnterFullscreen — iOS Safari (única forma que funciona no Safari mobile)
    } else if (webkitVideo?.webkitEnterFullscreen) {
      webkitVideo.webkitEnterFullscreen();
    // 4. Fallback no container — quando o WebView bloqueia fullscreen no <video>
    } else if (container?.requestFullscreen) {
      container.requestFullscreen();
    } else if (webkitContainer?.webkitRequestFullscreen) {
      webkitContainer.webkitRequestFullscreen();
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
            {...({ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' } as Record<string, string>)}
            poster={currentMedia?.poster}
            muted={isMuted}
            onClick={!isMini ? togglePlay : undefined}
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
