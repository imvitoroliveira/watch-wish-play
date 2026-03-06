import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: admin-login', () => {
  // 1. Validação funcional — erros esperados
  it('deve rejeitar credenciais vazias com 400', async () => {
    const { status, data } = await invokeEdge('admin-login', { body: { user: '', pass: '' } });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('deve rejeitar credenciais inválidas com 401', async () => {
    const { status, data } = await invokeEdge('admin-login', {
      body: { user: 'fake_user_xyz', pass: 'wrong_pass_xyz' },
    });
    expect(status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  // 2. Segurança — não vaza informações sensíveis
  it('não deve vazar detalhes de configuração na resposta de erro', async () => {
    const { data } = await invokeEdge('admin-login', {
      body: { user: 'test', pass: 'test' },
    });
    const text = JSON.stringify(data).toLowerCase();
    expect(text).not.toContain('admin_user');
    expect(text).not.toContain('admin_pass');
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('supabase_url');
  });

  it('deve rejeitar método GET', async () => {
    const { status } = await invokeEdge('admin-login', { method: 'GET' });
    expect(status).toBe(405);
  });

  // 3. Regressão — estrutura de resposta estável
  it('resposta de erro mantém estrutura esperada (regressão)', async () => {
    const { status, data } = await invokeEdge('admin-login', {
      body: { user: 'x', pass: 'y' },
    });
    const current = createSnapshot(status, 'success' in data && 'error' in data);
    const baseline = createSnapshot(401, true);
    const cmp = compareSnapshots(current, baseline);
    expect(cmp.statusMatch).toBe(true);
    expect(cmp.structureMatch).toBe(true);
  });
});
