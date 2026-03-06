import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: google-sheets-sync', () => {
  // 1. Segurança — sem auth = 401
  it('POST sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('google-sheets-sync', {
      body: { spreadsheet_id: 'test', sheet_name: 'Sheet1', clients: [] },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('POST com auth inválida deve retornar 401', async () => {
    const { status } = await invokeEdge('google-sheets-sync', {
      body: { spreadsheet_id: 'test', sheet_name: 'Sheet1', clients: [] },
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
  });

  // 2. Segurança — método GET bloqueado
  it('GET deve retornar 405', async () => {
    const { status } = await invokeEdge('google-sheets-sync', { method: 'GET' });
    expect(status).toBe(405);
  });

  // 3. Segurança — não vazar segredos
  it('resposta não contém segredos', async () => {
    const { data } = await invokeEdge('google-sheets-sync', {
      body: { spreadsheet_id: 'test', sheet_name: 'Sheet1', clients: [] },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('GOOGLE_SERVICE_ACCOUNT_JSON');
    expect(text).not.toContain('ADMIN_PASS');
    expect(text).not.toContain('private_key');
  });

  // 4. Regressão — formato de erro estável
  it('erro 401 mantém formato estável', async () => {
    const { status, data } = await invokeEdge('google-sheets-sync', {
      body: {},
    });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(401, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
