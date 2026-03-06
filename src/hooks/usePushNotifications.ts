/**
 * Hook para gerenciar notificações push via PushAlert
 * - Associa o username do cliente ao subscriber do PushAlert
 * - Permite que notificações sejam direcionadas por usuário
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    PushAlertCo?: any;
    pushalertbyiw?: any;
  }
}

export function usePushNotifications() {
  const { currentClient, isClient } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isClient || !currentClient?.u || registeredRef.current) return;

    const tryRegister = () => {
      // PushAlert SDK exposes window.PushAlertCo or window.pushalertbyiw
      const pa = window.PushAlertCo || window.pushalertbyiw;
      
      if (pa && typeof pa.putAttribute === 'function') {
        // Associate username with this subscriber for targeted notifications
        pa.putAttribute('username', currentClient.u);
        registeredRef.current = true;
        console.log('[Push] Username attribute set:', currentClient.u);
        return true;
      }

      // Alternative: use the onReady callback approach
      if (typeof (window as any).pushalert === 'object') {
        (window as any).pushalert = (window as any).pushalert || [];
        (window as any).pushalert.push(['onReady', function() {
          const paReady = window.PushAlertCo || window.pushalertbyiw;
          if (paReady && typeof paReady.putAttribute === 'function') {
            paReady.putAttribute('username', currentClient!.u);
            registeredRef.current = true;
            console.log('[Push] Username attribute set on ready:', currentClient!.u);
          }
        }]);
        return true;
      }

      return false;
    };

    // Try immediately
    if (!tryRegister()) {
      // Retry after SDK loads
      const interval = setInterval(() => {
        if (tryRegister()) clearInterval(interval);
      }, 2000);

      // Stop trying after 30s
      const timeout = setTimeout(() => clearInterval(interval), 30000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [isClient, currentClient]);
}
