import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientData {
  u: string;
  p: string;
  e: string; // expiration date
  t: string; // status: "Ativo" | "Expirado"
  "7"?: string; // "1" = expiring soon
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(() => {
    const token = localStorage.getItem('msc_admin_token');
    return !!token;
  });
  const [currentClient, setCurrentClient] = useState<ClientData | null>(() => {
    const saved = localStorage.getItem('msc_client');
    return saved ? JSON.parse(saved) : null;
  });
  const [clientList, setClientList] = useState<ClientData[]>(() => {
    const saved = localStorage.getItem('msc_clients');
    return saved ? JSON.parse(saved) : [];
  });
  const [clientsLoading, setClientsLoading] = useState(true);

  const isExpiringSoon = currentClient?.["7"] === "1";

  // Load clients from DB on mount
  useEffect(() => {
    const loadClients = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-clients', {
          method: 'GET',
        });
        if (!error && data?.clients && Array.isArray(data.clients) && data.clients.length > 0) {
          setClientList(data.clients);
          localStorage.setItem('msc_clients', JSON.stringify(data.clients));
        }
      } catch {
        // Use local cache silently
      } finally {
        setClientsLoading(false);
      }
    };
    loadClients();
  }, []);

  const loginAdmin = async (user: string, pass: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-login', {
        method: 'POST',
        body: { user: user.trim(), pass: pass.trim() },
      });
      if (error || !data?.success) return false;
      setIsAdmin(true);
      localStorage.setItem('msc_admin_token', data.token);
      return true;
    } catch {
      return false;
    }
  };

  const loginClient = async (user: string, pass: string): Promise<{ success: boolean; reason?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('client-login', {
        body: { action: 'login', username: user, password: pass },
      });

      if (error) {
        return { success: false, reason: 'error' };
      }

      if (!data?.success) {
        return { success: false, reason: data?.reason || 'invalid' };
      }

      // Reconstruct client data with password for local session
      const client: ClientData = { ...data.client, p: pass };
      setCurrentClient(client);
      localStorage.setItem('msc_client', JSON.stringify(client));
      return { success: true };
    } catch {
      // Fallback to local validation if edge function fails
      const client = clientList.find(c => c.u === user && c.p === pass);
      if (!client) return { success: false, reason: 'invalid' };

      const isExpired = client.t?.toLowerCase() === 'expirado' ||
        (client.e && new Date(client.e) < new Date());
      if (isExpired) return { success: false, reason: 'expired' };

      setCurrentClient(client);
      localStorage.setItem('msc_client', JSON.stringify(client));
      return { success: true };
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
    setCurrentClient(null);
    localStorage.removeItem('msc_admin_token');
    localStorage.removeItem('msc_client');
  };

  const uploadClientList = async (data: ClientData[]) => {
    setClientList(data);
    localStorage.setItem('msc_clients', JSON.stringify(data));

    try {
      await supabase.functions.invoke('manage-clients', {
        method: 'POST',
        body: { clients: data },
      });
    } catch {
      // Silent fail, data saved locally
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
    }}>
      {children}
    </AuthContext.Provider>
  );
};
