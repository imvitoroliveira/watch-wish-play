import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: app-settings', () => {
  // 1. Funcional — leitura pública
  it('GET deve retornar billing_enabled como booleano', async () => {
    const { status, data } = await invokeEdge('app-settings', { method: 'GET' });
    expect(status).toBe(200);
    expect(typeof data.billing_enabled).toBe('boolean');
  });

  // 2. Segurança — escrita sem autenticação
  it('POST sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('app-settings', {
      body: { billing_enabled: true },
    });
    expect(status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it('POST com credenciais inválidas deve retornar 401', async () => {
    const { status } = await invokeEdge('app-settings', {
      body: { billing_enabled: true },
      headers: { 'x-admin-auth': 'fake:creds' },
    });
    expect(status).toBe(401);
  });

  // 3. Regressão — estrutura GET estável
  it('GET mantém formato de resposta (regressão)', async () => {
    const { status, data } = await invokeEdge('app-settings', { method: 'GET' });
    const current = createSnapshot(status, 'billing_enabled' in data);
    const baseline = createSnapshot(200, true);
    const cmp = compareSnapshots(current, baseline);
    expect(cmp.statusMatch).toBe(true);
    expect(cmp.structureMatch).toBe(true);
  });
});
