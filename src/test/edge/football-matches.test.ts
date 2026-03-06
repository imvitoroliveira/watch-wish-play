import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: football-matches', () => {
  // 1. Funcional — leitura de jogos
  it('POST deve retornar 200 com estrutura de jogos', async () => {
    const { status, data } = await invokeEdge('football-matches', {
      body: {},
    });
    expect(status).toBe(200);
    // Must have at least one of: matches, jogos, or be an array
    const hasStructure = data.matches !== undefined || data.jogos !== undefined || Array.isArray(data);
    expect(hasStructure).toBe(true);
  });

  // 2. Funcional — resiliência a body inválido (não deve crashar)
  it('deve lidar com body inválido retornando 200', async () => {
    const { status } = await invokeEdge('football-matches', {
      body: { invalid: true },
    });
    expect(status).toBe(200);
  });

  // 3. Segurança — não expõe API keys
  it('resposta não contém chaves de API', async () => {
    const { data } = await invokeEdge('football-matches', { body: {} });
    const text = JSON.stringify(data);
    expect(text).not.toContain('RAPIDAPI');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('APIFOOTBALL');
    expect(text).not.toContain('RAPIDAPI_FOOTBALL_KEY');
    expect(text).not.toContain('APIFOOTBALL_COM_KEY');
  });

  // 4. Funcional — GET também retorna dados
  it('GET deve retornar 200', async () => {
    const { status } = await invokeEdge('football-matches', { method: 'GET' });
    expect(status).toBe(200);
  });

  // 5. Regressão
  it('resposta mantém formato JSON válido (regressão)', async () => {
    const { status, data } = await invokeEdge('football-matches', { body: {} });
    const current = createSnapshot(status, typeof data === 'object');
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
