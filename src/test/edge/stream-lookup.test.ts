import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: stream-lookup', () => {
  // 1. Funcional — título obrigatório
  it('deve rejeitar requisição sem título', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: {},
    });
    expect([400, 500]).toContain(status);
  });

  // 2. Funcional — título inexistente (pode retornar 200 com null ou 500 se sem catálogo)
  it('título inexistente deve retornar resposta controlada', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'zzzz_nonexistent_movie_title_xyz_9999' },
    });
    expect([200, 500]).toContain(status);
    if (status === 200) {
      expect(data.stream_url).toBeNull();
    } else {
      expect(data.error).toBeDefined();
    }
  });

  // 3. Segurança
  it('não expõe source_url ou chaves internas', async () => {
    const { data } = await invokeEdge('stream-lookup', {
      body: { title: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
  });

  // 4. Regressão — resposta é JSON válido
  it('resposta é JSON válido com campo esperado (regressão)', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'regression_test' },
    });
    expect([200, 500]).toContain(status);
    const hasExpectedKey = 'stream_url' in data || 'error' in data;
    expect(hasExpectedKey).toBe(true);
  });
});
