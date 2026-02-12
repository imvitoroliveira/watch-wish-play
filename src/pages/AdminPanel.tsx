import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ClientData } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Shield, Upload, LogOut, Users, CheckCircle, AlertTriangle, Link, Loader2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { processM3UViaBackend, clearM3UCatalog, fetchM3UCatalog } from '@/lib/m3u-parser';

const AdminPanel = () => {
  const { isAdmin, loginAdmin, logout, uploadClientList, clientList } = useAuth();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [m3uUrl, setM3uUrl] = useState(() => localStorage.getItem('msc_m3u_url') || '');
  const [m3uContent, setM3uContent] = useState('');
  const [m3uLoading, setM3uLoading] = useState(false);
  const [m3uTitleCount, setM3uTitleCount] = useState(0);
  const [m3uLastUpdate, setM3uLastUpdate] = useState<string | null>(null);

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
      toast({ title: 'M3U processado!', description: `${result.count} títulos VOD extraídos.` });
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

  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    const success = await loginAdmin(user.trim(), pass.trim());
    setLoginLoading(false);
    if (success) {
      setError('');
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

      uploadClientList(data);
      toast({ title: 'Sucesso!', description: `${data.length} clientes importados.` });
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

        {/* Upload */}
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
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
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
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
                // Sanitize: only allow valid URL characters
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
                // Sanitize: strip script tags and event handlers
                const sanitized = e.target.value
                  .replace(/<script[\s\S]*?<\/script>/gi, '')
                  .replace(/on\w+="[^"]*"/gi, '');
                setM3uContent(sanitized);
              }}
              placeholder="Ou cole o conteúdo M3U aqui..."
              className="w-full h-32 rounded-lg bg-background border border-border text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handleM3uProcess}
                disabled={m3uLoading}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {m3uLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Processar M3U
              </Button>
              {m3uTitleCount > 0 && (
                <Button variant="outline" onClick={clearM3u} className="border-border text-foreground">
                  Limpar Lista
                </Button>
              )}
              {m3uTitleCount > 0 && (
                <span className="text-sm text-accent font-medium">
                  ✅ {m3uTitleCount} títulos VOD carregados
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Client list preview */}
        {clientList.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-display text-lg text-foreground">LISTA DE CLIENTES</h3>
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
                  {clientList.slice(0, 50).map((c, i) => (
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
      </div>
    </div>
  );
};

export default AdminPanel;
