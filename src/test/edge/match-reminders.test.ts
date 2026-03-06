import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: match-reminders', () => {
  // 1. Funcional — listar lembretes
  it('POST list deve retornar array de reminders', async () => {
    const { status, data } = await invokeEdge('match-reminders', {
      body: { action: 'list', username: 'test_reminder_user' },
    });
    expect(status).toBe(200);
    expect(data.reminders).toBeDefined();
    expect(Array.isArray(data.reminders)).toBe(true);
  });

  // 2. Funcional — ação inválida
  it('POST com ação desconhecida deve retornar erro', async () => {
    const { status } = await invokeEdge('match-reminders', {
      body: { action: 'unknown' },
    });
    expect([400, 405, 500]).toContain(status);
  });

  // 3. Segurança
  it('resposta não vaza informações internas', async () => {
    const { data } = await invokeEdge('match-reminders', {
      body: { action: 'list', username: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('PUSHALERT');
  });

  // 4. Regressão
  it('list mantém formato reminders[] (regressão)', async () => {
    const { status, data } = await invokeEdge('match-reminders', {
      body: { action: 'list', username: 'regression' },
    });
    const current = createSnapshot(status, 'reminders' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
