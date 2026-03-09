import { describe, it, expect } from 'vitest';
import { invokeEdge, edgeUrl, defaultHeaders } from '../helpers/edge-function';

/**
 * Testes da edge function system-health-check
 * Valida autenticação, execução de testes e gerenciamento de resultados
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe('Edge: system-health-check', () => {
  // ═══════════════════════════════════════════════
  // Segurança e autenticação
  // ═══════════════════════════════════════════════

  it('POST sem auth = 401', async () => {
    const { status, data } = await invokeEdge('system-health-check', {
      body: {},
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('POST com auth inválida = 401', async () => {
    const { status } = await invokeEdge('system-health-check', {
      body: {},
      headers: { 'x-admin-auth': 'fake:wrong' },
    });
    expect(status).toBe(401);
  });

  it('DELETE sem auth = 401', async () => {
    const { status } = await invokeEdge('system-health-check', {
      method: 'DELETE',
      body: { id: 'fake-id' },
    });
    expect(status).toBe(401);
  });

  it('DELETE com auth inválida = 401', async () => {
    const { status } = await invokeEdge('system-health-check', {
      method: 'DELETE',
      body: { id: 'fake-id' },
      headers: { 'x-admin-auth': btoa('wrong:creds') },
    });
    expect(status).toBe(401);
  });

  // ═══════════════════════════════════════════════
  // Leitura de resultados (GET = público)
  // ═══════════════════════════════════════════════

  it('GET retorna array de results', async () => {
    const { status, data } = await invokeEdge('system-health-check', {
      method: 'GET',
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);
  });

  it('GET results tem estrutura esperada', async () => {
    const { status, data } = await invokeEdge('system-health-check', {
      method: 'GET',
    });
    expect(status).toBe(200);
    if (data.results.length > 0) {
      const run = data.results[0];
      expect(run).toHaveProperty('run_id');
      expect(run).toHaveProperty('total_tests');
      expect(run).toHaveProperty('passed');
      expect(run).toHaveProperty('failed');
      expect(run).toHaveProperty('duration_ms');
      expect(run).toHaveProperty('trigger_type');
    }
  });

  // ═══════════════════════════════════════════════
  // Trigger cron (bypass auth)
  // ═══════════════════════════════════════════════

  it('POST com trigger=cron bypassa auth e inicia execução', async () => {
    const { status, data } = await invokeEdge('system-health-check', {
      body: { trigger: 'cron' },
    });
    expect(status).toBe(200);
    expect(data.status).toBe('running');
    expect(data.run_id).toBeDefined();
    expect(data.total).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════
  // CORS
  // ═══════════════════════════════════════════════

  it('OPTIONS retorna CORS headers', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/system-health-check`, {
      method: 'OPTIONS',
    });
    await res.text();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  // ═══════════════════════════════════════════════
  // Método não permitido
  // ═══════════════════════════════════════════════

  it('PUT retorna 405', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/system-health-check`, {
      method: 'PUT',
      headers: defaultHeaders(),
      body: JSON.stringify({}),
    });
    await res.text();
    expect(res.status).toBe(405);
  });

  // ═══════════════════════════════════════════════
  // Segurança de respostas
  // ═══════════════════════════════════════════════

  it('respostas não vazam segredos', async () => {
    const responses = await Promise.all([
      invokeEdge('system-health-check', { method: 'GET' }),
      invokeEdge('system-health-check', { body: {} }),
    ]);

    for (const { data } of responses) {
      const text = JSON.stringify(data).toLowerCase();
      expect(text).not.toContain('service_role');
      expect(text).not.toContain('supabase_service_role_key');
      expect(text).not.toContain('admin_pass');
      expect(text).not.toContain('admin_user');
    }
  });

  // ═══════════════════════════════════════════════
  // DELETE sem id = 400
  // ═══════════════════════════════════════════════

  // Nota: não podemos testar DELETE com auth real sem credenciais,
  // mas validamos que sem auth é rejeitado (acima)
});
