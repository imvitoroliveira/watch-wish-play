import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

const ADMIN_AUTH = btoa('admin:admin'); // placeholder — real creds in env

describe('Edge: manage-clients', () => {
  // 1. Segurança — sem auth = 401
  it('GET sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('manage-clients', { method: 'GET' });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('POST sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('manage-clients', {
      body: { clients: [{ usuario: 'test', senha: '123' }] },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('GET com auth inválida deve retornar 401', async () => {
    const { status } = await invokeEdge('manage-clients', {
      method: 'GET',
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
  });

  // 2. Funcional — com auth válida (depende de ADMIN_USER/ADMIN_PASS reais)
  // Estes testes validam o formato de resposta quando auth falha
  it('resposta de erro não contém chaves de serviço', async () => {
    const { data } = await invokeEdge('manage-clients', { method: 'GET' });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(text).not.toContain('ADMIN_PASS');
  });

  // 3. Funcional — POST com array vazio + auth inválida = 401 (auth checked first)
  it('POST com array vazio sem auth = 401 (auth antes de validação)', async () => {
    const { status } = await invokeEdge('manage-clients', {
      body: { clients: [] },
    });
    expect(status).toBe(401);
  });

  // 4. Regressão — formato de erro estável
  it('erro 401 mantém formato { error: "Unauthorized" }', async () => {
    const { status, data } = await invokeEdge('manage-clients', { method: 'GET' });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(401, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
