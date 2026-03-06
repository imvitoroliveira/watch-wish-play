import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: n8n-proxy', () => {
  // 1. Funcional — parâmetros obrigatórios
  it('deve rejeitar POST sem webhook_url', async () => {
    const { status, data } = await invokeEdge('n8n-proxy', {
      body: { payload: { test: true } },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('required');
  });

  it('deve rejeitar POST sem payload', async () => {
    const { status, data } = await invokeEdge('n8n-proxy', {
      body: { webhook_url: 'https://example.com' },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('required');
  });

  // 2. Segurança — método GET rejeitado
  it('GET deve retornar 405', async () => {
    const { status } = await invokeEdge('n8n-proxy', { method: 'GET' });
    expect(status).toBe(405);
  });

  // 3. Regressão
  it('erro sem parâmetros mantém formato (regressão)', async () => {
    const { status, data } = await invokeEdge('n8n-proxy', { body: {} });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(400, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
