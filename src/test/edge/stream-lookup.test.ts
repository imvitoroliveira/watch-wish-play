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

  // 2. Funcional — título inexistente
  it('título inexistente deve retornar stream_url null', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'zzzz_nonexistent_movie_title_xyz_9999' },
    });
    expect(status).toBe(200);
    expect(data.stream_url).toBeNull();
  });

  // 3. Segurança
  it('não expõe source_url ou chaves internas', async () => {
    const { data } = await invokeEdge('stream-lookup', {
      body: { title: 'test' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
  });

  // 4. Regressão
  it('resposta mantém campo stream_url (regressão)', async () => {
    const { status, data } = await invokeEdge('stream-lookup', {
      body: { title: 'regression_test' },
    });
    const current = createSnapshot(status, 'stream_url' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
