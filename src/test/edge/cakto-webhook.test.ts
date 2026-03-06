import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: cakto-webhook', () => {
  // 1. Funcional — get_checkout_url sem plan deve retornar 400
  it('get_checkout_url sem plan deve retornar 400', async () => {
    const { status, data } = await invokeEdge('cakto-webhook', {
      body: { action: 'get_checkout_url', username: 'hc_test' },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // 2. Funcional — webhook evento falso retorna 200 (ignora gracefully)
  it('webhook com evento desconhecido retorna 200', async () => {
    const { status } = await invokeEdge('cakto-webhook', {
      body: { event: 'unknown_event', data: {} },
    });
    expect(status).toBe(200);
  });

  // 3. Segurança — não expõe tokens
  it('resposta não vaza CAKTO ou NATV tokens', async () => {
    const { data } = await invokeEdge('cakto-webhook', {
      body: { action: 'get_checkout_url', username: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('CAKTO_CLIENT_SECRET');
    expect(text).not.toContain('CAKTO_CLIENT_ID');
    expect(text).not.toContain('NATV_API_TOKEN');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão — formato JSON estável
  it('resposta mantém formato JSON (regressão)', async () => {
    const { status, data } = await invokeEdge('cakto-webhook', {
      body: { event: 'unknown_hc', data: {} },
    });
    expect(status).toBe(200);
    const isObj = typeof data === 'object' && data !== null;
    const current = createSnapshot(status, isObj);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
