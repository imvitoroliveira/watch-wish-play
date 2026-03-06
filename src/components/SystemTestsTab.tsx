import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle, XCircle, Clock, Shield, Bug, GitCompare, Loader2, Bell, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('system-health-check', { method: 'GET' });
      if (data?.results) setRuns(data.results as TestRun[]);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const runTests = async () => {
    setRunning(true);
    try {
      // Fire and forget — don't await completion
      const runPromise = supabase.functions.invoke('system-health-check', {
        method: 'POST',
        body: { trigger: 'manual' },
      });

      // Poll for updates every 3s while running
      const pollInterval = setInterval(async () => {
        try {
          const { data } = await supabase.functions.invoke('system-health-check', { method: 'GET' });
          if (data?.results) setRuns(data.results as TestRun[]);
        } catch {}
      }, 3000);

      await runPromise;
      clearInterval(pollInterval);
      await loadRuns(); // Final load
    } catch {} finally { setRunning(false); }
  };

  const testPushAlert = async () => {
    try {
      const adminAuth = localStorage.getItem('msc_admin_creds');
      if (!adminAuth) { toast.error('Login de admin necessário'); return; }
      
      const { data } = await supabase.functions.invoke('push-test', {
        body: { action: 'validate' },
        headers: { 'x-admin-auth': adminAuth },
      });
      
      if (data?.success) {
        toast.success(`PushAlert OK! API status: ${data.api_status}`);
      } else {
        toast.error(`PushAlert falhou: ${data?.error || data?.api_response || 'Erro desconhecido'}`);
      }
    } catch (e) {
      toast.error('Erro ao testar PushAlert');
    }
  };

  const sendTestPush = async (username: string) => {
    try {
      const adminAuth = localStorage.getItem('msc_admin_creds');
      if (!adminAuth) { toast.error('Login de admin necessário'); return; }
      
      const { data } = await supabase.functions.invoke('push-test', {
        body: { action: 'send', username },
        headers: { 'x-admin-auth': adminAuth },
      });
      
      if (data?.success) {
        toast.success(`Push enviado para ${username}!`);
      } else {
        toast.error(`Falha: ${JSON.stringify(data?.push_response || data?.error)}`);
      }
    } catch (e) {
      toast.error('Erro ao enviar push de teste');
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
          <div className="flex gap-2">
            <Button
              onClick={testPushAlert}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <Bell className="w-3.5 h-3.5 mr-1" />
              Testar PushAlert
            </Button>
            <Button
              onClick={runTests}
              disabled={running}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {running ? 'Executando...' : 'Rodar Agora'}
            </Button>
          </div>
        </div>

        {/* Latest run summary */}
        {latestRun && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{latestRun.total_tests}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{latestRun.passed}</p>
              <p className="text-xs text-muted-foreground">Passou</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${latestRun.failed > 0 ? 'bg-red-500/10' : 'bg-secondary/50'}`}>
              <p className={`text-2xl font-bold ${latestRun.failed > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{latestRun.failed}</p>
              <p className="text-xs text-muted-foreground">Falhou</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">{(latestRun.duration_ms / 1000).toFixed(1)}s</p>
              <p className="text-xs text-muted-foreground">Duração</p>
            </div>
          </div>
        )}

        {latestRun && (
          <Progress value={(latestRun.passed / latestRun.total_tests) * 100} className="h-2" />
        )}
      </div>

      {/* Run history */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Histórico de Execuções</h3>

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
                  <span className="text-muted-foreground text-xs">{expandedRun === run.id ? '▲' : '▼'}</span>
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
