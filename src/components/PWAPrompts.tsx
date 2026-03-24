import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export function PWAPrompts() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Detect if running as installed PWA (standalone mode)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;

  // Detect install prompt (Android / desktop Chrome)
  useEffect(() => {
    if (isStandalone) return; // Already installed as PWA, no need to prompt

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);

      const lastDismissed = localStorage.getItem('pwa_install_dismissed');
      if (lastDismissed) {
        const diff = Date.now() - parseInt(lastDismissed);
        if (diff < 24 * 60 * 60 * 1000) return;
      }
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  // iOS detection (no beforeinstallprompt)
  useEffect(() => {
    if (isStandalone) return; // Already installed, skip iOS prompt

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      const lastDismissed = localStorage.getItem('pwa_install_dismissed');
      if (lastDismissed) {
        const diff = Date.now() - parseInt(lastDismissed);
        if (diff < 24 * 60 * 60 * 1000) return;
      }
      const timer = setTimeout(() => setShowInstallBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isStandalone]);

  // Detect SW update
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;

        // Check for waiting worker
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setShowUpdateBanner(true);
        }

        // Listen for new updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdateBanner(true);
            }
          });
        });
      } catch (e) {
        // Silent
      }
    };

    checkForUpdate();

    // Also check periodically
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then(reg => reg?.update());
    }, 60 * 60 * 1000); // every hour

    // Listen for controller change (reload after update)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    return () => clearInterval(interval);
  }, []);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
        setInstallPrompt(null);
      }
    }
  }, [installPrompt]);

  const handleDismissInstall = useCallback(() => {
    setShowInstallBanner(false);
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdateBanner(false);
  }, [waitingWorker]);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <AnimatePresence>
      {/* Install Banner */}
      {showInstallBanner && !dismissed && (
        <motion.div
          key="install"
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 z-[9999] max-w-md mx-auto"
        >
          <div className="relative rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Accent gradient top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />

            <button
              onClick={handleDismissInstall}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Instale o StreamTV
                  </h3>
                  <p className="text-sm text-muted-foreground leading-snug">
                    {isIOS
                      ? 'Toque no botão de compartilhar e depois em "Adicionar à Tela Inicial".'
                      : 'Acesse mais rápido direto da tela inicial do seu celular!'}
                  </p>
                </div>
              </div>

              {!isIOS && installPrompt && (
                <Button
                  onClick={handleInstall}
                  className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 rounded-xl"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Instalar Agora
                </Button>
              )}

              {isIOS && (
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2.5">
                  <span>Toque em</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent flex-shrink-0">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  <span>→ "Adicionar à Tela Inicial"</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Update Banner */}
      {showUpdateBanner && (
        <motion.div
          key="update"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-[9999] max-w-md mx-auto"
        >
          <div className="relative rounded-2xl border border-accent/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Accent gradient top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-primary to-accent" />

            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Nova Versão Disponível! 🚀
                  </h3>
                  <p className="text-sm text-muted-foreground leading-snug">
                    Atualize agora para ter acesso às melhorias mais recentes.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowUpdateBanner(false)}
                  className="flex-1 border-border text-muted-foreground h-10 rounded-xl text-sm"
                >
                  Depois
                </Button>
                <Button
                  onClick={handleUpdate}
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-10 rounded-xl text-sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
