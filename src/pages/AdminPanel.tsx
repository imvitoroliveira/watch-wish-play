import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ClientData } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Shield, Upload, LogOut, Users, CheckCircle, AlertTriangle, Link, Loader2, Clock, Send, Bell, Wifi, CreditCard, FlaskConical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { processM3UViaBackend, clearM3UCatalog, fetchM3UCatalog } from '@/lib/m3u-parser';
import { supabase } from '@/integrations/supabase/client';
import OnlineStatusTab from '@/components/OnlineStatusTab';
import SystemTestsTab from '@/components/SystemTestsTab';
import { Switch } from '@/components/ui/switch';

const AdminPanel = () => {
  const { isAdmin, loginAdmin, logout, uploadClientList, clientList, getAdminAuth } = useAuth();
  const [user, setUser] = useState(() => localStorage.getItem('msc_admin_user') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('msc_admin_pass') || '');
  const [error, setError] = useState('');
  const [rememberAdmin, setRememberAdmin] = useState(() => !!localStorage.getItem('msc_admin_user'));
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [m3uUrl, setM3uUrl] = useState(() => localStorage.getItem('msc_m3u_url') || '');
  const [m3uContent, setM3uContent] = useState('');
  const [m3uLoading, setM3uLoading] = useState(false);
  const [m3uTitleCount, setM3uTitleCount] = useState(0);
  const [m3uLastUpdate, setM3uLastUpdate] = useState<string | null>(null);
  
  // Google Sheets states
  const [spreadsheetId, setSpreadsheetId] = useState(() => localStorage.getItem('msc_spreadsheet_id') || '1gtVH1bE8ucMUlBZvnrA4C1q6NdIzaszE28xedXBKnM8');
  const [sheetName, setSheetName] = useState(() => localStorage.getItem('msc_sheet_name') || '[HOJE]');
  const [webhookLoading, setWebhookLoading] = useState(false);

  // Online users state
  const [onlineUsers, setOnlineUsers] = useState<{ client_username: string; last_seen: string }[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);

  // Billing toggle
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingToggling, setBillingToggling] = useState(false);
  const [clientFilter, setClientFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos');

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('app-settings', {
          body: { action: 'get' },
        });
        if (!error && data) setBillingEnabled(!!data.billing_enabled);
      } catch {} finally { setBillingLoading(false); }
    };
    loadBilling();
  }, []);

  const toggleBilling = async (value: boolean) => {
    setBillingToggling(true);
    try {
      const adminAuth = getAdminAuth();
      const { data, error } = await supabase.functions.invoke('app-settings', {
        body: { action: 'update', billing_enabled: value },
        headers: { 'x-admin-auth': adminAuth },
      });
      if (!error && data?.success) {
        setBillingEnabled(value);
        toast({ title: value ? 'Cobrança habilitada' : 'Cobrança desabilitada', description: value ? 'Os clientes verão as opções de renovação.' : 'As opções de renovação foram ocultadas.' });
      } else {
        toast({ title: 'Erro', description: 'Não foi possível alterar a configuração.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro', description: 'Falha na comunicação.', variant: 'destructive' });
    } finally {
      setBillingToggling(false);
    }
  };

  const loadOnlineUsers = async () => {
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      console.log('[presence] skipping — no admin creds in session');
      return;
    }
    setOnlineLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-presence', {
        method: 'POST',
        body: { action: 'list_online' },
        headers: { 'x-admin-auth': adminAuth },
      });
      console.log('[presence] response:', data, error);
      if (data?.online) setOnlineUsers(data.online);
    } catch (e) {
      console.error('[presence] error:', e);
    }
    setOnlineLoading(false);
  };

  // Auto-load online users when admin is logged in
  useEffect(() => {
    if (isAdmin) {
      loadOnlineUsers();
    }
  }, [isAdmin]);

  // Load catalog info via edge function (no direct DB access)
  useEffect(() => {
    const loadCatalogInfo = async () => {
      try {
        const catalog = await fetchM3UCatalog();
        setM3uTitleCount(catalog.titles.length);
        if (catalog.titles.length > 0) {
          // Use current time as approximate - exact time not needed on frontend
          setM3uLastUpdate(new Date().toISOString());
        }
      } catch {
        // Silent fail
      }
    };
    loadCatalogInfo();
  }, []);

  const handleM3uProcess = async () => {
    setM3uLoading(true);
    const result = await processM3UViaBackend(
      m3uUrl.trim() || undefined,
      m3uContent.trim() || undefined
    );
    setM3uLoading(false);

    if (result.success) {
      setM3uTitleCount(result.count);
      setM3uLastUpdate(new Date().toISOString());
      localStorage.setItem('msc_m3u_url', m3uUrl.trim());
      toast({ title: 'M3U processado!', description: `${result.rawCount || result.count} entradas → ${result.count} títulos únicos VOD.` });
    } else {
      toast({ title: 'Erro ao processar M3U', description: result.error || 'Tente colar o conteúdo diretamente.', variant: 'destructive' });
    }
  };

  const clearM3u = async () => {
    await clearM3UCatalog();
    setM3uUrl('');
    setM3uContent('');
    setM3uTitleCount(0);
    setM3uLastUpdate(null);
    toast({ title: 'Lista M3U removida', description: 'O catálogo voltará a exibir tendências.' });
  };

  const handleCheckExpiring = async () => {
    if (!spreadsheetId.trim()) {
      toast({ title: 'ID não definido', description: 'Configure o ID da planilha primeiro.', variant: 'destructive' });
      return;
    }
    setWebhookLoading(true);
    toast({ title: 'Processando...', description: 'Filtrando clientes e enviando ao Google Sheets.' });
    try {
      const expiring = clientList.filter(c => c['7'] === '1');

      if (expiring.length === 0) {
        toast({ title: 'Nenhum cliente encontrado', description: 'Não há clientes com vencimento próximo (coluna 7 = 1).', variant: 'destructive' });
        setWebhookLoading(false);
        return;
      }

      const formatDate = (dateStr: string): string => {
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
          }
        } catch { /* fallback */ }
        return dateStr;
      };

      const formatContact = (contact: string | undefined): string => {
        if (!contact) return '';
        const cleaned = contact.replace(/\s/g, '');
        return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
      };

      const payload = expiring.map(c => ({
        usuario: c.u,
        telefone: formatContact(c['n'] || c['N'] || c['Notas'] || c['notas'] || ''),
        status: c.t || 'Ativo',
        data_expiracao: formatDate(c.e),
      }));

      const adminAuth = getAdminAuth();
      const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
        body: {
          spreadsheet_id: spreadsheetId.trim(),
          sheet_name: sheetName.trim() || 'Vencimentos',
          clients: payload,
        },
        headers: { 'x-admin-auth': adminAuth },
      });
      if (error) throw new Error(error.message || 'Erro ao enviar');
      if (data?.error) throw new Error(data.error);
      localStorage.setItem('msc_spreadsheet_id', spreadsheetId.trim());
      localStorage.setItem('msc_sheet_name', sheetName.trim());
      toast({ title: 'Planilha atualizada!', description: `${payload.length} clientes enviados ao Google Sheets.` });
    } catch (e: any) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' });
    }
    setWebhookLoading(false);
  };

  // Persist default values on mount if not already saved
  useEffect(() => {
    if (!localStorage.getItem('msc_spreadsheet_id') && spreadsheetId) {
      localStorage.setItem('msc_spreadsheet_id', spreadsheetId);
    }
    if (!localStorage.getItem('msc_sheet_name') && sheetName) {
      localStorage.setItem('msc_sheet_name', sheetName);
    }
  }, []);

  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    const success = await loginAdmin(user.trim(), pass.trim());
    setLoginLoading(false);
    if (success) {
      setError('');
      if (rememberAdmin) {
        localStorage.setItem('msc_admin_user', user.trim());
        localStorage.setItem('msc_admin_pass', pass.trim());
      } else {
        localStorage.removeItem('msc_admin_user');
        localStorage.removeItem('msc_admin_pass');
      }
    } else {
      setError('Credenciais inválidas');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let data: ClientData[];

      if (file.name.endsWith('.json')) {
        data = JSON.parse(text);
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        // Parse HTML file - extract JSON data from var logs_data = [...] or var tabledata = [...]
        const jsonMatch = text.match(/var\s+(?:logs_data|tabledata)\s*=\s*(\[[\s\S]*?\]);/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
        } else {
          // Fallback: try parsing HTML table rows
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          const rows = doc.querySelectorAll('tr');
          data = [];
          const headers: string[] = [];
          rows.forEach((row, i) => {
            const cells = row.querySelectorAll('td, th');
            if (i === 0) {
              cells.forEach(c => headers.push(c.textContent?.trim() || ''));
            } else {
              const obj: any = {};
              cells.forEach((c, j) => {
                obj[headers[j] || String(j)] = c.textContent?.trim() || '';
              });
              if (obj.u) data.push(obj);
            }
          });
        }
      } else {
        toast({ title: 'Formato não suportado', description: 'Use arquivo JSON ou HTML', variant: 'destructive' });
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        toast({ title: 'Erro', description: 'Nenhum cliente encontrado no arquivo', variant: 'destructive' });
        return;
      }

      const semNotas = data.filter(c => !c['Notas'] && !c['notas'] && !c['NOTAS']).length;
      uploadClientList(data);
      toast({ 
        title: 'Sucesso!', 
        description: `${data.length} clientes importados.${semNotas > 0 ? ` ⚠️ ${semNotas} cliente(s) sem contato na coluna "Notas".` : ''}`,
        variant: semNotas > 0 ? 'destructive' : 'default',
      });
    } catch (err) {
      toast({ title: 'Erro ao processar', description: 'Verifique o formato do arquivo', variant: 'destructive' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm px-6"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4">
              <Shield className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-3xl font-display text-foreground">PAINEL DO GESTOR</h1>
            <p className="text-muted-foreground text-sm mt-1">Acesso restrito</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="Usuário"
              className="h-12 bg-card border-border text-foreground"
              maxLength={100}
            />
            <Input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Senha"
              className="h-12 bg-card border-border text-foreground"
              maxLength={100}
            />
            {error && <p className="text-primary text-sm text-center">{error}</p>}
            <Button type="submit" disabled={loginLoading} className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
              {loginLoading ? 'Verificando...' : 'Entrar'}
            </Button>
          </form>

          <button onClick={() => navigate('/')} className="block mx-auto mt-6 text-xs text-muted-foreground hover:text-foreground">
            ← Voltar ao login
          </button>
        </motion.div>
      </div>
    );
  }

  const activeClients = clientList.filter(c => c.t?.toLowerCase() === 'ativo').length;
  const expiredClients = clientList.filter(c => c.t?.toLowerCase() === 'expirado').length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-accent" />
            <h1 className="text-3xl font-display text-foreground">PAINEL DO GESTOR</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/'); }} className="border-border text-foreground hover:bg-card">
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border">
            <Users className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-3xl font-bold text-foreground">{clientList.length}</p>
            <p className="text-sm text-muted-foreground">Total de Clientes</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl p-5 border border-border">
            <CheckCircle className="w-6 h-6 text-accent mb-2" />
            <p className="text-3xl font-bold text-foreground">{activeClients}</p>
            <p className="text-sm text-muted-foreground">Ativos</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl p-5 border border-border">
            <AlertTriangle className="w-6 h-6 text-primary mb-2" />
            <p className="text-3xl font-bold text-foreground">{expiredClients}</p>
            <p className="text-sm text-muted-foreground">Expirados</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl p-5 border border-border">
            <Clock className="w-6 h-6 text-accent mb-2" />
            <p className="text-lg font-bold text-foreground">
              {m3uLastUpdate
                ? new Date(m3uLastUpdate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : 'Nunca'}
            </p>
            <p className="text-sm text-muted-foreground">Última Atualização M3U</p>
            {m3uTitleCount > 0 && <p className="text-xs text-accent mt-1">{m3uTitleCount} títulos</p>}
          </motion.div>
        </div>

        {/* Billing Toggle */}
        <div className="bg-card rounded-xl border border-border p-5 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Sistema de Cobrança</p>
              <p className="text-xs text-muted-foreground">
                {billingEnabled ? 'Ativo — clientes veem opções de renovação' : 'Desativado — renovação oculta para clientes'}
              </p>
            </div>
          </div>
          <Switch
            checked={billingEnabled}
            onCheckedChange={toggleBilling}
            disabled={billingLoading || billingToggling}
          />
        </div>

        <Tabs defaultValue="geral" className="space-y-6">
          <TabsList className="bg-secondary border border-border flex-wrap">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="online" onClick={() => loadOnlineUsers()}>Status em Tempo Real</TabsTrigger>
            <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
            <TabsTrigger value="testes" className="flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Testes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-8">
            {/* Upload */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-display text-foreground mb-3">IMPORTAR LISTA DE CLIENTES</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Faça upload do arquivo JSON ou HTML extraído do painel. O sistema lerá os campos <code className="text-accent">u</code>, <code className="text-accent">p</code>, <code className="text-accent">e</code> e <code className="text-accent">t</code>.
              </p>
              <input ref={fileRef} type="file" accept=".json,.html,.htm" onChange={handleFileUpload} className="hidden" />
              <Button onClick={() => fileRef.current?.click()} className="bg-primary hover:bg-primary/90 text-primary-foreground glow-red">
                <Upload className="w-4 h-4 mr-2" /> Selecionar Arquivo
              </Button>
            </div>

            {/* M3U Validation */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-xl font-display text-foreground mb-3 flex items-center gap-2">
                <Link className="w-5 h-5 text-accent" />
                VALIDAÇÃO M3U
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Cole a URL M3U ou o conteúdo diretamente. O sistema extrairá os títulos VOD para filtrar o catálogo.
              </p>
              <div className="space-y-3">
                <Input
                  value={m3uUrl}
                  onChange={e => {
                    const sanitized = e.target.value.replace(/[<>"'`;(){}]/g, '');
                    setM3uUrl(sanitized);
                  }}
                  placeholder="URL da lista M3U (ex: http://...)"
                  className="h-10 bg-background border-border text-foreground"
                  maxLength={500}
                />
                <textarea
                  value={m3uContent}
                  onChange={e => {
                    const sanitized = e.target.value
                      .replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/on\w+="[^"]*"/gi, '');
                    setM3uContent(sanitized);
                  }}
                  placeholder="Ou cole o conteúdo M3U aqui..."
                  className="w-full h-32 rounded-lg bg-background border border-border text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleM3uProcess} disabled={m3uLoading} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    {m3uLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Processar M3U
                  </Button>
                  {m3uTitleCount > 0 && (
                    <Button variant="outline" onClick={clearM3u} className="border-border text-foreground">Limpar Lista</Button>
                  )}
                  {m3uTitleCount > 0 && (
                    <span className="text-sm text-accent font-medium">✅ {m3uTitleCount} títulos VOD carregados</span>
                  )}
                </div>
              </div>
            </div>

            {/* Client list preview */}
            {clientList.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-display text-lg text-foreground">LISTA DE CLIENTES</h3>
                  <div className="flex items-center gap-2">
                    {(['todos', 'ativos', 'inativos'] as const).map((filter) => (
                      <Button
                        key={filter}
                        variant={clientFilter === filter ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setClientFilter(filter)}
                        className={clientFilter === filter ? 'bg-accent text-accent-foreground' : 'border-border text-muted-foreground'}
                      >
                        {filter === 'todos' ? 'Todos' : filter === 'ativos' ? 'Ativos' : 'Inativos'}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="text-left p-3 text-muted-foreground font-medium">Usuário</th>
                        <th className="text-left p-3 text-muted-foreground font-medium">Expiração</th>
                        <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientList
                        .filter(c => {
                          if (clientFilter === 'ativos') return c.t?.toLowerCase() === 'ativo';
                          if (clientFilter === 'inativos') return c.t?.toLowerCase() !== 'ativo';
                          return true;
                        })
                        .slice(0, 50).map((c, i) => (
                        <tr key={i} className="border-t border-border hover:bg-secondary/50 transition-colors">
                          <td className="p-3 text-foreground">{c.u}</td>
                          <td className="p-3 text-muted-foreground">{c.e || '-'}</td>
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.t?.toLowerCase() === 'ativo' ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
                            }`}>
                              {c.t || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="online">
            <OnlineStatusTab
              onlineUsers={onlineUsers}
              onlineLoading={onlineLoading}
              loadOnlineUsers={loadOnlineUsers}
              clientList={clientList}
            />
          </TabsContent>

          <TabsContent value="vencimentos">
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="text-xl font-display text-foreground flex items-center gap-2">
                <Bell className="w-5 h-5 text-accent" />
                VENCIMENTOS → GOOGLE SHEETS
              </h2>
              <p className="text-sm text-muted-foreground">
                Envie os dados dos clientes com vencimento próximo (3 dias) diretamente para uma planilha no Google Sheets via Service Account.
                Os campos enviados: <code className="text-accent">usuario</code>, <code className="text-accent">telefone</code>, <code className="text-accent">status</code> e <code className="text-accent">data_expiracao</code>.
              </p>
              <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Como configurar:</p>
                <p>1. Compartilhe a planilha com o e-mail da Service Account como <strong>Editor</strong></p>
                <p>2. Copie o ID da planilha (da URL: docs.google.com/spreadsheets/d/<strong>ID_AQUI</strong>/edit)</p>
                <p>3. Informe o nome da aba destino abaixo</p>
              </div>
              <div className="space-y-3">
                <Input
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value.replace(/[<>"'`;(){}]/g, ''))}
                  placeholder="ID da Planilha (ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms)"
                  className="h-10 bg-background border-border text-foreground"
                  maxLength={200}
                />
                <Input
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="Nome da aba (ex: Vencimentos)"
                  className="h-10 bg-background border-border text-foreground"
                  maxLength={100}
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      localStorage.setItem('msc_spreadsheet_id', spreadsheetId.trim());
                      localStorage.setItem('msc_sheet_name', sheetName.trim());
                      toast({ title: 'Configuração salva!', description: 'ID e aba salvos localmente.' });
                    }}
                    disabled={!spreadsheetId.trim()}
                    className="border-accent text-accent hover:bg-accent/10"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Salvar Configuração
                  </Button>
                  {localStorage.getItem('msc_spreadsheet_id') && (
                    <span className="text-xs text-accent">✅ Configuração salva</span>
                  )}
                </div>
              </div>
              <Button onClick={handleCheckExpiring} disabled={webhookLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {webhookLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar para Google Sheets
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="testes">
            <SystemTestsTab />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;
