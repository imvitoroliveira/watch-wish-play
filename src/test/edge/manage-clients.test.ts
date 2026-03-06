import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: manage-clients', () => {
  // 1. Funcional — leitura
  it('GET deve retornar array de clients', async () => {
    const { status, data } = await invokeEdge('manage-clients', { method: 'GET' });
    expect(status).toBe(200);
    expect(Array.isArray(data.clients)).toBe(true);
  });

  // 2. Funcional — validação de POST inválido
  it('POST com array vazio deve retornar 400', async () => {
    const { status, data } = await invokeEdge('manage-clients', {
      body: { clients: [] },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // 3. Segurança — não vaza dados internos
  it('resposta não contém chaves de serviço', async () => {
    const { data } = await invokeEdge('manage-clients', { method: 'GET' });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão
  it('GET mantém formato estável (regressão)', async () => {
    const { status, data } = await invokeEdge('manage-clients', { method: 'GET' });
    const current = createSnapshot(status, 'clients' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
