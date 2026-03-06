import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: stream-proxy', () => {
  // 1. Funcional — URL obrigatória
  it('deve rejeitar requisição sem URL', async () => {
    const { status, data } = await invokeEdge('stream-proxy', {
      body: {},
    });
    expect(status).toBe(400);
    expect(data.error).toContain('required');
  });

  // 2. Segurança — URL interna bloqueada (SSRF)
  it('deve bloquear URLs internas (localhost)', async () => {
    const { status, data } = await invokeEdge('stream-proxy', {
      body: { url: 'http://localhost:8080/admin.mp4' },
    });
    expect(status).toBe(403);
    expect(data.error).toContain('not allowed');
  });

  // 3. Segurança — URL sem extensão de mídia bloqueada
  it('deve bloquear URLs que não são mídia', async () => {
    const { status, data } = await invokeEdge('stream-proxy', {
      body: { url: 'https://example.com/api/secrets' },
    });
    expect(status).toBe(403);
    expect(data.error).toContain('media file');
  });

  // 4. Funcional — URL de mídia inexistente retorna 502
  it('deve retornar 502 para URL de mídia inexistente', async () => {
    const { status } = await invokeEdge('stream-proxy', {
      body: { url: 'http://invalid.example.test/stream.mp4' },
    });
    expect(status).toBe(502);
  });

  // 5. Segurança — não expõe headers internos
  it('resposta de erro não vaza dados sensíveis', async () => {
    const { data } = await invokeEdge('stream-proxy', { body: {} });
    const text = JSON.stringify(data);
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 6. Regressão
  it('erro sem URL mantém formato (regressão)', async () => {
    const { status, data } = await invokeEdge('stream-proxy', { body: {} });
    const current = createSnapshot(status, 'error' in data);
    const baseline = createSnapshot(400, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
