import { useState } from 'react';
import { X, Shield, Zap, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface RenewalModalProps {
  username: string;
  onClose: () => void;
}

const plans = [
  {
    id: 'mensal',
    label: '1 Mês',
    price: 'R$ 35,00',
    badge: null,
    badgeColor: '',
    icon: Zap,
    color: 'from-blue-500 to-blue-600',
    borderColor: 'border-blue-500/30',
    bgGlow: 'bg-blue-500/5',
    perks: ['Acesso completo', 'Suporte 24h'],
  },
  {
    id: 'trimestral',
    label: '3 Meses',
    price: 'R$ 90,00',
    badge: 'POPULAR',
    badgeColor: 'from-red-500 to-red-600',
    icon: Zap,
    color: 'from-blue-500 to-blue-600',
    borderColor: 'border-blue-500/30',
    bgGlow: 'bg-blue-500/5',
    perks: ['Acesso completo', 'Suporte prioritário', 'Economia garantida'],
  },
  {
    id: 'semestral',
    label: '6 Meses',
    price: 'R$ 170,00',
    badge: 'MELHOR VALOR',
    badgeColor: 'from-green-700 to-green-800',
    icon: Zap,
    color: 'from-blue-500 to-blue-600',
    borderColor: 'border-blue-500/30',
    bgGlow: 'bg-blue-500/5',
    perks: ['Acesso completo', 'Suporte VIP', 'Maior economia', 'Tranquilidade total'],
  },
];

const RenewalModal = ({ username, onClose }: RenewalModalProps) => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (plan: typeof plans[0]) => {
    // Resolve username: prop → localStorage fallback
    let effectiveUsername = (username || '').trim();
    if (!effectiveUsername) {
      try {
        const saved = localStorage.getItem('msc_client');
        if (saved) effectiveUsername = (JSON.parse(saved)?.u || '').trim();
      } catch {
        /* ignore */
      }
    }

    if (!effectiveUsername) {
      toast.error('Sessão expirada. Faça login novamente para renovar.');
      return;
    }

    setLoadingPlan(plan.id);

    try {
      const { data, error } = await supabase.functions.invoke('abacatepay-webhook', {
        body: { action: 'create_billing', username: effectiveUsername, plan: plan.id },
      });

      if (error || !data?.success || !data?.url) {
        toast.error('Erro ao gerar link de pagamento. Tente novamente.');
        return;
      }

      toast.success('Redirecionando para o pagamento...');
      window.location.assign(data.url);
    } catch {
      toast.error('Erro ao processar. Tente novamente.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-border"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-blue-500/15 to-transparent">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-xl font-display text-foreground tracking-wide">
                RENOVE SUA ASSINATURA
              </h2>
              <p className="text-xs text-muted-foreground">
                Continue assistindo sem interrupções
              </p>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 mt-3">
              <p className="text-xs text-green-400 font-medium flex items-center gap-1.5">
                ⚡ Pagamento via PIX · Ativação instantânea
              </p>
            </div>
          </div>

          {/* Plans */}
          <div className="px-6 pb-6 space-y-3 mt-2">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <motion.button
                  key={plan.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loadingPlan !== null}
                  className={`w-full relative flex items-start gap-4 p-4 rounded-xl border ${plan.borderColor} ${plan.bgGlow} hover:scale-[1.02] active:scale-[0.98] transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {plan.badge && (
                    <span className={`absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${plan.badgeColor} text-white`}>
                      {plan.badge}
                    </span>
                  )}

                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center shrink-0 shadow-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-semibold text-foreground text-base">
                        {plan.label}
                      </p>
                      <span className="text-sm font-bold text-accent">{plan.price}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {plan.perks.map((perk) => (
                        <span key={perk} className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          {perk}
                        </span>
                      ))}
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity self-center whitespace-nowrap">
                    {loadingPlan === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pagar →'}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 border-t border-border pt-3">
            <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" /> Pagamento seguro
              </span>
              <span>•</span>
              <span>Ativação automática</span>
              <span>•</span>
              <span>PIX instantâneo</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RenewalModal;
