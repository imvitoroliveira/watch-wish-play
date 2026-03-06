import { describe, it, expect } from 'vitest';
import { invokeEdge, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: tmdb-proxy', () => {
  // 1. Funcional — endpoint válido
  it('deve retornar trending movies', async () => {
    const { status, data } = await invokeEdge('tmdb-proxy', {
      body: { endpoint: '/trending/movie/week' },
    });
    expect(status).toBe(200);
    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);
  });

  // 2. Funcional — endpoint inválido
  it('deve rejeitar endpoint não permitido', async () => {
    const { status, data } = await invokeEdge('tmdb-proxy', {
      body: { endpoint: '/configuration' },
    });
    expect(status).toBe(403);
    expect(data.error).toContain('not allowed');
  });

  it('deve rejeitar endpoint sem barra', async () => {
    const { status } = await invokeEdge('tmdb-proxy', {
      body: { endpoint: 'trending/movie/week' },
    });
    expect(status).toBe(400);
  });

  // 3. Segurança — TMDB token não vazado
  it('não deve vazar TMDB token na resposta', async () => {
    const { data } = await invokeEdge('tmdb-proxy', {
      body: { endpoint: '/trending/movie/week' },
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('TMDB_API_TOKEN');
    expect(text).not.toMatch(/ey[A-Za-z0-9_-]{20,}/); // JWT-like token
  });

  // 4. Regressão
  it('trending mantém estrutura results[] (regressão)', async () => {
    const { status, data } = await invokeEdge('tmdb-proxy', {
      body: { endpoint: '/trending/movie/week' },
    });
    const current = createSnapshot(status, Array.isArray(data.results));
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
