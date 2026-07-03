import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import RenewalModal from '@/components/RenewalModal';
import { Button } from '@/components/ui/button';
import { useBillingEnabled } from '@/hooks/useBillingEnabled';

const resolveRenewalUsername = () => {
  const fromRenewalLogin = localStorage.getItem('msc_renewal_username')?.trim();
  if (fromRenewalLogin) return fromRenewalLogin;

  try {
    const savedClient = localStorage.getItem('msc_client');
    const fromClient = savedClient ? JSON.parse(savedClient)?.u?.trim() : '';
    if (fromClient) return fromClient;
  } catch {
    localStorage.removeItem('msc_client');
  }

  return '';
};

const ExpiredScreen = () => {
  const navigate = useNavigate();
  const [showRenewal, setShowRenewal] = useState(false);
  const { billingEnabled } = useBillingEnabled();

  const username = resolveRenewalUsername();

  // Auto-show renewal popup when billing is enabled
  useEffect(() => {
    if (billingEnabled) {
      const timer = setTimeout(() => setShowRenewal(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [billingEnabled]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6"
        >
          <AlertTriangle className="w-10 h-10 text-primary" />
        </motion.div>

        <h1 className="text-4xl font-display text-foreground mb-3 tracking-wide">
          ASSINATURA EXPIRADA
        </h1>
        <p className="text-muted-foreground mb-3">
          Seu acesso foi suspenso. Renove agora e volte a aproveitar todo o conteúdo em poucos segundos.
        </p>

        {billingEnabled && (
          <>
            <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-2 mb-6 inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <span className="text-xs text-accent font-medium">
                Ativação instantânea após o pagamento
              </span>
            </div>

            <Button
              onClick={() => setShowRenewal(true)}
              className="w-full h-14 text-base font-bold bg-gradient-to-r from-primary to-red-500 hover:brightness-110 text-primary-foreground mb-4 shadow-lg shadow-primary/30 transition-all"
            >
              🔄 Renovar Assinatura Agora
            </Button>
          </>
        )}

        <button
          onClick={() => navigate('/')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar ao login
        </button>
      </motion.div>

      {billingEnabled && showRenewal && (
        <RenewalModal username={username} onClose={() => setShowRenewal(false)} />
      )}
    </div>
  );
};

export default ExpiredScreen;
