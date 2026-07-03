import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Chave de cache compartilhada do React Query para as configurações do app.
 * Usada tanto aqui quanto no AdminPanel para garantir que ambos leiam
 * e escrevam no mesmo cache — sem chamadas duplicadas à Edge Function.
 */
export const BILLING_QUERY_KEY = ['app-settings', 'billing'] as const;

/** Tempo que os dados ficam "frescos" sem re-buscar: 5 minutos */
const STALE_TIME = 5 * 60 * 1000;

/** Tempo que o cache permanece na memória após não haver mais consumidores: 30 minutos */
const GC_TIME = 30 * 60 * 1000;

async function fetchBillingStatus(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('app-settings', {
    body: { action: 'get' },
  });
  // Default ON — admin can temporarily disable via toggle
  if (error || !data) return true;
  return data.billing_enabled !== false;
}

/**
 * Hook que retorna o status do sistema de cobrança.
 *
 * Compartilha cache via React Query — se AdminPanel e Dashboard estiverem
 * montados ao mesmo tempo, apenas UMA requisição é feita ao backend.
 *
 * @returns {{ billingEnabled: boolean, loading: boolean }}
 */
export const useBillingEnabled = () => {
  const { data: billingEnabled = true, isLoading: loading } = useQuery({
    queryKey: BILLING_QUERY_KEY,
    queryFn: fetchBillingStatus,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  return { billingEnabled, loading };
};

/**
 * Retorna uma função para atualizar o cache do billing localmente.
 * Usada pelo AdminPanel após um toggle bem-sucedido para refletir
 * a mudança em todos os componentes sem re-buscar do backend.
 */
export const useBillingUpdater = () => {
  const queryClient = useQueryClient();
  return (value: boolean) => queryClient.setQueryData(BILLING_QUERY_KEY, value);
};
