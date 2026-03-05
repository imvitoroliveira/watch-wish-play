import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import RenewalModal from '@/components/RenewalModal';
import { Button } from '@/components/ui/button';

const ExpiredScreen = () => {
  const navigate = useNavigate();
  const [showRenewal, setShowRenewal] = useState(false);

  // Try to get username from localStorage
  const savedClient = localStorage.getItem('msc_client');
  const username = savedClient ? JSON.parse(savedClient)?.u || '' : '';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
          <AlertTriangle className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-display text-foreground mb-3">ASSINATURA VENCIDA</h1>
        <p className="text-muted-foreground mb-8">
          Sua assinatura expirou. Renove agora para continuar aproveitando todo o conteúdo do seu cinema pessoal.
        </p>

        <Button
          onClick={() => setShowRenewal(true)}
          className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 text-primary-foreground mb-4"
        >
          🔄 Renovar Assinatura
        </Button>

        <button
          onClick={() => navigate('/')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar ao login
        </button>
      </motion.div>

      {showRenewal && (
        <RenewalModal username={username} onClose={() => setShowRenewal(false)} />
      )}
    </div>
  );
};

export default ExpiredScreen;
