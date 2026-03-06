import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: push-test', () => {
  // 1. Segurança — sem auth = 401
  it('POST sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('push-test', {
      body: { action: 'validate' },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  // 2. Segurança — auth inválida = 401
  it('POST com auth inválida deve retornar 401', async () => {
    const { status, data } = await invokeEdge('push-test', {
      body: { action: 'validate' },
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  // 3. Segurança — GET bloqueado
  it('GET deve retornar 405', async () => {
    const { status, data } = await invokeEdge('push-test', { method: 'GET' });
    expect(status).toBe(405);
    expect(data.error).toContain('Method not allowed');
  });

  // 4. Segurança — não vazar API keys
  it('resposta não contém segredos', async () => {
    const { data } = await invokeEdge('push-test', {
      body: { action: 'validate' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('PUSHALERT_API_KEY');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('ADMIN_PASS');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 5. Funcional — ação inválida sem auth = 401 (auth checked first)
  it('ação inválida sem auth retorna 401 antes de validar action', async () => {
    const { status } = await invokeEdge('push-test', {
      body: { action: 'invalid_xyz' },
    });
    expect(status).toBe(401);
  });

  // 6. Regressão — formato de erro estável
  it('erro 401 mantém formato { error: "Unauthorized" }', async () => {
    const { status, data } = await invokeEdge('push-test', {
      body: { action: 'validate' },
    });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(401, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
