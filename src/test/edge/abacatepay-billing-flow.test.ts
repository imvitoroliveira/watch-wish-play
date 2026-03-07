import { describe, it, expect } from 'vitest';
import { invokeEdge } from '../helpers/edge-function';

const TEST_USERNAME = 'test.user';

describe('AbacatePay: Fluxo de criação de billing por plano', () => {
  // ── Plano Mensal ──
  it('cria billing para plano MENSAL e retorna URL válida', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'mensal' },
    });
    console.log('[Mensal] status:', status, 'data:', JSON.stringify(data));
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBeDefined();
    expect(typeof data.url).toBe('string');
    expect(data.url).toMatch(/^https?:\/\//);
    expect(data.billing_id).toBeDefined();
  });

  // ── Plano Trimestral ──
  it('cria billing para plano TRIMESTRAL e retorna URL válida', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'trimestral' },
    });
    console.log('[Trimestral] status:', status, 'data:', JSON.stringify(data));
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBeDefined();
    expect(typeof data.url).toBe('string');
    expect(data.url).toMatch(/^https?:\/\//);
    expect(data.billing_id).toBeDefined();
  });

  // ── Plano Semestral ──
  it('cria billing para plano SEMESTRAL e retorna URL válida', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'semestral' },
    });
    console.log('[Semestral] status:', status, 'data:', JSON.stringify(data));
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBeDefined();
    expect(typeof data.url).toBe('string');
    expect(data.url).toMatch(/^https?:\/\//);
    expect(data.billing_id).toBeDefined();
  });

  // ── Validações de segurança ──
  it('rejeita plano inexistente', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'anual' },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('invalid plan');
  });

  it('rejeita username vazio', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: '', plan: 'mensal' },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('rejeita username com caracteres maliciosos', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: '<script>alert(1)</script>', plan: 'mensal' },
    });
    expect(status).toBe(400);
  });

  it('rejeita sem username', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', plan: 'mensal' },
    });
    expect(status).toBe(400);
  });

  it('rejeita sem plan', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME },
    });
    expect(status).toBe(400);
  });

  // ── Respostas não vazam dados sensíveis ──
  it('resposta não vaza chaves ou tokens', async () => {
    const { data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'mensal' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('ABACATEPAY_API_KEY');
    expect(text).not.toContain('NATV_API_TOKEN');
    expect(text).not.toContain('service_role');
  });

  // ── URLs de checkout acessíveis ──
  it('URL do checkout mensal é acessível (HTTP 200)', async () => {
    const { data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: TEST_USERNAME, plan: 'mensal' },
    });
    if (data.url) {
      const res = await fetch(data.url, { method: 'HEAD', redirect: 'follow' });
      await res.text().catch(() => {});
      expect(res.status).toBeLessThan(400);
    }
  });
});
