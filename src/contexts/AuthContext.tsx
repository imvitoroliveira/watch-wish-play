import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientData {
  u: string;
  p?: string; // senha — NÃO persistida no browser
  e: string; // expiration date
  t: string; // status: "Ativo" | "Expirado"
  "7"?: string; // "1" = expiring soon
  m3u?: string; // URL da lista M3U individual (opcional)
  [key: string]: string | undefined;
}

interface AuthContextType {
  isAdmin: boolean;
  isClient: boolean;
  currentClient: ClientData | null;
  clientList: ClientData[];
  loginAdmin: (user: string, pass: string) => Promise<boolean>;
  loginClient: (user: string, pass: string) => Promise<{ success: boolean; reason?: string }>;
  logout: () => void;
  uploadClientList: (data: ClientData[]) => void;
  isExpiringSoon: boolean;
  clientsLoading: boolean;
  getAdminAuth: () => string;
}

const AuthContext = createContext<AuthContextType | null>(null);

const CLIENT_STORAGE_KEY = 'msc_client';
const RENEWAL_USERNAME_KEY = 'msc_renewal_username';

const parseStoredClient = (): ClientData | null => {
  try {
    const saved = localStorage.getItem(CLIENT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    localStorage.removeItem(CLIENT_STORAGE_KEY);
    return null;
  }
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(() => {
    return !!sessionStorage.getItem('msc_admin_token');
  });
  const [adminAuth, setAdminAuth] = useState(() => {
    return sessionStorage.getItem('msc_admin_auth') || '';
  });
  const [currentClient, setCurrentClient] = useState<ClientData | null>(() => {
    return parseStoredClient();
  });
  const [clientList, setClientList] = useState<ClientData[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  // Auto-load client list from backend when admin session is restored on mount
  useEffect(() => {
    if (!isAdmin || !adminAuth) return;
    const loadClients = async () => {
      setClientsLoading(true);
      try {
        const { data } = await supabase.functions.invoke('manage-clients', {
          method: 'GET',
          headers: { 'x-admin-auth': adminAuth },
        });
        if (data?.clients && Array.isArray(data.clients)) {
          setClientList(data.clients);
        }
      } catch {
        // Silent — admin can still upload manually
      } finally {
        setClientsLoading(false);
      }
    };
    loadClients();
  }, [isAdmin, adminAuth]);

  const isExpiringSoon = currentClient?.["7"] === "1";

  // Migrate: clear old insecure localStorage keys on mount
  useEffect(() => {
    localStorage.removeItem('msc_admin_token');
    localStorage.removeItem('msc_admin_creds');
    localStorage.removeItem('msc_clients');
  }, []);

  const getAdminAuth = () => adminAuth;

  const loginAdmin = async (user: string, pass: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-login', {
        method: 'POST',
        body: { user: user.trim(), pass: pass.trim() },
      });
      if (error || !data?.success) return false;
      const authB64 = btoa(`${user.trim()}:${pass.trim()}`);
      setIsAdmin(true);
      setAdminAuth(authB64);
      sessionStorage.setItem('msc_admin_token', data.token);
      sessionStorage.setItem('msc_admin_auth', authB64);

      // Load client list from backend for admin session
      try {
        const { data: clientsData } = await supabase.functions.invoke('manage-clients', {
          method: 'GET',
          headers: { 'x-admin-auth': authB64 },
        });
        if (clientsData?.clients && Array.isArray(clientsData.clients)) {
          setClientList(clientsData.clients);
        }
      } catch {
        // Silent — admin can still upload
      }

      return true;
    } catch {
      return false;
    }
  };

  const loginClient = async (user: string, pass: string): Promise<{ success: boolean; reason?: string }> => {
    const normalizedUser = user.trim();
    const normalizedPass = pass.trim();

    try {
      const { data, error } = await supabase.functions.invoke('client-login', {
        body: { action: 'login', username: normalizedUser, password: normalizedPass },
      });

      if (error) {
        return { success: false, reason: 'error' };
      }

      if (!data?.success) {
        if (data?.reason === 'expired') {
          localStorage.setItem(RENEWAL_USERNAME_KEY, normalizedUser);
        }
        return { success: false, reason: data?.reason || 'invalid' };
      }

      // Salva sessão do cliente — sem a senha para não expô-la no browser
      const client: ClientData = { ...data.client };
      delete client.p;
      setCurrentClient(client);
      localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(client));
      localStorage.removeItem(RENEWAL_USERNAME_KEY);
      return { success: true };
    } catch {
      return { success: false, reason: 'error' };
    }
  };

  const logout = async () => {
    // Clear presence before logging out
    if (currentClient?.u) {
      try {
        await supabase.functions.invoke('user-presence', {
          body: { action: 'logout', username: currentClient.u },
        });
      } catch {
        // Silent fail
      }
    }
    setIsAdmin(false);
    setAdminAuth('');
    setCurrentClient(null);
    setClientList([]);
    sessionStorage.removeItem('msc_admin_token');
    sessionStorage.removeItem('msc_admin_auth');
    localStorage.removeItem(CLIENT_STORAGE_KEY);
    localStorage.removeItem(RENEWAL_USERNAME_KEY);
  };

  const uploadClientList = async (data: ClientData[]) => {
    // Preserve per-client m3u URLs that already exist in the current list.
    // Spreadsheet re-uploads don't carry the m3u column, so without this
    // merge every re-import would wipe the individual M3U URLs configured
    // manually by the admin.
    const existingM3uByUser = new Map<string, string>();
    for (const c of clientList) {
      if (c?.u && c?.m3u) existingM3uByUser.set(c.u, c.m3u);
    }
    const merged = data.map((c) => {
      if (c?.m3u) return c; // incoming already has one — respect it
      const prev = existingM3uByUser.get(c?.u);
      return prev ? { ...c, m3u: prev } : c;
    });

    setClientList(merged);

    try {
      await supabase.functions.invoke('manage-clients', {
        method: 'POST',
        body: { clients: merged },
        headers: { 'x-admin-auth': adminAuth },
      });
    } catch {
      // Silent fail, data kept in memory for session
    }
  };

  return (
    <AuthContext.Provider value={{
      isAdmin,
      isClient: !!currentClient,
      currentClient,
      clientList,
      loginAdmin,
      loginClient,
      logout,
      uploadClientList,
      isExpiringSoon,
      clientsLoading,
      getAdminAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
