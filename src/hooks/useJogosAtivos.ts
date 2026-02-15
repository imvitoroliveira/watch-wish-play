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
  status: 'programado' | 'ao_vivo' | 'finalizado' | 'suspenso' | 'adiado' | 'cancelado';
  elapsed: number | null;
  transmissao: string[];
  data_jogo: string;
  fonte: string;
  atualizado_em: string;
}

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

  const jogos = (data || []) as unknown as JogoAtivo[];

  // Sort: ao_vivo first, then programado, then finalizado
  const statusOrder: Record<string, number> = {
    ao_vivo: 0,
    programado: 1,
    finalizado: 2,
    suspenso: 3,
    adiado: 4,
    cancelado: 5,
  };

  jogos.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return new Date(a.horario_inicio).getTime() - new Date(b.horario_inicio).getTime();
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
