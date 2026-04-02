/**
 * Testes unitários — tmdb.ts
 *
 * Cobre as funções puras de geração de URL:
 *  - tmdbImg: gera URL de poster/thumbnail
 *  - tmdbBackdrop: gera URL de imagem de fundo
 *
 * Funções que chamam o Supabase (getTrending, searchMovies, etc.)
 * dependem de rede e não são testadas aqui.
 */

import { describe, it, expect } from 'vitest';
import { tmdbImg, tmdbBackdrop } from '@/lib/tmdb';

const BASE = 'https://image.tmdb.org/t/p';

// ─────────────────────────────────────────────
// tmdbImg
// ─────────────────────────────────────────────

describe('tmdbImg', () => {
  it('retorna URL correta com tamanho padrão (w500)', () => {
    expect(tmdbImg('/abc123.jpg')).toBe(`${BASE}/w500/abc123.jpg`);
  });

  it('retorna URL com tamanho w300', () => {
    expect(tmdbImg('/abc123.jpg', 'w300')).toBe(`${BASE}/w300/abc123.jpg`);
  });

  it('retorna URL com tamanho original', () => {
    expect(tmdbImg('/abc123.jpg', 'original')).toBe(`${BASE}/original/abc123.jpg`);
  });

  it('retorna URL de placeholder quando path é null', () => {
    const result = tmdbImg(null);
    // Deve ser uma URL válida (não vazia)
    expect(result).toBeTruthy();
    expect(result).toMatch(/^https?:\/\//);
  });

  it('placeholder não contém "null" na URL', () => {
    expect(tmdbImg(null)).not.toContain('null');
  });

  it('constrói URL com path que começa com "/"', () => {
    const url = tmdbImg('/poster.jpg', 'w200');
    expect(url).toBe(`${BASE}/w200/poster.jpg`);
  });
});

// ─────────────────────────────────────────────
// tmdbBackdrop
// ─────────────────────────────────────────────

describe('tmdbBackdrop', () => {
  it('retorna null quando path é null', () => {
    expect(tmdbBackdrop(null)).toBeNull();
  });

  it('retorna URL com tamanho "original"', () => {
    expect(tmdbBackdrop('/backdrop.jpg')).toBe(`${BASE}/original/backdrop.jpg`);
  });

  it('URL resultante é uma string válida', () => {
    const url = tmdbBackdrop('/backdrop.jpg');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  });
});
