import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: n8n-proxy', () => {
  // 1. Segurança — sem auth = 401
  it('POST sem x-admin-auth deve retornar 401', async () => {
    const { status, data } = await invokeEdge('n8n-proxy', {
      body: { webhook_url: 'https://hooks.n8n.cloud/test', payload: { test: true } },
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  // 2. Segurança — auth inválida = 401
  it('POST com auth inválida deve retornar 401', async () => {
    const { status } = await invokeEdge('n8n-proxy', {
      body: { webhook_url: 'https://hooks.n8n.cloud/test', payload: { test: true } },
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
  });

  // 3. Segurança — GET bloqueado
  it('GET deve retornar 405', async () => {
    const { status } = await invokeEdge('n8n-proxy', { method: 'GET' });
    expect(status).toBe(405);
  });

  // 4. Segurança — domínio não autorizado = 403 (precisa auth válida para chegar lá)
  // Este teste depende de auth válida, então sem auth retorna 401
  it('sem auth, domínio bloqueado é irrelevante (401 primeiro)', async () => {
    const { status } = await invokeEdge('n8n-proxy', {
      body: { webhook_url: 'https://evil.com/steal', payload: { test: true } },
    });
    expect(status).toBe(401);
  });

  // 5. Segurança — não vazar segredos
  it('resposta não contém segredos', async () => {
    const { data } = await invokeEdge('n8n-proxy', {
      body: { webhook_url: 'https://hooks.n8n.cloud/test', payload: { test: true } },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('ADMIN_PASS');
    expect(text).not.toContain('ADMIN_USER');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 6. Regressão — formato de erro estável
  it('erro 401 mantém formato estável', async () => {
    const { status, data } = await invokeEdge('n8n-proxy', { body: {} });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(401, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
