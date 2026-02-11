import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ClientData } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Shield, Upload, LogOut, Users, CheckCircle, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const AdminPanel = () => {
  const { isAdmin, loginAdmin, logout, uploadClientList, clientList } = useAuth();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginAdmin(user.trim(), pass.trim())) {
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
        // Parse HTML table - extract rows
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
            <Button type="submit" className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
              Entrar
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border">
            <Users className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-3xl font-bold text-foreground">{clientList.length}</p>
            <p className="text-sm text-muted-foreground">Total de Clientes</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl p-5 border border-border">
            <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
            <p className="text-3xl font-bold text-foreground">{activeClients}</p>
            <p className="text-sm text-muted-foreground">Ativos</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl p-5 border border-border">
            <AlertTriangle className="w-6 h-6 text-primary mb-2" />
            <p className="text-3xl font-bold text-foreground">{expiredClients}</p>
            <p className="text-sm text-muted-foreground">Expirados</p>
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
