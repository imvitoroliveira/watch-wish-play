import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import RenewalModal from '@/components/RenewalModal';

const ExpirationBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [showRenewal, setShowRenewal] = useState(false);
  const { currentClient } = useAuth();

  if (dismissed) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-accent/15 via-accent/10 to-primary/10 border-b border-accent/20 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-sm text-foreground font-semibold">
                Sua assinatura vence em breve!
              </p>
              <p className="text-xs text-muted-foreground">
                Renove agora e não perca seu acesso
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRenewal(true)}
              className="flex items-center gap-1 text-xs font-bold bg-accent text-accent-foreground px-4 py-2 rounded-full hover:brightness-110 transition-all shadow-lg shadow-accent/20"
            >
              Renovar agora <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {showRenewal && (
        <RenewalModal
          username={currentClient?.u || ''}
          onClose={() => setShowRenewal(false)}
        />
      )}
    </>
  );
};

export default ExpirationBanner;
