
-- Atomic upsert function with advisory locks to prevent race conditions
CREATE OR REPLACE FUNCTION public.upsert_jogo_ativo(
  p_id_partida integer,
  p_liga_nome text,
  p_liga_id integer,
  p_liga_logo text,
  p_rodada text,
  p_time_casa text,
  p_time_fora text,
  p_emblema_casa text,
  p_emblema_fora text,
  p_placar_casa integer,
  p_placar_fora integer,
  p_horario_inicio timestamp with time zone,
  p_status text,
  p_elapsed integer,
  p_transmissao text[],
  p_data_jogo date,
  p_fonte text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Serialize access to this specific game record
  PERFORM pg_advisory_xact_lock(hashtext('jogo_' || p_id_partida::text || '_' || p_data_jogo::text));

  INSERT INTO jogos_ativos (
    id_partida, liga_nome, liga_id, liga_logo, rodada,
    time_casa, time_fora, emblema_casa, emblema_fora,
    placar_casa, placar_fora, horario_inicio, status, elapsed,
    transmissao, data_jogo, fonte, atualizado_em
  ) VALUES (
    p_id_partida, p_liga_nome, p_liga_id, p_liga_logo, p_rodada,
    p_time_casa, p_time_fora, p_emblema_casa, p_emblema_fora,
    p_placar_casa, p_placar_fora, p_horario_inicio, p_status, p_elapsed,
    p_transmissao, p_data_jogo, p_fonte, now()
  )
  ON CONFLICT (id_partida, data_jogo) DO UPDATE SET
    liga_nome = EXCLUDED.liga_nome,
    liga_id = EXCLUDED.liga_id,
    liga_logo = EXCLUDED.liga_logo,
    rodada = EXCLUDED.rodada,
    time_casa = EXCLUDED.time_casa,
    time_fora = EXCLUDED.time_fora,
    emblema_casa = EXCLUDED.emblema_casa,
    emblema_fora = EXCLUDED.emblema_fora,
    placar_casa = EXCLUDED.placar_casa,
    placar_fora = EXCLUDED.placar_fora,
    horario_inicio = EXCLUDED.horario_inicio,
    status = EXCLUDED.status,
    elapsed = EXCLUDED.elapsed,
    transmissao = EXCLUDED.transmissao,
    fonte = EXCLUDED.fonte,
    atualizado_em = now();
END;
$$;
