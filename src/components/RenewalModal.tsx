import { X, CreditCard, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RenewalModalProps {
  username: string;
  onClose: () => void;
}

const plans = [
  {
    id: 'mensal',
    label: '1 Mês',
    price: 'Mensal',
    url: 'https://pay.cakto.com.br/33r6n8m_738327',
    icon: '📅',
  },
  {
    id: 'trimestral',
    label: '3 Meses',
    price: 'Trimestral',
    url: 'https://pay.cakto.com.br/3czpic5',
    icon: '📆',
  },
  {
    id: 'semestral',
    label: '6 Meses',
    price: 'Semestral',
    url: 'https://pay.cakto.com.br/9mgrzzt',
    icon: '🗓️',
  },
];

const RenewalModal = ({ username, onClose }: RenewalModalProps) => {
  const handleSelectPlan = (plan: typeof plans[0]) => {
    const url = `${plan.url}?username=${encodeURIComponent(username)}`;
    window.open(url, '_blank');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-border"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-display text-foreground">Escolha seu plano</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Selecione o plano de renovação. O pagamento é processado de forma segura e sua ativação é automática!
          </p>

          <div className="space-y-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => handleSelectPlan(plan)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-background hover:bg-accent/5 hover:border-primary/30 transition-all text-left group"
              >
                <span className="text-2xl">{plan.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {plan.label}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Plano {plan.price}
                  </p>
                </div>
                <span className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Selecionar →
                </span>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Após o pagamento, sua conta será ativada automaticamente.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RenewalModal;
