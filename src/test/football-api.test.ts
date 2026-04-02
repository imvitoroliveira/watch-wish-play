/**
 * Testes unitários — football-api.ts
 *
 * Cobre as funções puras (sem dependência de rede):
 *  - getStatusLabel: traduz código de status para português
 *  - isLive: determina se uma partida está em andamento
 *
 * getTodayMatches chama o Supabase e não é testada aqui.
 * getReminders / toggleReminder dependem do localStorage — testadas separadamente.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStatusLabel, isLive, getReminders, toggleReminder } from '@/lib/football-api';

// ─────────────────────────────────────────────
// getStatusLabel
// ─────────────────────────────────────────────

describe('getStatusLabel', () => {
  const casos: Array<[string, string]> = [
    ['NS',   'A iniciar'],
    ['1H',   '1º Tempo'],
    ['HT',   'Intervalo'],
    ['2H',   '2º Tempo'],
    ['FT',   'Encerrado'],
    ['AET',  'Prorrogação'],
    ['PEN',  'Pênaltis'],
    ['SUSP', 'Suspenso'],
    ['PST',  'Adiado'],
    ['CANC', 'Cancelado'],
    ['LIVE', 'Ao Vivo'],
  ];

  it.each(casos)('traduz "%s" para "%s"', (status, esperado) => {
    // @ts-expect-error — passando string para testar todos os casos
    expect(getStatusLabel(status)).toBe(esperado);
  });

  it('retorna o próprio código para status desconhecido', () => {
    // @ts-expect-error — testando caso não mapeado
    expect(getStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

// ─────────────────────────────────────────────
// isLive
// ─────────────────────────────────────────────

describe('isLive', () => {
  const statusAoVivo = ['1H', 'HT', '2H', 'AET', 'PEN', 'LIVE'] as const;
  const statusEncerradoOuFuturo = ['NS', 'FT', 'SUSP', 'PST', 'CANC'] as const;

  it.each(statusAoVivo)('retorna true para status "%s"', (status) => {
    expect(isLive(status)).toBe(true);
  });

  it.each(statusEncerradoOuFuturo)('retorna false para status "%s"', (status) => {
    expect(isLive(status)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// getReminders / toggleReminder (localStorage)
// ─────────────────────────────────────────────

describe('getReminders', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('retorna Set vazio quando não há lembretes salvos', () => {
    expect(getReminders().size).toBe(0);
  });

  it('retorna IDs salvos corretamente', () => {
    localStorage.setItem('msc_match_reminders', JSON.stringify([101, 202]));
    const reminders = getReminders();
    expect(reminders.has(101)).toBe(true);
    expect(reminders.has(202)).toBe(true);
  });
});

describe('toggleReminder', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('adiciona lembrete quando não existe', () => {
    const result = toggleReminder(303);
    expect(result.has(303)).toBe(true);
  });

  it('remove lembrete quando já existe', () => {
    toggleReminder(303);           // adiciona
    const result = toggleReminder(303); // remove
    expect(result.has(303)).toBe(false);
  });

  it('persiste no localStorage', () => {
    toggleReminder(404);
    const saved = JSON.parse(localStorage.getItem('msc_match_reminders') || '[]');
    expect(saved).toContain(404);
  });

  it('não afeta outros lembretes ao remover um', () => {
    toggleReminder(1);
    toggleReminder(2);
    toggleReminder(1); // remove 1, mantém 2
    expect(getReminders().has(2)).toBe(true);
    expect(getReminders().has(1)).toBe(false);
  });
});
