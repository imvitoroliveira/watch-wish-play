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

  // 5. Segurança — billing.paid SEM webhook secret retorna 401
  it('webhook billing.paid sem secret retorna 401', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'billing.paid', data: { metadata: { username: 'test', plan: 'mensal' }, id: 'test_123' } },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('unauthorized');
  });

  // 6. Segurança — billing.paid com secret INVÁLIDO retorna 401
  it('webhook billing.paid com secret inválido retorna 401', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'billing.paid', secret: 'wrong_secret_value', data: { metadata: { username: 'test', plan: 'mensal' }, id: 'test_456' } },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('unauthorized');
  });

  // 7. Segurança — resposta não vaza tokens
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

  // 8. Segurança — POST sem body retorna erro (não crash)
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
    await res.text();
    expect(res.status).toBe(400);
  });

  // 9. Regressão — formato JSON estável para evento desconhecido
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

  // 10. Funcional — OPTIONS retorna CORS headers
  it('OPTIONS retorna CORS headers', async () => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abacatepay-webhook`,
      { method: 'OPTIONS' }
    );
    await res.text();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  // 11. Segurança — username com caracteres especiais é rejeitado
  it('webhook rejeita username com caracteres maliciosos', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { 
        event: 'billing.paid', 
        secret: 'fake_but_testing_format',
        data: { metadata: { username: '<script>alert(1)</script>', plan: 'mensal' }, id: 'test_789' } 
      },
    });
    // Should be 401 (secret wrong) or 400 (username invalid) — either way, not 200
    expect(status).not.toBe(200);
  });

  // 12. Segurança — erro interno não vaza stack traces
  it('erro interno retorna mensagem genérica', async () => {
    const { data } = await invokeEdge('abacatepay-webhook', {
      body: { event: 'billing.paid', data: null },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('at ');
    expect(text).not.toContain('index.ts');
    expect(text).not.toContain('Deno');
  });
});
