import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle, XCircle, Clock, Shield, Bug, GitCompare, Loader2, Zap, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const duration = 600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    requestAnimationFrame(tick);
    prevRef.current = to;
  }, [value]);

  return <span className={className}>{display}</span>;
}

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  duration_ms: number;
}

interface TestRun {
  id: string;
  run_id: string;
  run_at: string;
  total_tests: number;
  passed: number;
  failed: number;
  duration_ms: number;
  trigger_type: string;
  results: TestResult[];
}

export default function SystemTestsTab() {
  const { getAdminAuth } = useAuth();
  const adminAuth = getAdminAuth();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [liveSeconds, setLiveSeconds] = useState(0);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('system-health-check', { method: 'GET' });
      if (data?.results) setRuns(data.results as TestRun[]);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Live timer that ticks every second while running
  useEffect(() => {
    if (!running) return;
    setLiveSeconds(0);
    const interval = setInterval(() => setLiveSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const runTests = async () => {
    setRunning(true);
    try {
      // Trigger tests (returns immediately, runs in background)
      await supabase.functions.invoke('system-health-check', {
        method: 'POST',
        body: { trigger: 'manual' },
        headers: { 'x-admin-auth': adminAuth },
      });

      // Poll for results until tests complete
      const pollUntilDone = async () => {
        let attempts = 0;
        const maxAttempts = 120; // ~4 min max
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
          try {
            const { data } = await supabase.functions.invoke('system-health-check', { method: 'GET' });
            if (data?.results) {
              setRuns(data.results as TestRun[]);
              const latest = data.results[0];
              if (latest && (latest.passed + latest.failed) >= latest.total_tests && latest.total_tests > 0) {
                break; // Tests finished
              }
            }
          } catch {}
        }
      };
      await pollUntilDone();
    } catch {} finally { setRunning(false); }
  };

  const deleteRun = async (id: string) => {
    const previousRuns = runs;
    setRuns((prev) => prev.filter((run) => run.id !== id));

    try {
      const { error } = await supabase.functions.invoke('system-health-check', {
        method: 'DELETE',
        body: { id },
        headers: { 'x-admin-auth': adminAuth },
      });

      if (error) throw error;
      toast.success('Log removido');
    } catch {
      setRuns(previousRuns);
      toast.error('Falha ao excluir log');
    } finally {
      await loadRuns();
    }
  };

  const clearRuns = async () => {
    const previousRuns = runs;
    setRuns([]);

    try {
      const { error } = await supabase.functions.invoke('system-health-check', {
        method: 'DELETE',
        body: { all: true },
        headers: { 'x-admin-auth': adminAuth },
      });

      if (error) throw error;
      toast.success('Histórico limpo');
    } catch {
      setRuns(previousRuns);
      toast.error('Falha ao limpar histórico');
    } finally {
      await loadRuns();
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'functional': return <Bug className="w-3.5 h-3.5" />;
      case 'security': return <Shield className="w-3.5 h-3.5" />;
      case 'regression': return <GitCompare className="w-3.5 h-3.5" />;
      case 'integration': return <Zap className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'functional': return 'Funcional';
      case 'security': return 'Segurança';
      case 'regression': return 'Regressão';
      case 'integration': return 'Integração';
      default: return cat;
    }
  };

  const latestRun = runs[0];
  const progressValue = latestRun
    ? ((latestRun.passed + latestRun.failed) / Math.max(latestRun.total_tests, 1)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header + Run button */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-display text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              MONITORAMENTO DO SISTEMA
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Micro-testes automatizados a cada 8h · Funcional, Segurança, Regressão e Integração
            </p>
          </div>
          <Button
            onClick={runTests}
            disabled={running}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {running ? 'Executando...' : 'Rodar Agora'}
          </Button>
        </div>

        {/* Latest run summary */}
        {(latestRun || running) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-foreground">
                <AnimatedCounter value={latestRun?.total_tests ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">
                <AnimatedCounter value={latestRun?.passed ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground">Passou</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${(latestRun?.failed ?? 0) > 0 ? 'bg-red-500/10' : 'bg-secondary/50'}`}>
              <p className={`text-2xl font-bold ${(latestRun?.failed ?? 0) > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                <AnimatedCounter value={latestRun?.failed ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground">Falhou</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">
                {running ? `${liveSeconds}s` : `${((latestRun?.duration_ms ?? 0) / 1000).toFixed(1)}s`}
              </p>
              <p className="text-xs text-muted-foreground">Duração</p>
            </div>
          </div>
        )}

        {(latestRun || running) && (
          <Progress value={progressValue} className="h-2" />
        )}
      </div>

      {/* Run history */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Histórico de Execuções</h3>
          {runs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm('Limpar todo o histórico de execuções?')) return;
                await clearRuns();
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Limpar tudo
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum teste executado ainda</p>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {run.failed === 0 ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {run.passed}/{run.total_tests} testes OK
                        <span className="text-muted-foreground ml-2">· {(run.duration_ms / 1000).toFixed(1)}s</span>
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(run.run_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                          {run.trigger_type === 'cron' ? 'Automático' : 'Manual'}
                        </Badge>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteRun(run.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-muted-foreground text-xs">{expandedRun === run.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                <AnimatePresence>
                  {expandedRun === run.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      {/* Category filter */}
                      <div className="flex gap-2 p-3 border-b border-border flex-wrap">
                        {['all', 'functional', 'security', 'regression', 'integration'].map(cat => (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                              filterCategory === cat
                                ? 'bg-accent text-accent-foreground'
                                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                            }`}
                          >
                            {cat === 'all' ? 'Todos' : getCategoryLabel(cat)}
                          </button>
                        ))}
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {(run.results as TestResult[])
                          .filter(r => filterCategory === 'all' || r.category === filterCategory)
                          .map((result, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between px-4 py-2 text-xs border-b border-border/50 last:border-0 ${
                              result.passed ? '' : 'bg-red-500/5'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {result.passed ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              )}
                              <span className="text-foreground truncate">{result.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                {getCategoryIcon(result.category)}
                                {getCategoryLabel(result.category)}
                              </span>
                              <span className="text-muted-foreground">{result.duration_ms}ms</span>
                            </div>
                            {result.error && (
                              <span className="text-red-400 ml-2 truncate max-w-[200px]" title={result.error}>
                                {result.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
