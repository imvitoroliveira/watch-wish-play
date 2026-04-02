import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useToast } from '@/hooks/use-toast';
import { buildProxyUrl } from '@/lib/m3u-client-parser';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, poster, autoPlay = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Destruir instância antiga se houver
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = src.toLowerCase().includes('.m3u8');
    const proxiedUrl = buildProxyUrl(src);

    console.log('--- [DEBUG-PLAYER] Iniciando Player ---');
    console.log('Original Source:', src);
    console.log('Proxied URL:', proxiedUrl);
    console.log('Tipo de Stream:', isHls ? 'HLS (m3u8)' : 'Direct (mp4/mkv/ts)');
    console.log('---------------------------------------');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[DEBUG-PLAYER] HLS: Manifest carregado com sucesso.');
        if (autoPlay) {
          video.play().catch(e => {
            console.warn('[DEBUG-PLAYER] HLS: Autoplay bloqueado pelo navegador:', e);
            toast({ title: 'Aviso', description: 'Clique em reproduzir para iniciar o vídeo.' });
          });
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[DEBUG-PLAYER] HLS Error Event:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('[DEBUG-PLAYER] HLS Fatal Network Error - Verifique CORS ou Proxy');
              toast({ title: 'Erro de Conexão', description: 'Falha ao conectar via HLS (CORS ou Offline).', variant: 'destructive' });
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[DEBUG-PLAYER] HLS Fatal Media Error - Tentando recuperar...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[DEBUG-PLAYER] HLS Error irrecuperável');
              hls.destroy();
              break;
          }
        }
      });
    } else {
      // Direct video playback (MP4, MKV, TS, or native HLS support like Safari)
      video.src = proxiedUrl;
      video.addEventListener('loadedmetadata', () => {
        if (autoPlay) {
          video.play().catch(e => console.warn('Autoplay bloqueado pelo navegador:', e));
        }
      });
      
      // Monitor native video errors
      video.onerror = () => {
        console.error('[DEBUG-PLAYER] Native Video Error:', video.error);
        if (video.error?.code === 4) {
          console.error('[DEBUG-PLAYER] Erro 4: Media Source not supported ou bloqueio de servidor.');
          toast({ 
            title: 'Erro de Reprodução', 
            description: 'O servidor IPTV bloqueou o acesso (Erro 403/CORS) ou o formato é incompatível.', 
            variant: 'destructive' 
          });
        }
      };
    }


    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, toast]);

  return (
    <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden rounded-lg shadow-2xl">
      <video
        ref={videoRef}
        poster={poster}
        controls
        className="w-full h-full outline-none"
        playsInline
      />
    </div>
  );
};

export default VideoPlayer;
