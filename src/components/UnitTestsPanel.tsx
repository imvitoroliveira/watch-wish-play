import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Play, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, RotateCcw, ShieldAlert, FlaskConical,
} from 'lucide-react';
import { runBrowserTests, type BrowserTestRunResult, type BrowserSuiteResult } from '@/lib/browser-tests';

// ─── Contador animado ──────────────────────────────────────────────────────────

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  const animate = useCallback((to: number) => {
    const from = prevRef.current;
    if (from === to) { setDisplay(to); return; }
    const duration = 500;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    requestAnimationFrame(tick);
    prevRef.current = to;
  }, []);

  useState(() => { animate(value); });

  return <span className={className} ref={(el) => { if (el) animate(value); }}>{display}</span>;
}

// ─── Barra de progresso por suite ─────────────────────────────────────────────

function SuiteProgressBar({ suite }: { suite: BrowserSuiteResult }) {
  const pct = suite.results.length > 0
    ? (suite.passed / suite.results.length) * 100
    : 0;

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
        />
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {suite.passed}/{suite.results.length}
      </span>
    </div>
  );
}

// ─── Card de suite ─────────────────────────────────────────────────────────────

function SuiteCard({ suite, defaultOpen }: { suite: BrowserSuiteResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? suite.failed > 0);
  const allPassed = suite.failed === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 flex items-center gap-3 hover:bg-secondary/30 transition-colors text-left"
      >
        {/* Status icon */}
        {allPassed
          ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          : <XCircle className="w-5 h-5 text-primary shrink-0" />
        }

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{suite.name}</span>
            {!allPassed && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">
                {suite.failed} erro{suite.failed > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <SuiteProgressBar suite={suite} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">{suite.durationMs}ms</span>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border"
          >
            {suite.results.map((result, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 py-2.5 text-xs border-b border-border/40 last:border-0 ${
                  result.passed ? '' : 'bg-primary/5'
                }`}
              >
                {result.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <span className={`${result.passed ? 'text-foreground' : 'text-primary font-medium'}`}>
                    {result.testName}
                  </span>
                  {result.error && (
                    <pre className="mt-1.5 text-[10px] text-primary/80 bg-primary/10 rounded p-2 whitespace-pre-wrap font-mono leading-relaxed">
                      {result.error}
                    </pre>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0">{result.durationMs}ms</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Painel principal ──────────────────────────────────────────────────────────

export default function UnitTestsPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BrowserTestRunResult | null>(null);
  const [livePassed, setLivePassed] = useState(0);
  const [liveFailed, setLiveFailed] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setLivePassed(0);
    setLiveFailed(0);
    setLiveTotal(0);
    setLiveSeconds(0);

    // Inicia o timer de segundos
    timerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);

    try {
      const runResult = await runBrowserTests((testResult) => {
        // Atualização em tempo real a cada teste
        if (testResult.passed) {
          setLivePassed(p => p + 1);
        } else {
          setLiveFailed(f => f + 1);
        }
        setLiveTotal(t => t + 1);
      });
      setResult(runResult);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
    }
  }, []);

  const totalTests = result?.totalTests ?? liveTotal;
  const passed = result?.totalPassed ?? livePassed;
  const failed = result?.totalFailed ?? liveFailed;
  const progressPct = totalTests > 0 ? (passed + failed) / Math.max(totalTests, 1) * 100 : 0;
  const coveragePct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;

  const allPassed = result && result.totalFailed === 0;

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho + regra de filosofia ──────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-display text-foreground flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-accent" />
              COBERTURA DE TESTES UNITÁRIOS
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Testes das funções de lógica interna — rodam no browser, sem conexão com o servidor
            </p>
          </div>
          <Button
            onClick={handleRun}
            disabled={running}
            className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
          >
            {running
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Executando...</>
              : result
                ? <><RotateCcw className="w-4 h-4 mr-2" />Re-executar</>
                : <><Play className="w-4 h-4 mr-2" />Executar Testes</>
            }
          </Button>
        </div>

        {/* Avisos de filosofia */}
        <div className="bg-secondary/40 border border-border rounded-lg p-3 flex items-start gap-3 mb-5">
          <ShieldAlert className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">Regra fundamental:</span>{' '}
            testes existem para <span className="text-primary font-medium">identificar problemas</span>, não para aceitá-los.
            Se um teste falha, corrija <span className="text-foreground font-medium">o código</span>, nunca o teste.
            Ajustar o teste para fazer ele passar{' '}
            <span className="text-primary font-medium">esconde o bug</span> — o que é mais perigoso do que não ter teste algum.
          </div>
        </div>

        {/* Métricas em tempo real */}
        {(running || result) && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {running ? liveTotal : result?.totalTests}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {running ? livePassed : result?.totalPassed}
                </p>
                <p className="text-xs text-muted-foreground">Passaram</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${failed > 0 ? 'bg-primary/10' : 'bg-secondary/50'}`}>
                <p className={`text-2xl font-bold ${failed > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {running ? liveFailed : result?.totalFailed}
                </p>
                <p className="text-xs text-muted-foreground">Falharam</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-accent">
                  {running ? `${liveSeconds}s` : `${((result?.totalDurationMs ?? 0) / 1000).toFixed(2)}s`}
                </p>
                <p className="text-xs text-muted-foreground">Duração</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Progress
                value={running ? progressPct : 100}
                className="flex-1 h-2"
              />
              {!running && result && (
                <span className={`text-sm font-bold ${allPassed ? 'text-green-400' : 'text-primary'}`}>
                  {coveragePct}%
                </span>
              )}
            </div>

            {/* Status final */}
            {!running && result && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 flex items-center gap-3 p-3 rounded-lg ${
                  allPassed
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-primary/10 border border-primary/20'
                }`}
              >
                {allPassed
                  ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                  : <AlertTriangle className="w-5 h-5 text-primary" />
                }
                <div>
                  <p className={`text-sm font-semibold ${allPassed ? 'text-green-400' : 'text-primary'}`}>
                    {allPassed
                      ? `✓ Todos os ${result.totalTests} testes passaram`
                      : `✗ ${result.totalFailed} teste${result.totalFailed > 1 ? 's' : ''} falhando — corrija o código`
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Executado em {new Date(result.ranAt).toLocaleTimeString('pt-BR')}
                  </p>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Estado inicial */}
        {!running && !result && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Clique em <span className="text-foreground font-medium">Executar Testes</span> para rodar os{' '}
            <span className="text-accent font-medium">45 testes unitários</span> em tempo real
          </div>
        )}
      </div>

      {/* ── Resultados por suite ─────────────────────────────────────── */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Suítes de Testes ({result.suites.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              {result.suites.filter(s => s.failed === 0).length}/{result.suites.length} suítes sem erros
            </span>
          </div>
          {result.suites.map((suite, i) => (
            <SuiteCard key={suite.name} suite={suite} defaultOpen={suite.failed > 0 || i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
