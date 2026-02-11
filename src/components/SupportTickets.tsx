import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronRight, MessageCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Ticket {
  id: string;
  issue: string;
  status: 'open' | 'resolved';
  date: string;
  suggestion?: string;
}

const COMMON_ISSUES = [
  { label: 'Tela Preta', suggestion: 'Tente limpar o cache do seu player e reiniciar o app. Se persistir, verifique sua conexão de internet.' },
  { label: 'Travamento', suggestion: 'Verifique se sua internet está estável (mín. 10 Mbps). Tente mudar o DNS para 8.8.8.8 / 8.8.4.4.' },
  { label: 'Áudio Dessincronizado', suggestion: 'Reinicie o player. Se usar TV Box, verifique as configurações de áudio (PCM/Passthrough).' },
  { label: 'Canal Fora do Ar', suggestion: 'Alguns canais podem ter instabilidade temporária. Aguarde 15 minutos e tente novamente.' },
  { label: 'Erro de Login', suggestion: 'Verifique se seu usuário e senha estão corretos. Se o problema persistir, entre em contato.' },
  { label: 'Qualidade Baixa', suggestion: 'Ative a opção de qualidade HD/4K no seu player. Mín. 25 Mbps para 4K.' },
];

const SupportTickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem('msc_tickets');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedIssue, setSelectedIssue] = useState<typeof COMMON_ISSUES[0] | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const selectIssue = (issue: typeof COMMON_ISSUES[0]) => {
    setSelectedIssue(issue);
    setShowSuggestion(true);
  };

  const createTicket = () => {
    if (!selectedIssue) return;
    const ticket: Ticket = {
      id: Date.now().toString(),
      issue: selectedIssue.label,
      status: 'open',
      date: new Date().toLocaleDateString('pt-BR'),
      suggestion: selectedIssue.suggestion,
    };
    const updated = [ticket, ...tickets];
    setTickets(updated);
    localStorage.setItem('msc_tickets', JSON.stringify(updated));
    setSelectedIssue(null);
    setShowSuggestion(false);
  };

  const resolveTicket = (id: string) => {
    const updated = tickets.map(t => t.id === id ? { ...t, status: 'resolved' as const } : t);
    setTickets(updated);
    localStorage.setItem('msc_tickets', JSON.stringify(updated));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <HelpCircle className="w-6 h-6 inline mr-2 text-blue-400" />
          SUPORTE
        </h2>
        <p className="text-muted-foreground text-sm">Selecione o problema e receba a solução na hora</p>
      </div>

      {/* Issue selection */}
      {!showSuggestion && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {COMMON_ISSUES.map(issue => (
            <button
              key={issue.label}
              onClick={() => selectIssue(issue)}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/30 hover:bg-card/80 transition-all group"
            >
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {issue.label}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground mt-2 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Suggestion */}
      <AnimatePresence>
        {showSuggestion && selectedIssue && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-card border border-border rounded-xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-1">{selectedIssue.label}</h3>
            <p className="text-muted-foreground text-sm mb-4">{selectedIssue.suggestion}</p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setSelectedIssue(null); setShowSuggestion(false); }}
                className="border-border text-foreground"
              >
                ✅ Resolvido!
              </Button>
              <Button onClick={createTicket} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <MessageCircle className="w-4 h-4 mr-2" /> Abrir Ticket
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticket history */}
      {tickets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Seus Tickets</h3>
          <div className="space-y-2">
            {tickets.map(t => (
              <div key={t.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{t.issue}</p>
                  <p className="text-xs text-muted-foreground">{t.date}</p>
                </div>
                {t.status === 'open' ? (
                  <button
                    onClick={() => resolveTicket(t.id)}
                    className="text-xs px-3 py-1 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    Marcar Resolvido
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Resolvido
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTickets;
