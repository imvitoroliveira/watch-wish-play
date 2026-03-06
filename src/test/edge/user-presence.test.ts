import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: user-presence', () => {
  // 1. Funcional — heartbeat
  it('heartbeat com username deve retornar ok', async () => {
    const { status, data } = await invokeEdge('user-presence', {
      body: { action: 'heartbeat', username: 'test_heartbeat_user' },
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  // 2. Funcional — logout
  it('logout com username deve retornar ok', async () => {
    const { status, data } = await invokeEdge('user-presence', {
      body: { action: 'logout', username: 'test_heartbeat_user' },
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  // 3. Segurança — list_online sem auth
  it('list_online sem x-admin-auth deve retornar 401', async () => {
    const { status } = await invokeEdge('user-presence', {
      body: { action: 'list_online' },
    });
    expect(status).toBe(401);
  });

  it('list_online com auth inválida deve retornar 401', async () => {
    const { status } = await invokeEdge('user-presence', {
      body: { action: 'list_online' },
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
  });

  // 4. Regressão
  it('heartbeat mantém formato estável (regressão)', async () => {
    const { status, data } = await invokeEdge('user-presence', {
      body: { action: 'heartbeat', username: 'regression_test' },
    });
    const current = createSnapshot(status, 'ok' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
