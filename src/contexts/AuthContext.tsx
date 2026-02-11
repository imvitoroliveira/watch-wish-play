import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  loginAdmin: (user: string, pass: string) => boolean;
  loginClient: (user: string, pass: string) => { success: boolean; reason?: string };
  logout: () => void;
  uploadClientList: (data: ClientData[]) => void;
  isExpiringSoon: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const ADMIN_USER = 'ovitoroliveira';
const ADMIN_PASS = '5AaMmNn665789';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('msc_admin') === 'true');
  const [currentClient, setCurrentClient] = useState<ClientData | null>(() => {
    const saved = localStorage.getItem('msc_client');
    return saved ? JSON.parse(saved) : null;
  });
  const [clientList, setClientList] = useState<ClientData[]>(() => {
    const saved = localStorage.getItem('msc_clients');
    return saved ? JSON.parse(saved) : [];
  });

  const isExpiringSoon = currentClient?.["7"] === "1";

  const loginAdmin = (user: string, pass: string) => {
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      setIsAdmin(true);
      localStorage.setItem('msc_admin', 'true');
      return true;
    }
    return false;
  };

  const loginClient = (user: string, pass: string): { success: boolean; reason?: string } => {
    const client = clientList.find(c => c.u === user && c.p === pass);
    if (!client) return { success: false, reason: 'invalid' };

    const isExpired = client.t?.toLowerCase() === 'expirado' || 
      (client.e && new Date(client.e) < new Date());

    if (isExpired) return { success: false, reason: 'expired' };

    setCurrentClient(client);
    localStorage.setItem('msc_client', JSON.stringify(client));
    return { success: true };
  };

  const logout = () => {
    setIsAdmin(false);
    setCurrentClient(null);
    localStorage.removeItem('msc_admin');
    localStorage.removeItem('msc_client');
  };

  const uploadClientList = (data: ClientData[]) => {
    setClientList(data);
    localStorage.setItem('msc_clients', JSON.stringify(data));
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
    }}>
      {children}
    </AuthContext.Provider>
  );
};
