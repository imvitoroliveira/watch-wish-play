import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/** Metadados do conteúdo em reprodução */
export interface PlayingMedia {
  title: string;
  poster: string;
  id: number;
  media_type: 'movie' | 'tv';
  episodeLabel?: string; // Ex: "T01E03"
}

interface VideoContextType {
  /** URL do stream ativo (null = nada tocando) */
  currentUrl: string | null;
  /** Metadados do conteúdo */
  currentMedia: PlayingMedia | null;
  /** Player visível em fullscreen? */
  isFullscreen: boolean;
  /** Player minimizado (mini-player)? */
  isMini: boolean;
  /** Iniciar reprodução — o comportamento muda conforme V1/V2 */
  playVideo: (url: string, media?: PlayingMedia) => void;
  /** Minimizar para mini-player */
  minimize: () => void;
  /** Restaurar para fullscreen */
  restore: () => void;
  /** Parar e fechar completamente */
  stopVideo: () => void;
}

const VideoContext = createContext<VideoContextType | null>(null);

export const useVideo = () => {
  const ctx = useContext(VideoContext);
  if (!ctx) throw new Error('useVideo must be used within VideoProvider');
  return ctx;
};

/**
 * Detecta a versão do app escolhida pelo usuário.
 * - V1: player stub (não faz nada dentro do app — compatibilidade)
 * - V2: player in-app real via GlobalPlayer
 */
function getAppVersion(): 'v1' | 'v2' {
  try {
    // Se estiver na rota /dashboard-v2, FORÇAR V2 (GlobalPlayer in-app)
    // Isso garante que o player nunca abra URLs diretas em nova aba
    if (window.location.pathname.startsWith('/dashboard-v2')) {
      return 'v2';
    }
    return (localStorage.getItem('msc_app_version') as 'v1' | 'v2') || 'v1';
  } catch {
    return 'v1';
  }
}

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentMedia, setCurrentMedia] = useState<PlayingMedia | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMini, setIsMini] = useState(false);

  const playVideo = useCallback((url: string, media?: PlayingMedia) => {
    const version = getAppVersion();

    if (version === 'v1') {
      // V1 STUB: Não abre player in-app.
      // Abre a URL em nova aba (comportamento "externo")
      // Isso mantém a V1 100% funcional sem GlobalPlayer
      console.log('[V1] playVideo stub — abrindo em nova aba:', url);
      window.open(url, '_blank', 'noopener');
      return;
    }

    // V2: Player in-app real
    console.log('[V2] playVideo — iniciando GlobalPlayer:', url);
    setCurrentUrl(url);
    setCurrentMedia(media || null);
    setIsFullscreen(true);
    setIsMini(false);
  }, []);

  const minimize = useCallback(() => {
    if (currentUrl) {
      setIsFullscreen(false);
      setIsMini(true);
    }
  }, [currentUrl]);

  const restore = useCallback(() => {
    if (currentUrl) {
      setIsMini(false);
      setIsFullscreen(true);
    }
  }, [currentUrl]);

  const stopVideo = useCallback(() => {
    setCurrentUrl(null);
    setCurrentMedia(null);
    setIsFullscreen(false);
    setIsMini(false);
  }, []);

  return (
    <VideoContext.Provider value={{
      currentUrl,
      currentMedia,
      isFullscreen,
      isMini,
      playVideo,
      minimize,
      restore,
      stopVideo,
    }}>
      {children}
    </VideoContext.Provider>
  );
};
