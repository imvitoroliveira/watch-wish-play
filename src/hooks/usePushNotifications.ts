/**
 * Hook para gerenciar notificações push via PushAlert
 * - Associa o username do cliente ao subscriber do PushAlert
 * - Permite que notificações sejam direcionadas por usuário
 * 
 * Usa a JS API oficial do PushAlert:
 * (pushalertbyiw = window.pushalertbyiw || []).push(['addAttributes', {key: value}])
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    PushAlertCo?: {
      subs_id?: string;
      getSubsInfo?: () => { status: string; subs_id: string };
      [key: string]: any;
    };
    pushalertbyiw?: any[];
  }
}

export function usePushNotifications() {
  const { currentClient, isClient } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isClient || !currentClient?.u || registeredRef.current) return;

    const username = currentClient.u;

    // Use PushAlert's official JS API: addAttributes via the pushalertbyiw queue
    // This works both before and after SDK initialization
    (window.pushalertbyiw = window.pushalertbyiw || []).push([
      'addAttributes',
      { username },
    ]);

    // Also register onReady to confirm subscription and log status
    (window.pushalertbyiw = window.pushalertbyiw || []).push([
      'onReady',
      function () {
        const pa = window.PushAlertCo;
        if (pa) {
          const subsInfo = pa.getSubsInfo?.();
          console.log('[Push] PushAlert ready. Status:', subsInfo?.status, '| subs_id:', subsInfo?.subs_id || pa.subs_id);

          // Re-add attributes after confirmation of subscription
          if (subsInfo?.status === 'subscribed') {
            (window.pushalertbyiw = window.pushalertbyiw || []).push([
              'addAttributes',
              { username },
            ]);
            console.log('[Push] Username attribute set:', username);
          }
        }
        registeredRef.current = true;
      },
    ]);

    console.log('[Push] Queued addAttributes for username:', username);
  }, [isClient, currentClient]);
}
