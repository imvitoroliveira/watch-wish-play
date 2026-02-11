import { AlertTriangle, MessageCircle, X } from 'lucide-react';
import { useState } from 'react';

const ExpirationBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-accent/10 border-b border-accent/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-accent shrink-0" />
          <p className="text-sm text-accent font-medium">
            Sua assinatura vence em breve! Garanta sua renovação.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://wa.me/5500000000000?text=Olá! Gostaria de renovar minha assinatura."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 text-primary-foreground px-3 py-1.5 rounded-full hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Renovar
          </a>
          <button onClick={() => setDismissed(true)} className="text-accent/60 hover:text-accent">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpirationBanner;
