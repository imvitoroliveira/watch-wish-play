import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: stream-proxy', () => {
  // 1. Funcional — URL obrigatória
  it('deve rejeitar requisição sem URL', async () => {
    const { status, data } = await invokeEdge('stream-proxy', {
      body: {},
    });
    expect(status).toBe(400);
    expect(data.error).toContain('required');
  });

  // 2. Funcional — URL inválida retorna 502 (upstream error)
  it('deve retornar 502 para URL inexistente', async () => {
    const { status } = await invokeEdge('stream-proxy', {
      body: { url: 'http://invalid.example.test/stream.mp4' },
    });
    expect(status).toBe(502);
  });

  // 3. Segurança — não expõe headers internos
  it('resposta de erro não vaza dados sensíveis', async () => {
    const { data } = await invokeEdge('stream-proxy', { body: {} });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão
  it('erro sem URL mantém formato (regressão)', async () => {
    const { status, data } = await invokeEdge('stream-proxy', { body: {} });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(400, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
