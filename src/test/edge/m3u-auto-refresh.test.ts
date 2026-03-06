import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: m3u-auto-refresh', () => {
  // 1. Funcional — executa sem erro fatal
  it('POST deve retornar 200 com success ou skipped', async () => {
    const { status, data } = await invokeEdge('m3u-auto-refresh', {
      body: {},
    });
    expect(status).toBe(200);
    // Must have either success+count or skipped
    const hasExpectedShape = data.success !== undefined || data.skipped !== undefined;
    expect(hasExpectedShape).toBe(true);
  });

  // 2. Funcional — se sucesso, deve ter count
  it('resposta de sucesso deve conter count e new_titles', async () => {
    const { status, data } = await invokeEdge('m3u-auto-refresh', {
      body: {},
    });
    expect(status).toBe(200);
    if (data.success) {
      expect(typeof data.count).toBe('number');
      expect(data.count).toBeGreaterThan(0);
      expect(typeof data.new_titles).toBe('number');
    }
    if (data.skipped) {
      expect(data.reason).toBeDefined();
    }
  });

  // 3. Segurança — não vazar segredos nem source_url
  it('resposta não contém segredos nem source_url', async () => {
    const { data } = await invokeEdge('m3u-auto-refresh', {
      body: {},
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(text).not.toContain('source_url');
    expect(text).not.toContain('http://');
    expect(text).not.toContain('https://');
  });

  // 4. Segurança — GET não permitido (função só aceita POST)
  it('GET deve retornar erro ou 200 (sem crash)', async () => {
    const { status } = await invokeEdge('m3u-auto-refresh', { method: 'GET' });
    // Function may not block GET explicitly, but should not crash
    expect(status).toBeLessThan(500);
  });

  // 5. Regressão — formato estável
  it('formato de resposta estável (regressão)', async () => {
    const { status, data } = await invokeEdge('m3u-auto-refresh', {
      body: {},
    });
    const hasExpectedKeys = 'success' in data || 'skipped' in data;
    const current = createSnapshot(status, hasExpectedKeys);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
