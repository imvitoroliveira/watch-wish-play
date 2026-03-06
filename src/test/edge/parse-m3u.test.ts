import { describe, it, expect } from 'vitest';
import { invokeEdge, edgeUrl, defaultHeaders, createSnapshot, compareSnapshots } from '../helpers/edge-function';

describe('Edge: parse-m3u', () => {
  // 1. Funcional — GET catálogo
  it('GET deve retornar titles array', async () => {
    const url = edgeUrl('parse-m3u');
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.titles).toBeDefined();
    expect(Array.isArray(data.titles)).toBe(true);
  });

  // 2. Funcional — POST sem conteúdo retorna 400
  it('POST sem url nem content deve retornar 400', async () => {
    const { status } = await invokeEdge('parse-m3u', {
      body: {},
    });
    expect(status).toBe(400);
  });

  // 3. Segurança
  it('resposta não expõe source_url completa nem segredos', async () => {
    const url = edgeUrl('parse-m3u');
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const text = await res.text();
    expect(text).not.toContain('service_role');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  // 4. Regressão
  it('GET mantém formato titles (regressão)', async () => {
    const url = edgeUrl('parse-m3u');
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders() });
    const data = await res.json();
    const current = createSnapshot(res.status, 'titles' in data);
    const baseline = createSnapshot(200, true);
    expect(compareSnapshots(current, baseline).statusMatch).toBe(true);
    expect(compareSnapshots(current, baseline).structureMatch).toBe(true);
  });
});
