/**
 * browser-tests.ts — Motor de testes unitários que roda no browser.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  REGRA FUNDAMENTAL — FILOSOFIA DE TESTES                           │
 * │                                                                     │
 * │  Testes existem para IDENTIFICAR PROBLEMAS, não para aceitá-los.   │
 * │                                                                     │
 * │  ✅ Se o código está correto → o teste PASSA                        │
 * │  ❌ Se o código está errado   → o teste FALHA e mostra O QUE errou  │
 * │                                                                     │
 * │  NUNCA ajuste um teste para aceitar um comportamento incorreto.     │
 * │  Se um teste falha, corrija O CÓDIGO, não o teste.                  │
 * │  Mudar o teste para fazer ele passar "esconde" o bug — isso é       │
 * │  mais perigoso do que não ter teste algum.                          │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { parseM3UTitles, normalizeTitle, isInM3UCatalog } from '@/lib/m3u-parser';
import { getStatusLabel, isLive, getReminders, toggleReminder } from '@/lib/football-api';
import { tmdbImg, tmdbBackdrop } from '@/lib/tmdb';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface BrowserTestResult {
  testName: string;
  suiteName: string;
  passed: boolean;
  /** Mensagem de erro com o que era esperado vs o que foi recebido */
  error?: string;
  /** Tempo de execução em milissegundos */
  durationMs: number;
}

export interface BrowserSuiteResult {
  name: string;
  results: BrowserTestResult[];
  passed: number;
  failed: number;
  durationMs: number;
}

export interface BrowserTestRunResult {
  suites: BrowserSuiteResult[];
  totalPassed: number;
  totalFailed: number;
  totalTests: number;
  totalDurationMs: number;
  ranAt: string;
}

// ─── Motor de assertivas ──────────────────────────────────────────────────────

/**
 * Cria um objeto de assertiva similar ao `expect` do Vitest/Jest.
 * Lança erros descritivos quando a assertiva não é satisfeita.
 * Os erros NUNCA são suprimidos — é assim que identificamos problemas.
 */
function expect(actual: unknown) {
  const fmt = (v: unknown) => JSON.stringify(v);

  return {
    toBe(expected: unknown) {
      if (actual !== expected)
        throw new Error(`Esperado: ${fmt(expected)}\n  Recebido: ${fmt(actual)}`);
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Esperado: ${fmt(expected)}\n  Recebido: ${fmt(actual)}`);
    },
    toContain(item: unknown) {
      if (Array.isArray(actual) && !actual.includes(item))
        throw new Error(`Esperado que o array contivesse ${fmt(item)}\n  Array: ${fmt(actual)}`);
      if (typeof actual === 'string' && !actual.includes(String(item)))
        throw new Error(`Esperado que "${actual}" contivesse "${item}"`);
    },
    not: {
      toContain(item: unknown) {
        if (Array.isArray(actual) && actual.includes(item))
          throw new Error(`Esperado que o array NÃO contivesse ${fmt(item)}, mas continha`);
        if (typeof actual === 'string' && actual.includes(String(item)))
          throw new Error(`Esperado que "${actual}" NÃO contivesse "${item}"`);
      },
      toBe(expected: unknown) {
        if (actual === expected)
          throw new Error(`Esperado que NÃO fosse ${fmt(expected)}, mas era`);
      },
    },
    toBeNull() {
      if (actual !== null)
        throw new Error(`Esperado: null\n  Recebido: ${fmt(actual)}`);
    },
    toBeTruthy() {
      if (!actual)
        throw new Error(`Esperado valor truthy\n  Recebido: ${fmt(actual)}`);
    },
    toHaveLength(length: number) {
      const len = Array.isArray(actual) ? actual.length : -1;
      if (len !== length)
        throw new Error(`Esperado length ${length}, recebido ${len}`);
    },
    toMatch(pattern: RegExp | string) {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      if (!regex.test(String(actual)))
        throw new Error(`Esperado que "${actual}" correspondesse a ${pattern}`);
    },
  };
}

// ─── Definição das suítes de teste ───────────────────────────────────────────

interface TestDefinition {
  name: string;
  run: () => void | Promise<void>;
}

interface SuiteDefinition {
  name: string;
  tests: TestDefinition[];
}

const SUITES: SuiteDefinition[] = [
  // ── parseM3UTitles ──────────────────────────────────────────────────────────
  {
    name: 'parseM3UTitles',
    tests: [
      {
        name: 'extrai título simples após a vírgula',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,Oppenheimer\nhttp://stream.example.com/1';
          expect(parseM3UTitles(m3u)).toContain('Oppenheimer');
        },
      },
      {
        name: 'prefere tvg-name quando disponível',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1 tvg-name="Barbie" group-title="Filmes",Barbie HD DUB\nhttp://x.com/2';
          const result = parseM3UTitles(m3u);
          expect(result).toContain('Barbie');
          expect(result).not.toContain('Barbie HD DUB');
        },
      },
      {
        name: 'remove prefixo de qualidade HD',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,HD - Interstellar\nhttp://x.com/3';
          expect(parseM3UTitles(m3u)).toContain('Interstellar');
        },
      },
      {
        name: 'remove prefixo 4K',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,4K Dune Part Two\nhttp://x.com/4';
          expect(parseM3UTitles(m3u)).toContain('Dune Part Two');
        },
      },
      {
        name: 'remove sufixo [DUB]',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,Inception [DUB]\nhttp://x.com/5';
          expect(parseM3UTitles(m3u)).toContain('Inception');
        },
      },
      {
        name: 'remove sufixo (DUBLADO)',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,Joker (DUBLADO)\nhttp://x.com/6';
          expect(parseM3UTitles(m3u)).toContain('Joker');
        },
      },
      {
        name: 'remove indicador de episódio S01E01',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,Breaking Bad S01E01\nhttp://x.com/7';
          expect(parseM3UTitles(m3u)).toContain('Breaking Bad');
        },
      },
      {
        name: 'remove prefixo FILME:',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,FILME: Avatar\nhttp://x.com/8';
          expect(parseM3UTitles(m3u)).toContain('Avatar');
        },
      },
      {
        name: 'deduplica títulos repetidos',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,Matrix\nhttp://x.com/9a\n#EXTINF:-1,Matrix\nhttp://x.com/9b';
          const result = parseM3UTitles(m3u);
          expect(result.filter(t => t === 'Matrix')).toHaveLength(1);
        },
      },
      {
        name: 'ignora linhas que não são #EXTINF',
        run: () => {
          const m3u = '#EXTM3U\nhttp://x.com/10\n#EXT-X-VERSION:3';
          expect(parseM3UTitles(m3u)).toHaveLength(0);
        },
      },
      {
        name: 'descarta títulos com apenas 1 caractere',
        run: () => {
          const m3u = '#EXTM3U\n#EXTINF:-1,A\nhttp://x.com/11';
          expect(parseM3UTitles(m3u)).toHaveLength(0);
        },
      },
      {
        name: 'processa M3U vazia sem erros',
        run: () => {
          expect(parseM3UTitles('')).toHaveLength(0);
        },
      },
    ],
  },

  // ── normalizeTitle ──────────────────────────────────────────────────────────
  {
    name: 'normalizeTitle',
    tests: [
      {
        name: 'converte para minúsculas',
        run: () => expect(normalizeTitle('INTERSTELLAR')).toBe('interstellar'),
      },
      {
        name: 'remove acentos',
        run: () => expect(normalizeTitle('Ação e Aventura')).toBe('acao e aventura'),
      },
      {
        name: 'remove pontuação',
        run: () => expect(normalizeTitle("Schindler's List")).toBe('schindlers list'),
      },
      {
        name: 'normaliza espaços duplos',
        run: () => expect(normalizeTitle('Batman  Begins')).toBe('batman begins'),
      },
      {
        name: 'remove espaços nas bordas',
        run: () => expect(normalizeTitle('  Joker  ')).toBe('joker'),
      },
      {
        name: 'retorna string vazia para entrada vazia',
        run: () => expect(normalizeTitle('')).toBe(''),
      },
      {
        name: 'é idempotente (aplicar duas vezes = mesmo resultado)',
        run: () => {
          const titulo = 'Ação: O Retorno!';
          expect(normalizeTitle(normalizeTitle(titulo))).toBe(normalizeTitle(titulo));
        },
      },
    ],
  },

  // ── isInM3UCatalog ──────────────────────────────────────────────────────────
  {
    name: 'isInM3UCatalog',
    tests: [
      {
        name: 'retorna true para título presente no catálogo',
        run: () => {
          const cat = new Set(['interstellar', 'oppenheimer']);
          expect(isInM3UCatalog('Interstellar', cat)).toBe(true);
        },
      },
      {
        name: 'é case-insensitive',
        run: () => {
          const cat = new Set(['oppenheimer']);
          expect(isInM3UCatalog('OPPENHEIMER', cat)).toBe(true);
        },
      },
      {
        name: 'funciona com título acentuado mapeando para versão sem acento',
        run: () => {
          const cat = new Set(['o poderoso chefao']);
          expect(isInM3UCatalog('O Poderoso Chefão', cat)).toBe(true);
        },
      },
      {
        name: 'retorna false para título ausente',
        run: () => {
          const cat = new Set(['interstellar']);
          expect(isInM3UCatalog('Avatar', cat)).toBe(false);
        },
      },
      {
        name: 'retorna false para string vazia',
        run: () => expect(isInM3UCatalog('', new Set(['interstellar']))).toBe(false),
      },
      {
        name: 'retorna false para título com apenas 1 caractere',
        run: () => expect(isInM3UCatalog('A', new Set(['a']))).toBe(false),
      },
      {
        name: 'retorna false para catálogo vazio',
        run: () => expect(isInM3UCatalog('Interstellar', new Set())).toBe(false),
      },
    ],
  },

  // ── getStatusLabel ──────────────────────────────────────────────────────────
  {
    name: 'getStatusLabel',
    tests: (
      [
        ['NS', 'A iniciar'], ['1H', '1º Tempo'], ['HT', 'Intervalo'],
        ['2H', '2º Tempo'], ['FT', 'Encerrado'], ['AET', 'Prorrogação'],
        ['PEN', 'Pênaltis'], ['SUSP', 'Suspenso'], ['PST', 'Adiado'],
        ['CANC', 'Cancelado'], ['LIVE', 'Ao Vivo'],
      ] as [string, string][]
    ).map(([status, label]) => ({
      name: `'${status}' → '${label}'`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: () => expect(getStatusLabel(status as any)).toBe(label),
    })),
  },

  // ── isLive ──────────────────────────────────────────────────────────────────
  {
    name: 'isLive',
    tests: [
      ...(['1H', 'HT', '2H', 'AET', 'PEN', 'LIVE'] as const).map(s => ({
        name: `'${s}' deve ser ao vivo → true`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: () => expect(isLive(s as any)).toBe(true),
      })),
      ...(['NS', 'FT', 'SUSP', 'PST', 'CANC'] as const).map(s => ({
        name: `'${s}' não está ao vivo → false`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: () => expect(isLive(s as any)).toBe(false),
      })),
    ],
  },

  // ── tmdbImg ─────────────────────────────────────────────────────────────────
  {
    name: 'tmdbImg',
    tests: [
      {
        name: 'retorna URL correta com tamanho padrão w500',
        run: () => expect(tmdbImg('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg'),
      },
      {
        name: 'retorna URL com tamanho w300',
        run: () => expect(tmdbImg('/abc.jpg', 'w300')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg'),
      },
      {
        name: 'retorna URL com tamanho original',
        run: () => expect(tmdbImg('/abc.jpg', 'original')).toBe('https://image.tmdb.org/t/p/original/abc.jpg'),
      },
      {
        name: 'retorna URL válida (não vazia) quando path é null',
        run: () => {
          const r = tmdbImg(null);
          expect(r).toBeTruthy();
          expect(r).toMatch(/^https?:\/\//);
        },
      },
      {
        name: 'placeholder não contém "null" na URL',
        run: () => expect(tmdbImg(null)).not.toContain('null'),
      },
    ],
  },

  // ── tmdbBackdrop ─────────────────────────────────────────────────────────────
  {
    name: 'tmdbBackdrop',
    tests: [
      {
        name: 'retorna null quando path é null',
        run: () => expect(tmdbBackdrop(null)).toBeNull(),
      },
      {
        name: 'retorna URL com tamanho "original"',
        run: () => expect(tmdbBackdrop('/bg.jpg')).toBe('https://image.tmdb.org/t/p/original/bg.jpg'),
      },
    ],
  },
];

// ─── Executor ────────────────────────────────────────────────────────────────

/**
 * Executa todas as suítes de testes no contexto do browser.
 * Retorna os resultados sem lançar exceção — os erros ficam nos resultados.
 *
 * Callback `onTest` é chamado após cada teste para permitir atualização
 * progressiva da UI em tempo real.
 */
export async function runBrowserTests(
  onTest?: (result: BrowserTestResult) => void
): Promise<BrowserTestRunResult> {
  const suiteResults: BrowserSuiteResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  const globalStart = performance.now();

  // Salva e isola localStorage para testes que o usam
  const lsBackup: Record<string, string> = {};
  const ISOLATED_KEYS = ['msc_match_reminders'];
  ISOLATED_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) lsBackup[k] = v;
    localStorage.removeItem(k);
  });

  for (const suite of SUITES) {
    const suiteStart = performance.now();
    const results: BrowserTestResult[] = [];

    for (const test of suite.tests) {
      const testStart = performance.now();
      let passed = false;
      let error: string | undefined;

      try {
        await test.run();
        passed = true;
      } catch (e) {
        // O erro é capturado aqui APENAS para reportar — nunca para esconder
        error = e instanceof Error ? e.message : String(e);
      }

      const result: BrowserTestResult = {
        testName: test.name,
        suiteName: suite.name,
        passed,
        error,
        durationMs: Math.round(performance.now() - testStart),
      };

      results.push(result);
      if (passed) totalPassed++; else totalFailed++;
      onTest?.(result);

      // Limpa o localStorage entre testes para isolamento
      ISOLATED_KEYS.forEach(k => localStorage.removeItem(k));
    }

    suiteResults.push({
      name: suite.name,
      results,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      durationMs: Math.round(performance.now() - suiteStart),
    });
  }

  // Restaura o localStorage original
  ISOLATED_KEYS.forEach(k => {
    localStorage.removeItem(k);
    if (lsBackup[k] !== undefined) localStorage.setItem(k, lsBackup[k]);
  });

  return {
    suites: suiteResults,
    totalPassed,
    totalFailed,
    totalTests: totalPassed + totalFailed,
    totalDurationMs: Math.round(performance.now() - globalStart),
    ranAt: new Date().toISOString(),
  };
}
