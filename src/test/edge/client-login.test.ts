import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: client-login', () => {
  // 1. Funcional — validação de entrada
  it('deve rejeitar login sem username/password', async () => {
    const { status, data } = await invokeEdge('client-login', {
      body: { action: 'login', username: '', password: '' },
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.reason).toBe('invalid');
  });

  it('deve rejeitar credenciais inexistentes', async () => {
    const { status, data } = await invokeEdge('client-login', {
      body: { action: 'login', username: 'nonexistent_user_test_xyz', password: 'wrong' },
    });
    expect([200, 401]).toContain(status);
    expect(data.success).toBe(false);
    expect(data.reason).toBe('invalid');
  });

  it('deve rejeitar ação inválida', async () => {
    const { status, data } = await invokeEdge('client-login', {
      body: { action: 'unknown_action' },
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // 2. Segurança — rate limiting e dados
  it('não deve retornar senha do cliente na resposta', async () => {
    const { data } = await invokeEdge('client-login', {
      body: { action: 'login', username: 'test_user', password: 'test' },
    });
    if (data.client) {
      expect(data.client.p).toBeUndefined();
    }
    const text = JSON.stringify(data).toLowerCase();
    expect(text).not.toContain('service_role');
  });

  // 3. Regressão — formato consistente
  it('resposta de erro mantém formato estável (regressão)', async () => {
    const { status, data } = await invokeEdge('client-login', {
      body: { action: 'login', username: 'x', password: 'y' },
    });
    const current = createSnapshot(status, 'success' in data);
    const baseline = createSnapshot(200, true);
    const cmp = compareSnapshots(current, baseline);
    expect(cmp.structureMatch).toBe(true);
  });
});
