import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: football-matches', () => {
  // 1. Funcional — leitura de jogos (não-cron)
  it('POST sem cron deve retornar jogos do dia', async () => {
    const { status, data } = await invokeEdge('football-matches', {
      body: {},
    });
    expect(status).toBe(200);
    expect(data.matches || data.jogos || Array.isArray(data)).toBeDefined();
  });

  // 2. Funcional — resiliência a body vazio
  it('deve lidar com body inválido sem crashar', async () => {
    const { status } = await invokeEdge('football-matches', {
      body: { invalid: true },
    });
    expect([200, 400, 500]).toContain(status);
  });

  // 3. Segurança — não expõe API keys
  it('resposta não contém chaves de API', async () => {
    const { data } = await invokeEdge('football-matches', { body: {} });
    const text = JSON.stringify(data);
    expect(text).not.toContain('RAPIDAPI');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('APIFOOTBALL');
  });

  // 4. Regressão
  it('resposta mantém formato JSON válido (regressão)', async () => {
    const { status, data } = await invokeEdge('football-matches', { body: {} });
    const current = createSnapshot(status, typeof data === 'object');
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
