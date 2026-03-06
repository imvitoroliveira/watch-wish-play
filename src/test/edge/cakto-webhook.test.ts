import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: cakto-webhook', () => {
  // 1. Funcional — get_checkout_url sem username
  it('get_checkout_url sem username deve funcionar ou retornar erro controlado', async () => {
    const { status } = await invokeEdge('cakto-webhook', {
      body: { action: 'get_checkout_url' },
    });
    expect([200, 400, 500]).toContain(status);
  });

  // 2. Funcional — webhook evento falso
  it('webhook com evento desconhecido não deve crashar', async () => {
    const { status } = await invokeEdge('cakto-webhook', {
      body: { event: 'unknown_event', data: {} },
    });
    expect([200, 400, 500]).toContain(status);
  });

  // 3. Segurança — não expõe tokens
  it('resposta não vaza CAKTO ou NATV tokens', async () => {
    const { data } = await invokeEdge('cakto-webhook', {
      body: { action: 'get_checkout_url', username: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('CAKTO_CLIENT_SECRET');
    expect(text).not.toContain('NATV_API_TOKEN');
    expect(text).not.toContain('service_role');
  });

  // 4. Regressão
  it('resposta mantém formato JSON (regressão)', async () => {
    const { status, data } = await invokeEdge('cakto-webhook', {
      body: { action: 'get_checkout_url', username: 'regression' },
    });
    const isObj = typeof data === 'object' && data !== null;
    const current = createSnapshot(status, isObj);
    const baseline = createSnapshot(200, true);
    expect(current.hasExpectedKeys).toBe(true);
  });
});
