import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: abacatepay-webhook', () => {
  // 1. Funcional — create_billing sem username retorna 400
  it('create_billing sem username retorna 400', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', plan: 'mensal' },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // 2. Funcional — create_billing sem plan retorna 400
  it('create_billing sem plan retorna 400', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: 'test_user' },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // 3. Funcional — create_billing com plan inválido retorna 400
  it('create_billing com plan inválido retorna 400', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: 'test_user', plan: 'invalido' },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('invalid plan');
  });

  // 4. Funcional — webhook com evento desconhecido retorna 200
  it('webhook com evento desconhecido retorna 200', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'unknown_event', data: {} },
    });
    expect(status).toBe(200);
    expect(data.received).toBe(true);
  });

  // 5. Funcional — webhook billing.paid sem username retorna 400
  it('webhook billing.paid sem username no metadata retorna 400', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'billing.paid', data: { metadata: {}, id: 'test_123' } },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('no username');
  });

  // 6. Segurança — resposta não vaza tokens
  it('resposta não vaza tokens ou secrets', async () => {
    const { data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('ABACATEPAY_API_KEY');
    expect(text).not.toContain('NATV_API_TOKEN');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(text).not.toContain('ABACATEPAY_WEBHOOK_SECRET');
  });

  // 7. Segurança — POST sem body retorna erro (não crash)
  it('POST sem body não causa crash', async () => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abacatepay-webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: 'not-json',
      }
    );
    const text = await res.text();
    expect(res.status).toBe(400);
  });

  // 8. Regressão — formato JSON estável para evento desconhecido
  it('resposta mantém formato JSON (regressão)', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'test_event', data: {} },
    });
    expect(status).toBe(200);
    const isObj = typeof data === 'object' && data !== null;
    const current = createSnapshot(status, isObj);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });

  // 9. Funcional — OPTIONS retorna CORS headers
  it('OPTIONS retorna CORS headers', async () => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abacatepay-webhook`,
      { method: 'OPTIONS' }
    );
    await res.text();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
