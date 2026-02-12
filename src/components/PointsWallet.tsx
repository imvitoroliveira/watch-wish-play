import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Wallet, Star, Gift, TrendingUp, Award } from 'lucide-react';

const PointsWallet = () => {
  const { currentClient } = useAuth();

  // Calculate points based on account data
  const watched = JSON.parse(localStorage.getItem('msc_watched') || '[]').length;
  const tickets = JSON.parse(localStorage.getItem('msc_tickets') || '[]').length;

  // Points per activity
  const loyaltyPoints = 100;
  const rawWatchPoints = watched * 1;
  const rawSupportPoints = tickets * 2;

  // Anti-spam: max 30 pts/day from watch + support
  const dailyKey = `msc_daily_pts_${new Date().toISOString().slice(0, 10)}`;
  const dailyUsed = parseInt(localStorage.getItem(dailyKey) || '0', 10);
  const dailyCap = 30;
  const activityPoints = Math.min(rawWatchPoints + rawSupportPoints, dailyCap);
  const watchPoints = Math.min(rawWatchPoints, activityPoints);
  const supportPoints = Math.min(rawSupportPoints, activityPoints - watchPoints);

  const totalPoints = loyaltyPoints + activityPoints;

  const rewards = [
    { name: '1 Mês Grátis', cost: 800, icon: <Gift className="w-5 h-5" /> },
    { name: 'Upgrade HD → 4K', cost: 300, icon: <TrendingUp className="w-5 h-5" /> },
    { name: 'Tela Extra', cost: 200, icon: <Award className="w-5 h-5" /> },
  ];

  const breakdown = [
    { label: 'Fidelidade (base)', points: loyaltyPoints, desc: 'Bônus por ser assinante ativo' },
    { label: 'Filmes assistidos', points: watchPoints, desc: `${watched} filmes × 1 pt` },
    { label: 'Tickets de suporte', points: supportPoints, desc: `${tickets} tickets × 2 pts` },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-display text-foreground mb-2">
          <Wallet className="w-6 h-6 inline mr-2 text-accent" />
          CARTEIRA DE PONTOS
        </h2>
        <p className="text-muted-foreground text-sm">Acumule pontos e troque por benefícios!</p>
      </div>

      {/* Total points card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-accent/20 via-card to-primary/10 border border-accent/30 rounded-2xl p-6 text-center"
      >
        <Star className="w-10 h-10 text-accent mx-auto mb-2" />
        <p className="text-5xl font-display text-foreground">{totalPoints}</p>
        <p className="text-sm text-muted-foreground mt-1">pontos acumulados</p>
        <p className="text-xs text-accent mt-2">Usuário: {currentClient?.u || 'Cliente'}</p>
      </motion.div>

      {/* Points breakdown */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Como você ganhou</h3>
        <div className="space-y-2">
          {breakdown.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-sm text-foreground font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <span className="text-accent font-display text-lg">+{item.points}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Rewards catalog */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Trocar pontos por</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {rewards.map((reward, i) => {
            const canAfford = totalPoints >= reward.cost;
            return (
              <motion.div
                key={reward.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`bg-card border rounded-xl p-4 text-center ${
                  canAfford ? 'border-accent/40 hover:border-accent/70' : 'border-border opacity-60'
                } transition-all`}
              >
                <div className={`mx-auto mb-2 ${canAfford ? 'text-accent' : 'text-muted-foreground'}`}>
                  {reward.icon}
                </div>
                <p className="text-sm font-medium text-foreground">{reward.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{reward.cost} pts</p>
                <button
                  disabled={!canAfford}
                  className={`mt-3 text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
                    canAfford
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                      : 'bg-secondary text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  {canAfford ? 'Resgatar' : 'Pontos insuficientes'}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Referral */}
      <div className="bg-card border border-border rounded-xl p-5 text-center">
        <Gift className="w-6 h-6 text-primary mx-auto mb-2" />
        <h3 className="font-display text-foreground text-lg">INDIQUE E GANHE</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cada amigo que assinar gera <span className="text-accent font-bold">200 pontos</span> para você!
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1 italic">Crédito após confirmação do Gestor</p>
        <button
          onClick={() => {
            const msg = encodeURIComponent('Eu uso o Meu Stream e recomendo! Assine agora e ganhe benefícios.');
            window.open(`https://wa.me/?text=${msg}`, '_blank');
          }}
          className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Compartilhar no WhatsApp
        </button>
      </div>
    </div>
  );
};

export default PointsWallet;
