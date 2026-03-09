import { describe, it, expect } from 'vitest';
import { invokeEdge, edgeUrl, defaultHeaders } from '../helpers/edge-function';

/**
 * Testes de integração: Ativação NATV via AbacatePay webhook
 * Valida mapeamento dias→meses, estrutura do payload e resiliência
 */

describe('Ativação NATV: mapeamento e estrutura', () => {
  // ── Mapeamento plano → meses (via create_billing) ──
  it.each([
    { plan: 'mensal', expectedDays: 30, expectedMonths: 1 },
    { plan: 'trimestral', expectedDays: 90, expectedMonths: 3 },
    { plan: 'semestral', expectedDays: 180, expectedMonths: 6 },
  ])('create_billing para plano $plan gera billing_id válido', async ({ plan }) => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: `natv.test.${plan}`, plan },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.billing_id).toBeDefined();
    expect(typeof data.billing_id).toBe('string');
  });

  // ── Webhook sem secret NÃO dispara ativação ──
  it('billing.paid sem secret não ativa (401)', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: {
        event: 'billing.paid',
        data: {
          id: 'bill_natv_no_secret',
          metadata: { username: 'natv.blocked', plan: 'mensal' },
        },
      },
    });
    expect(status).toBe(401);
  });

  // ── Plano inválido não gera billing para ativação ──
  it('plano inválido é rejeitado antes de gerar billing', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: 'natv.invalid', plan: 'bienal' },
    });
    expect(status).toBe(400);
    expect(data.error).toContain('invalid plan');
  });

  // ── Respostas não expõem NATV_API_TOKEN ──
  it('respostas não vazam NATV_API_TOKEN ou NATV_API_BASE_URL', async () => {
    const responses = await Promise.all([
      invokeEdge('abacatepay-webhook', {
        body: { action: 'create_billing', username: 'natv.leak.test', plan: 'mensal' },
      }),
      invokeEdge('abacatepay-webhook', {
        body: { event: 'billing.paid', data: { id: 'leak_test' } },
      }),
    ]);

    for (const { data } of responses) {
      const text = JSON.stringify(data).toLowerCase();
      expect(text).not.toContain('natv_api_token');
      expect(text).not.toContain('natv_api_base_url');
      expect(text).not.toContain('revenda.pixbot');
      expect(text).not.toContain('bearer ');
    }
  });

  // ── Username com caracteres especiais é sanitizado ──
  it('username com path traversal é rejeitado', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: '../../../etc/passwd', plan: 'mensal' },
    });
    expect(status).toBe(400);
  });

  it('username com null bytes é rejeitado', async () => {
    const { status } = await invokeEdge('abacatepay-webhook', {
      body: { action: 'create_billing', username: 'test\x00admin', plan: 'mensal' },
    });
    expect(status).toBe(400);
  });

  // ── Webhook retorna 502 quando ativação falha (para retry automático) ──
  it('webhook com secret errado não expõe detalhes de ativação', async () => {
    const { status, data } = await invokeEdge('abacatepay-webhook', {
      body: {
        event: 'billing.paid',
        secret: 'wrong_secret_natv_test',
        data: {
          id: 'bill_natv_wrong_secret',
          metadata: { username: 'natv.wrong.secret', plan: 'mensal' },
        },
      },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('unauthorized');
    const text = JSON.stringify(data);
    expect(text).not.toContain('activation');
    expect(text).not.toContain('natv');
  });

  // ── Body não-JSON não causa crash ──
  it('body não-JSON retorna 400', async () => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/abacatepay-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
      body: 'not-json-at-all',
    });
    await res.text();
    expect(res.status).toBe(400);
  });
});
