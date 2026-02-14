import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Users, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClientData } from '@/contexts/AuthContext';

interface OnlineUser {
  client_username: string;
  last_seen: string;
}

interface OnlineStatusTabProps {
  onlineUsers: OnlineUser[];
  onlineLoading: boolean;
  loadOnlineUsers: () => void;
  clientList: ClientData[];
}

const OnlineStatusTab = ({ onlineUsers, onlineLoading, loadOnlineUsers, clientList }: OnlineStatusTabProps) => {
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadOnlineUsers, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadOnlineUsers]);

  const getClientData = (username: string) =>
    clientList.find(c => c.u === username);

  const getTimeSince = (lastSeen: string) => {
    const diff = Date.now() - new Date(lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    return `${mins}min atrás`;
  };

  const filtered = onlineUsers.filter(u =>
    u.client_username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Counter + Controls */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Wifi className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-3xl font-bold text-foreground">{onlineUsers.length}</p>
              <p className="text-sm text-muted-foreground">Ativos Agora</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded border-border"
              />
              Auto-refresh 30s
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOnlineUsers}
              disabled={onlineLoading}
              className="border-border text-foreground"
            >
              {onlineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Wifi className="w-4 h-4 mr-1" /> Atualizar</>}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Search + List */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display text-lg text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                STATUS EM TEMPO REAL
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Usuários com atividade nos últimos 5 minutos</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar usuário..."
                className="pl-9 h-9 bg-background border-border text-foreground text-sm"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {onlineLoading ? 'Carregando...' : search ? 'Nenhum resultado encontrado.' : 'Nenhum usuário online no momento.'}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary sticky top-0">
                <tr>
                  <th className="text-left p-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Status Conta</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Expiração</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Conexão</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Última Atividade</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const client = getClientData(u.client_username);
                  const statusLabel = client?.t || 'N/A';
                  const isActive = statusLabel.toLowerCase() === 'ativo';
                  const expDate = client?.e;

                  return (
                    <tr key={i} className="border-t border-border hover:bg-secondary/50 transition-colors">
                      <td className="p-3 text-foreground font-medium">{u.client_username}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          isActive ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
                        }`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {expDate ? new Date(expDate).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          Online
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {getTimeSince(u.last_seen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlineStatusTab;
