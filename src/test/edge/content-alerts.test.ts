import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: content-alerts', () => {
  // 1. Funcional — listar alertas
  it('POST list deve retornar array de alertas', async () => {
    const { status, data } = await invokeEdge('content-alerts', {
      body: { action: 'list', username: 'test_alert_user' },
    });
    expect(status).toBe(200);
    expect(data.alerts).toBeDefined();
    expect(Array.isArray(data.alerts)).toBe(true);
  });

  // 2. Funcional — ação inválida
  it('POST com ação inválida deve retornar erro', async () => {
    const { status } = await invokeEdge('content-alerts', {
      body: { action: 'invalid' },
    });
    expect([400, 500]).toContain(status);
  });

  // 3. Segurança
  it('não deve expor chaves de API', async () => {
    const { data } = await invokeEdge('content-alerts', {
      body: { action: 'list', username: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('PUSHALERT');
    expect(text).not.toContain('service_role');
  });

  // 4. Regressão
  it('list mantém formato (regressão)', async () => {
    const { status, data } = await invokeEdge('content-alerts', {
      body: { action: 'list', username: 'regression' },
    });
    const current = createSnapshot(status, 'alerts' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
