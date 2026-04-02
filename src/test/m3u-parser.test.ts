/**
 * Testes unitários — m3u-parser.ts
 *
 * Cobre as 3 funções públicas puras (sem dependência de rede):
 *  - parseM3UTitles: extrai títulos de uma string M3U (LEGADO)
 *  - normalizeTitle: normaliza texto para comparação fuzzy
 *  - isInM3UCatalog: verifica se um título está no catálogo
 */

import { describe, it, expect } from 'vitest';
import { parseM3UTitles, normalizeTitle, isInM3UCatalog } from '@/lib/m3u-parser';

// ─────────────────────────────────────────────
// parseM3UTitles
// ─────────────────────────────────────────────

describe('parseM3UTitles', () => {
  it('extrai título simples após a vírgula', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,Oppenheimer\nhttp://stream.example.com/1`;
    expect(parseM3UTitles(m3u)).toContain('Oppenheimer');
  });

  it('prefere tvg-name quando disponível', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 tvg-name="Barbie (2023)" group-title="Filmes",Barbie HD\nhttp://stream.example.com/2`;
    const result = parseM3UTitles(m3u);
    expect(result).toContain('Barbie');
    expect(result).not.toContain('Barbie HD');
  });

  it('remove prefixo de qualidade HD', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,HD - Interstellar\nhttp://stream.example.com/3`;
    expect(parseM3UTitles(m3u)).toContain('Interstellar');
  });

  it('remove prefixo 4K', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,4K Dune Part Two\nhttp://stream.example.com/4`;
    expect(parseM3UTitles(m3u)).toContain('Dune Part Two');
  });

  it('remove sufixo [DUB]', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,Inception [DUB]\nhttp://stream.example.com/5`;
    expect(parseM3UTitles(m3u)).toContain('Inception');
  });

  it('remove sufixo (DUBLADO)', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,Joker (DUBLADO)\nhttp://stream.example.com/6`;
    expect(parseM3UTitles(m3u)).toContain('Joker');
  });

  it('remove indicador de episódio S01E01', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,Breaking Bad S01E01\nhttp://stream.example.com/7`;
    expect(parseM3UTitles(m3u)).toContain('Breaking Bad');
  });

  it('remove prefixo FILME:', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,FILME: Avatar\nhttp://stream.example.com/8`;
    expect(parseM3UTitles(m3u)).toContain('Avatar');
  });

  it('deduplica títulos repetidos', () => {
    const m3u = [
      '#EXTM3U',
      '#EXTINF:-1,Matrix',
      'http://stream.example.com/9a',
      '#EXTINF:-1,Matrix',
      'http://stream.example.com/9b',
    ].join('\n');
    const result = parseM3UTitles(m3u);
    expect(result.filter(t => t === 'Matrix')).toHaveLength(1);
  });

  it('ignora linhas que não são #EXTINF', () => {
    const m3u = `#EXTM3U\nhttp://stream.example.com/10\n#EXT-X-VERSION:3`;
    expect(parseM3UTitles(m3u)).toHaveLength(0);
  });

  it('descarta títulos com apenas 1 caractere', () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,A\nhttp://stream.example.com/11`;
    expect(parseM3UTitles(m3u)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// normalizeTitle
// ─────────────────────────────────────────────

describe('normalizeTitle', () => {
  it('converte para minúsculas', () => {
    expect(normalizeTitle('INTERSTELLAR')).toBe('interstellar');
  });

  it('remove acentos', () => {
    expect(normalizeTitle('Ação e Aventura')).toBe('acao e aventura');
  });

  it('remove pontuação', () => {
    expect(normalizeTitle("Schindler's List")).toBe('schindlers list');
  });

  it('normaliza espaços duplos', () => {
    expect(normalizeTitle('Batman  Begins')).toBe('batman begins');
  });

  it('remove espaços nas bordas', () => {
    expect(normalizeTitle('  Joker  ')).toBe('joker');
  });

  it('é idempotente', () => {
    const titulo = 'Ação: O Retorno!';
    expect(normalizeTitle(normalizeTitle(titulo))).toBe(normalizeTitle(titulo));
  });
});

// ─────────────────────────────────────────────
// isInM3UCatalog (NOVO FORMATO ID|TYPE)
// ─────────────────────────────────────────────

describe('isInM3UCatalog com IDs', () => {
  // Catálogo simulado com o novo formato vindo do backend
  const catalogoFormatado = new Set([
    'interstellar',
    'oppenheimer',
    'breaking bad',
    'o poderoso chefao',
  ]);

  it('retorna true para título presente no catálogo formatado', () => {
    expect(isInM3UCatalog('Interstellar', catalogoFormatado)).toBe(true);
  });

  it('é case-insensitive no catálogo formatado', () => {
    expect(isInM3UCatalog('OPPENHEIMER', catalogoFormatado)).toBe(true);
  });

  it('funciona com acentos mapeando para versão sem acento', () => {
    expect(isInM3UCatalog('O Poderoso Chefão', catalogoFormatado)).toBe(true);
  });

  it('retorna false para título ausente', () => {
    expect(isInM3UCatalog('Avatar', catalogoFormatado)).toBe(false);
  });

  it('retorna false para catálogo vazio', () => {
    expect(isInM3UCatalog('Interstellar', new Set())).toBe(false);
  });
});

