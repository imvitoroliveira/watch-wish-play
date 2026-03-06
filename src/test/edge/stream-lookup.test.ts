import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: stream-lookup', () => {
  // 1. Funcional — título obrigatório
  it('deve rejeitar requisição sem título com 400', async () => {
    const { status } = await invokeEdge('stream-lookup', {
      body: {},
    });
    expect(status).toBe(400);
  });

  // 2. Funcional — título inexistente retorna 404 com stream_url null
  it('título inexistente deve retornar 404', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'zzzz_nonexistent_movie_title_xyz_9999' },
    });
    expect(status).toBe(404);
    expect(data.stream_url).toBeNull();
  });

  // 3. Segurança
  it('não expõe source_url ou chaves internas', async () => {
    const { data } = await invokeEdge('stream-lookup', {
      body: { title: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('source_url');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão — resposta é JSON válido
  it('resposta mantém formato stream_url (regressão)', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'regression_test' },
    });
    expect(status).toBe(404);
    const current = createSnapshot(status, 'stream_url' in data);
    const baseline = createSnapshot(404, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
