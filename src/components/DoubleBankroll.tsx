import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Target, TrendingDown, AlertTriangle, RotateCcw, History,
  CircleDot, Zap, BarChart3, ShieldAlert, Trophy, XCircle
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────
type Color = 'vermelho' | 'preto' | 'branco';
type Strategy = 'fixed' | 'martingale' | 'fibonacci';

interface Round {
  id: number;
  color: Color;
  bet: number;
  result: 'win' | 'lose';
  payout: number;
  balance: number;
}

const COLOR_CONFIG: Record<Color, { label: string; mult: number; prob: number; cls: string; glow: string }> = {
  vermelho: { label: 'Vermelho', mult: 2, prob: 0.4737, cls: 'bg-neon-red', glow: 'shadow-[0_0_20px_hsl(0,100%,50%,0.5)]' },
  preto:    { label: 'Preto',    mult: 2, prob: 0.4737, cls: 'bg-neon-gray', glow: 'shadow-[0_0_20px_hsl(0,0%,30%,0.5)]' },
  branco:   { label: 'Branco',   mult: 14, prob: 0.0526, cls: 'bg-neon-white', glow: 'shadow-[0_0_20px_hsl(0,0%,90%,0.5)]' },
};

// ── Fibonacci helper ───────────────────────────────────
const fibonacci = (n: number): number[] => {
  const seq = [1, 1];
  for (let i = 2; i < n; i++) seq.push(seq[i - 1] + seq[i - 2]);
  return seq.slice(0, n);
};

// ── Loss streak probability ────────────────────────────
const lossStreakProb = (n: number, prob: number) => Math.pow(1 - prob, n) * 100;

const DoubleBankroll = () => {
  // Session config
  const [bankroll, setBankroll] = useState(100);
  const [dailyGoal, setDailyGoal] = useState(50);
  const [stopLoss, setStopLoss] = useState(50);

  // Strategy
  const [strategy, setStrategy] = useState<Strategy>('fixed');
  const [baseBet, setBaseBet] = useState(5);
  const [maxSteps, setMaxSteps] = useState(8);

  // Game state
  const [balance, setBalance] = useState(100);
  const [selectedColor, setSelectedColor] = useState<Color>('vermelho');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [roundsSinceWhite, setRoundsSinceWhite] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStopped, setSessionStopped] = useState<'goal' | 'loss' | null>(null);

  // Streak tracking
  const [streakCount, setStreakCount] = useState(0);
  const [streakN, setStreakN] = useState(5);

  // ── Derived values ─────────────────────────────────
  const profit = balance - bankroll;
  const goalProgress = Math.min(Math.max((profit / dailyGoal) * 100, 0), 100);
  const lossProgress = Math.min(Math.max((Math.abs(Math.min(profit, 0)) / stopLoss) * 100, 0), 100);

  // ── Martingale table ───────────────────────────────
  const martingaleTable = useMemo(() => {
    const rows = [];
    let cumLoss = 0;
    for (let i = 0; i < maxSteps; i++) {
      const bet = baseBet * Math.pow(2, i);
      cumLoss += bet;
      rows.push({ step: i + 1, bet, cumLoss, requiredBankroll: cumLoss });
    }
    return rows;
  }, [baseBet, maxSteps]);

  // ── Fibonacci table ────────────────────────────────
  const fibTable = useMemo(() => {
    const seq = fibonacci(maxSteps);
    const rows = [];
    let cumLoss = 0;
    for (let i = 0; i < seq.length; i++) {
      const bet = baseBet * seq[i];
      cumLoss += bet;
      rows.push({ step: i + 1, bet, cumLoss });
    }
    return rows;
  }, [baseBet, maxSteps]);

  // ── Current bet calculation ────────────────────────
  const currentBet = useMemo(() => {
    if (strategy === 'fixed') return baseBet;
    if (strategy === 'martingale') return baseBet * Math.pow(2, currentStep);
    // fibonacci
    const seq = fibonacci(maxSteps);
    return baseBet * (seq[Math.min(currentStep, seq.length - 1)] || 1);
  }, [strategy, baseBet, currentStep, maxSteps]);

  // ── Start session ──────────────────────────────────
  const startSession = useCallback(() => {
    setBalance(bankroll);
    setRounds([]);
    setCurrentStep(0);
    setRoundsSinceWhite(0);
    setStreakCount(0);
    setSessionActive(true);
    setSessionStopped(null);
  }, [bankroll]);

  // ── Register round result ─────────────────────────
  const registerResult = useCallback((resultColor: Color) => {
    if (!sessionActive || sessionStopped) return;

    const isWin = resultColor === selectedColor;
    const mult = COLOR_CONFIG[selectedColor].mult;
    const payout = isWin ? currentBet * mult : 0;
    const netChange = isWin ? payout - currentBet : -currentBet;
    const newBalance = balance + netChange;

    const round: Round = {
      id: rounds.length + 1,
      color: resultColor,
      bet: currentBet,
      result: isWin ? 'win' : 'lose',
      payout: netChange,
      balance: newBalance,
    };

    setRounds(prev => [round, ...prev]);
    setBalance(newBalance);

    // White tracker
    if (resultColor === 'branco') {
      setRoundsSinceWhite(0);
    } else {
      setRoundsSinceWhite(prev => prev + 1);
    }

    // Streak tracking
    if (!isWin) {
      const newStreak = streakCount + 1;
      setStreakCount(newStreak);
      // Advance step for progressive strategies
      if (strategy !== 'fixed') {
        setCurrentStep(prev => Math.min(prev + 1, maxSteps - 1));
      }
    } else {
      setStreakCount(0);
      setCurrentStep(0);
    }

    // Session limits
    const newProfit = newBalance - bankroll;
    if (newProfit >= dailyGoal) {
      setSessionStopped('goal');
    } else if (newProfit <= -stopLoss) {
      setSessionStopped('loss');
    }
  }, [sessionActive, sessionStopped, selectedColor, currentBet, balance, rounds, streakCount, strategy, maxSteps, bankroll, dailyGoal, stopLoss]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neon-red/20 flex items-center justify-center">
          <CircleDot className="w-5 h-5 text-neon-red" />
        </div>
        <div>
          <h1 className="text-3xl font-display text-foreground">GESTÃO DE BANCA — DOUBLE</h1>
          <p className="text-sm text-muted-foreground">Controle profissional de apostas</p>
        </div>
      </div>

      {/* ── Session Alert ───────────────────────────── */}
      <AnimatePresence>
        {sessionStopped && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-lg border flex items-center gap-3 ${
              sessionStopped === 'goal'
                ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                : 'bg-neon-red/10 border-neon-red/30 text-neon-red'
            }`}
          >
            {sessionStopped === 'goal' ? (
              <><Trophy className="w-5 h-5" /> <span className="font-medium">🎉 META DIÁRIA ATINGIDA! Pare e proteja seus lucros.</span></>
            ) : (
              <><XCircle className="w-5 h-5" /> <span className="font-medium">🛑 STOP LOSS ATINGIDO! Encerre a sessão.</span></>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Config Panel ────────────────────────────── */}
      {!sessionActive ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="w-5 h-5 text-neon-red" /> Configuração da Sessão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Banca Inicial (R$)</Label>
                <Input type="number" value={bankroll} onChange={e => setBankroll(+e.target.value)} min={1} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Meta Diária (R$)</Label>
                <Input type="number" value={dailyGoal} onChange={e => setDailyGoal(+e.target.value)} min={1} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Stop Loss (R$)</Label>
                <Input type="number" value={stopLoss} onChange={e => setStopLoss(+e.target.value)} min={1} className="mt-1" />
              </div>
            </div>

            {/* Strategy selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Estratégia</Label>
                <Select value={strategy} onValueChange={v => setStrategy(v as Strategy)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Aposta Fixa</SelectItem>
                    <SelectItem value="martingale">Martingale</SelectItem>
                    <SelectItem value="fibonacci">Fibonacci</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Aposta Base (R$)</Label>
                <Input type="number" value={baseBet} onChange={e => setBaseBet(+e.target.value)} min={1} className="mt-1" />
              </div>
              {strategy !== 'fixed' && (
                <div>
                  <Label className="text-muted-foreground text-xs">Máx. Passos</Label>
                  <Input type="number" value={maxSteps} onChange={e => setMaxSteps(+e.target.value)} min={2} max={15} className="mt-1" />
                </div>
              )}
            </div>

            {/* Strategy tables */}
            {strategy === 'martingale' && (
              <div className="overflow-x-auto">
                <p className="text-xs text-muted-foreground mb-2">Tabela Martingale — Perda acumulada por passo:</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-1 text-left">Passo</th>
                      <th className="py-1 text-right">Aposta</th>
                      <th className="py-1 text-right">Perda Acum.</th>
                      <th className="py-1 text-right">Banca Necessária</th>
                    </tr>
                  </thead>
                  <tbody>
                    {martingaleTable.map(r => (
                      <tr key={r.step} className="border-b border-border/50">
                        <td className="py-1">{r.step}</td>
                        <td className="py-1 text-right text-foreground">R$ {r.bet.toFixed(2)}</td>
                        <td className="py-1 text-right text-neon-red">R$ {r.cumLoss.toFixed(2)}</td>
                        <td className="py-1 text-right text-accent">R$ {r.requiredBankroll.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {strategy === 'fibonacci' && (
              <div className="overflow-x-auto">
                <p className="text-xs text-muted-foreground mb-2">Tabela Fibonacci — Sequência de recuperação:</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-1 text-left">Passo</th>
                      <th className="py-1 text-right">Aposta</th>
                      <th className="py-1 text-right">Perda Acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fibTable.map(r => (
                      <tr key={r.step} className="border-b border-border/50">
                        <td className="py-1">{r.step}</td>
                        <td className="py-1 text-right text-foreground">R$ {r.bet.toFixed(2)}</td>
                        <td className="py-1 text-right text-neon-red">R$ {r.cumLoss.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button onClick={startSession} className="w-full bg-neon-red hover:bg-neon-red/80 text-primary-foreground shadow-[0_0_20px_hsl(0,100%,50%,0.3)]">
              <Zap className="w-4 h-4 mr-2" /> Iniciar Sessão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Active Session ────────────────────────── */}
          {/* Progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-border">
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Trophy className="w-3 h-3" /> Meta Diária</span>
                  <span className="text-neon-green font-medium">R$ {Math.max(profit, 0).toFixed(2)} / R$ {dailyGoal.toFixed(2)}</span>
                </div>
                <Progress value={goalProgress} className="h-3 bg-secondary [&>div]:bg-neon-green" />
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Stop Loss</span>
                  <span className="text-neon-red font-medium">R$ {Math.abs(Math.min(profit, 0)).toFixed(2)} / R$ {stopLoss.toFixed(2)}</span>
                </div>
                <Progress value={lossProgress} className="h-3 bg-secondary [&>div]:bg-neon-red" />
              </CardContent>
            </Card>
          </div>

          {/* Balance & current bet */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={`text-xl font-bold ${profit >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>R$ {balance.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Lucro/Prejuízo</p>
                <p className={`text-xl font-bold ${profit >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {profit >= 0 ? '+' : ''}R$ {profit.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Próxima Aposta</p>
                <p className="text-xl font-bold text-accent">R$ {currentBet.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">Sequência Perdas</p>
                <p className={`text-xl font-bold ${streakCount >= 3 ? 'text-neon-red' : 'text-foreground'}`}>{streakCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Color selection */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Sua Aposta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 justify-center">
                {(Object.keys(COLOR_CONFIG) as Color[]).map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className={`flex-1 max-w-[140px] py-3 rounded-lg text-sm font-bold transition-all ${COLOR_CONFIG[c].cls} ${
                      selectedColor === c
                        ? `${COLOR_CONFIG[c].glow} ring-2 ring-foreground/30 scale-105`
                        : 'opacity-50 hover:opacity-80'
                    } ${c === 'branco' ? 'text-background' : 'text-foreground'}`}
                  >
                    {COLOR_CONFIG[c].label}
                    <span className="block text-xs font-normal opacity-70">{COLOR_CONFIG[c].mult}x</span>
                  </button>
                ))}
              </div>

              {/* Result buttons */}
              <div>
                <p className="text-xs text-muted-foreground text-center mb-2">Resultado da rodada:</p>
                <div className="flex gap-2 justify-center">
                  {(Object.keys(COLOR_CONFIG) as Color[]).map(c => (
                    <Button
                      key={c}
                      size="sm"
                      disabled={!!sessionStopped}
                      onClick={() => registerResult(c)}
                      variant="outline"
                      className={`border-2 ${
                        c === 'vermelho' ? 'border-neon-red text-neon-red hover:bg-neon-red/10' :
                        c === 'preto' ? 'border-neon-gray text-neon-white hover:bg-neon-gray/20' :
                        'border-neon-white text-neon-white hover:bg-neon-white/10'
                      }`}
                    >
                      {COLOR_CONFIG[c].label} saiu
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* White Hunter Alert */}
          <Card className={`border-border ${roundsSinceWhite >= 20 ? 'border-neon-white/50' : ''}`}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 ${roundsSinceWhite >= 20 ? 'text-neon-white animate-pulse' : 'text-muted-foreground'}`} />
                <span className="text-sm text-muted-foreground">White Hunter</span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${roundsSinceWhite >= 20 ? 'text-neon-white' : 'text-foreground'}`}>
                  {roundsSinceWhite}
                </span>
                <span className="text-xs text-muted-foreground ml-1">rodadas sem Branco</span>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={startSession} className="flex-1">
              <RotateCcw className="w-4 h-4 mr-2" /> Reiniciar Sessão
            </Button>
            <Button variant="outline" onClick={() => setSessionActive(false)} className="flex-1">
              Encerrar
            </Button>
          </div>

          {/* History */}
          {rounds.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <History className="w-4 h-4" /> Histórico ({rounds.length} rodadas)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-hide">
                  {rounds.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1 px-2 rounded text-xs border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">#{r.id}</span>
                        <span className={`w-3 h-3 rounded-full ${COLOR_CONFIG[r.color].cls}`} />
                        <span className="text-foreground">{COLOR_CONFIG[r.color].label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">R$ {r.bet.toFixed(2)}</span>
                        <span className={r.result === 'win' ? 'text-neon-green font-medium' : 'text-neon-red'}>
                          {r.payout >= 0 ? '+' : ''}R$ {r.payout.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Probability & Risk Analytics ─────────────── */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5 text-accent" /> Simulador de Probabilidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Derrotas consecutivas (N):</Label>
            <Input
              type="number"
              value={streakN}
              onChange={e => setStreakN(Math.max(1, Math.min(30, +e.target.value)))}
              min={1}
              max={30}
              className="w-20"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(COLOR_CONFIG) as Color[]).map(c => {
              const prob = lossStreakProb(streakN, COLOR_CONFIG[c].prob);
              return (
                <div key={c} className="p-3 rounded-lg bg-secondary/50 text-center">
                  <p className="text-xs text-muted-foreground">{streakN}x sem {COLOR_CONFIG[c].label}</p>
                  <p className={`text-lg font-bold ${
                    c === 'vermelho' ? 'text-neon-red' :
                    c === 'branco' ? 'text-neon-white' : 'text-foreground'
                  }`}>
                    {prob < 0.01 ? prob.toExponential(2) : prob.toFixed(2)}%
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Baseado na probabilidade padrão do Double: Vermelho/Preto = 47,37% | Branco = 5,26%
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DoubleBankroll;
