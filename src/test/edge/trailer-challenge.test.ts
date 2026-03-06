import { describe, it, expect } from 'vitest';
import { invokeEdge, edgeUrl, defaultHeaders, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: trailer-challenge', () => {
  // 1. Funcional — GET progress
  it('GET deve retornar today e month para username', async () => {
    const url = `${edgeUrl('trailer-challenge')}?username=test_challenge_user`;
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.today).toBeDefined();
    expect(data.month).toBeDefined();
  });

  // 2. Funcional — ação inválida retorna 400
  it('POST com ação desconhecida deve retornar 400', async () => {
    const { status } = await invokeEdge('trailer-challenge', {
      body: { username: 'test', action: 'invalid_action' },
    });
    expect(status).toBe(400);
  });

  // 3. Segurança — sem vazamento
  it('resposta não contém tokens ou chaves', async () => {
    const url = `${edgeUrl('trailer-challenge')}?username=test_user`;
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const text = await res.text();
    expect(text).not.toContain('PUSHALERT');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão
  it('GET mantém formato today/month (regressão)', async () => {
    const url = `${edgeUrl('trailer-challenge')}?username=regression_test`;
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const data = await res.json();
    const current = createSnapshot(res.status, 'today' in data && 'month' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
