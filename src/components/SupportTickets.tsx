import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, ChevronRight, MessageCircle, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface Ticket {
  id: string;
  issue: string;
  status: 'open' | 'resolved';
  date: string;
  suggestion?: string;
}

const WHATSAPP_URL = 'https://wa.me/5534984242845?text=Vitor%20tentei%20as%20op%C3%A7%C3%B5es%20de%20suporte%20no%20aplicativo%20mas%20n%C3%A3o%20resolveu.%20Pode%20me%20ajudar%3F';

const COMMON_ISSUES = [
  {
    label: 'Tela Preta',
    suggestion: 'Muitas vezes, a tela preta é apenas cache acumulado ou player incompatível. Siga o vídeo ao lado.',
    videoId: 'oVBPjcGne5s',
    faq: [
      'Vá em Configurações > Apps > Seu Player > Limpar cache',
      'Reinicie o roteador e aguarde 30 segundos',
      'Teste com outro player (VLC, TiviMate, XCIPTV)',
      'Verifique se o Wi-Fi está na banda 5GHz para melhor desempenho',
    ],
  },
  {
    label: 'Travamento',
    suggestion: 'Configure seu DNS e otimize seu Wi-Fi para acabar com o buffering.',
    videoId: 'hBEJWiSTwz8',
    faq: [
      'Faça um teste de velocidade em fast.com',
      'Configure DNS: Configurações > Rede > DNS Manual > 8.8.8.8 / 8.8.4.4',
      'Desative VPN se estiver usando',
      'Reinicie a TV Box / Smart TV',
      'Conecte via cabo Ethernet em vez de Wi-Fi',
    ],
  },
  {
    label: 'Áudio Dessincronizado',
    suggestion: 'Ajuste o modo PCM/Passthrough como mostrado no tutorial.',
    videoId: 'V6hctMyZ8y0',
    faq: [
      'No player: Configurações > Áudio > Modo: PCM',
      'Desative o Passthrough de áudio se estiver ativo',
      'Teste com fones de ouvido para isolar o problema',
      'Atualize o firmware da sua TV Box',
    ],
  },
  {
    label: 'Canal Fora do Ar',
    suggestion: 'Alguns canais podem ter instabilidade temporária. Aguarde 15 minutos e tente novamente.',
    faq: [
      'Aguarde 15 minutos e tente novamente',
      'Atualize a lista de canais no player',
      'Verifique se outros canais estão funcionando',
      'Tente reiniciar o aplicativo completamente',
    ],
  },
  {
    label: 'Erro de Login',
    suggestion: 'Verifique se seu usuário e senha estão corretos. Se o problema persistir, entre em contato.',
    faq: [
      'Verifique se não há espaços extras no usuário/senha',
      'Confira se o Caps Lock está desativado',
      'Tente copiar e colar o usuário e senha',
      'Verifique se sua assinatura está ativa',
    ],
  },
  {
    label: 'Qualidade Baixa',
    suggestion: 'Ative a opção de qualidade HD/4K no seu player. Mín. 25 Mbps para 4K.',
    faq: [
      'No player: Configurações > Qualidade > HD ou 4K',
      'Velocidade mínima: 10 Mbps (HD), 25 Mbps (4K)',
      'Use conexão cabeada para 4K estável',
      'Verifique se o canal oferece opção HD/FHD',
    ],
  },
];

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SupportTickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem('msc_tickets');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedIssue, setSelectedIssue] = useState<typeof COMMON_ISSUES[0] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [checked, setChecked] = useState(false);
  const [seconds, setSeconds] = useState(24);

  // 24s countdown when modal opens
  useEffect(() => {
    if (!modalOpen) return;
    setTimerDone(false);
    setChecked(false);
    setSeconds(24);
    const interval = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [modalOpen, selectedIssue]);

  const canProceed = timerDone || checked;

  const handleBlockedWhatsApp = () => {
    toast({
      title: 'Suporte bloqueado',
      description: 'Por favor, assista ao vídeo tutorial para liberar o suporte.',
    });
  };

  const selectIssue = (issue: typeof COMMON_ISSUES[0]) => {
    setSelectedIssue(issue);
    setModalOpen(true);
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
    setModalOpen(false);
    setSelectedIssue(null);
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
          <HelpCircle className="w-6 h-6 inline mr-2 text-primary" />
          SUPORTE
        </h2>
        <p className="text-muted-foreground text-sm">Selecione o problema e receba a solução na hora</p>
      </div>

      {/* Issue selection grid */}
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

      {/* Video tutorial modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border-border p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-foreground">{selectedIssue?.label}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {selectedIssue?.suggestion}
            </DialogDescription>
          </DialogHeader>

          {selectedIssue?.videoId && (
            <div className="px-5 pt-3">
              <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full scale-[1.04]"
                  src={`https://www.youtube.com/embed/${selectedIssue.videoId}?rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&playsinline=1`}
                  title={selectedIssue.label}
                  style={{ border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {/* FAQ steps */}
          {selectedIssue?.faq && (
            <div className="px-5 pt-3">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">📖 Passos Recomendados</p>
                <ul className="space-y-1">
                  {selectedIssue.faq.map((step, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-accent font-medium shrink-0">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Blocking flow */}
          <div className="p-5 space-y-3">
            {selectedIssue?.videoId && !canProceed && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                />
                <span className="text-sm text-muted-foreground">Assisti ao vídeo e realizei os procedimentos</span>
              </label>
            )}

            {!canProceed && selectedIssue?.videoId && (
              <p className="text-xs text-muted-foreground text-center">
                ⏳ Aguarde {seconds}s ou marque acima para liberar o suporte
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={createTicket}
                disabled={!canProceed}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex-1"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                {canProceed ? 'Ainda preciso de ajuda / Abrir Ticket' : `Aguarde ${seconds}s ou marque acima`}
              </Button>

              {canProceed ? (
                <Button
                  asChild
                  variant="outline"
                  className="border-green-600 text-green-500 hover:bg-green-600/10 hover:text-green-400 animate-pulse"
                >
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon />
                    <span className="ml-2">Falar no WhatsApp</span>
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="border-muted text-muted-foreground opacity-50 cursor-not-allowed"
                  onClick={handleBlockedWhatsApp}
                >
                  <WhatsAppIcon />
                  <span className="ml-2">Falar no WhatsApp</span>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp floating link */}
      <div className="flex justify-center">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-green-600/10 border border-green-600/30 text-green-500 hover:bg-green-600/20 transition-colors text-sm"
        >
          <WhatsAppIcon />
          Não resolveu? Fale comigo no WhatsApp
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

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

      {/* Security footer */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground/60">
          Conexão Blindada: Seus dados estão protegidos por criptografia de ponta a ponta.
        </p>
      </div>
    </div>
  );
};

export default SupportTickets;
