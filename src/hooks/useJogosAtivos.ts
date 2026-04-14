import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface JogoAtivo {
  id: string;
  id_partida: number;
  liga_nome: string;
  liga_id: number;
  liga_logo: string;
  rodada: string | null;
  time_casa: string;
  time_fora: string;
  emblema_casa: string;
  emblema_fora: string;
  placar_casa: number | null;
  placar_fora: number | null;
  horario_inicio: string;
  status: 'programado' | 'ao_vivo' | 'intervalo' | 'finalizado' | 'suspenso' | 'adiado' | 'cancelado';
  elapsed: number | null;
  transmissao: string[];
  data_jogo: string;
  fonte: string;
  atualizado_em: string;
}
// Flag para evitar que o self-healing dispare repetidamente a cada 5s de refetch
let selfHealingAttempted = false;

async function fetchJogosAtivos(): Promise<JogoAtivo[]> {
  const brDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const { data, error } = await supabase
    .from('jogos_ativos')
    .select('*')
    .eq('data_jogo', brDate)
    .order('horario_inicio', { ascending: true });

  if (error) {
    console.error('[Jogos] DB query error:', error);
    throw error;
  }

  let jogos = (data || []) as unknown as JogoAtivo[];

  // Self-healing: se a tabela está vazia e ainda não tentamos, invocar a edge function para popular
  if (jogos.length === 0 && !selfHealingAttempted) {
    selfHealingAttempted = true;
    console.log('[Jogos] Tabela vazia — disparando football-matches para self-healing...');
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('football-matches');
      if (!edgeError && Array.isArray(edgeData) && edgeData.length > 0) {
        console.log(`[Jogos] Self-healing OK: ${edgeData.length} jogos recebidos da edge function`);
        jogos = edgeData as unknown as JogoAtivo[];
      } else if (edgeError) {
        console.warn('[Jogos] Self-healing falhou:', edgeError);
      } else {
        console.log('[Jogos] Self-healing: nenhum jogo retornado (APIs podem não ter jogos hoje)');
      }
    } catch (e) {
      console.warn('[Jogos] Self-healing: erro ao invocar edge function:', e);
    }
  }

  // Sort: ao_vivo first, then programado, then finalizado
  const statusOrder: Record<string, number> = {
    ao_vivo: 0,
    intervalo: 1,
    programado: 2,
    finalizado: 3,
    suspenso: 4,
    adiado: 5,
    cancelado: 6,
  };

  jogos.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    const timeDiff = new Date(a.horario_inicio).getTime() - new Date(b.horario_inicio).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id_partida - b.id_partida; // stable tiebreaker
  });

  console.log(`[Jogos] ${jogos.length} jogos carregados (${jogos.filter(j => j.status === 'ao_vivo').length} ao vivo)`);
  return jogos;
}

export function useJogosAtivos() {
  return useQuery<JogoAtivo[]>({
    queryKey: ['jogos-ativos'],
    queryFn: fetchJogosAtivos,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });
}
