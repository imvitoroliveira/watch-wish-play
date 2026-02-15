
-- Tabela principal: jogos_ativos (fonte única de verdade para o frontend)
CREATE TABLE public.jogos_ativos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_partida INTEGER NOT NULL,
  liga_nome TEXT NOT NULL DEFAULT '',
  liga_id INTEGER NOT NULL DEFAULT 0,
  liga_logo TEXT NOT NULL DEFAULT '',
  rodada TEXT,
  time_casa TEXT NOT NULL,
  time_fora TEXT NOT NULL,
  emblema_casa TEXT NOT NULL DEFAULT '',
  emblema_fora TEXT NOT NULL DEFAULT '',
  placar_casa INTEGER,
  placar_fora INTEGER,
  horario_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'programado',
  elapsed INTEGER,
  transmissao TEXT[] NOT NULL DEFAULT '{}',
  data_jogo DATE NOT NULL DEFAULT CURRENT_DATE,
  fonte TEXT NOT NULL DEFAULT 'unknown',
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(id_partida, data_jogo)
);

-- Índices para queries rápidas
CREATE INDEX idx_jogos_ativos_status ON public.jogos_ativos(status);
CREATE INDEX idx_jogos_ativos_data ON public.jogos_ativos(data_jogo);
CREATE INDEX idx_jogos_ativos_horario ON public.jogos_ativos(horario_inicio);

-- RLS: leitura pública, escrita apenas via service role
ALTER TABLE public.jogos_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read jogos_ativos"
  ON public.jogos_ativos FOR SELECT
  USING (true);

-- Limpar jogos de dias anteriores automaticamente (reusar cron existente ou adicionar)
-- Não precisa de INSERT/UPDATE/DELETE policies pois edge functions usam service_role_key
