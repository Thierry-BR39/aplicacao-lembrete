'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextOccurrenceAfter, occurrenceAt, firstPendingAt } = require('../../src/domain/rules/recurrence');

const at = (y, mo, d, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('único: retorna a âncora se futura e null se já passou', () => {
  assert.equal(nextOccurrenceAfter(at(2026, 5, 10), 'Once', 1, at(2026, 5, 9)), at(2026, 5, 10));
  assert.equal(nextOccurrenceAfter(at(2026, 5, 10), 'Once', 1, at(2026, 5, 11)), null);
});

test('diária: preserva o horário e avança para o próximo dia futuro', () => {
  const anchor = at(2026, 5, 10, 8, 30);
  assert.equal(nextOccurrenceAfter(anchor, 'Daily', 1, at(2026, 5, 10, 8, 30)), at(2026, 5, 11, 8, 30));
  assert.equal(nextOccurrenceAfter(anchor, 'Daily', 1, at(2026, 5, 10, 8, 29)), anchor);
});

test('diária com intervalo de 3 dias', () => {
  const anchor = at(2026, 5, 10);
  assert.equal(nextOccurrenceAfter(anchor, 'Daily', 3, at(2026, 5, 10, 12)), at(2026, 5, 13));
});

test('semanal: mantém o dia da semana', () => {
  const anchor = at(2026, 5, 4); // segunda-feira
  const next = nextOccurrenceAfter(anchor, 'Weekly', 1, at(2026, 5, 5));
  assert.equal(next, at(2026, 5, 11));
  assert.equal(new Date(next).getDay(), new Date(anchor).getDay());
});

test('mensal: usa o último dia válido em meses curtos e volta ao dia original depois (RN006)', () => {
  const anchor = at(2026, 1, 31);
  assert.equal(occurrenceAt(anchor, 'Monthly', 1, 1), at(2026, 2, 28));
  assert.equal(occurrenceAt(anchor, 'Monthly', 1, 2), at(2026, 3, 31));
  assert.equal(occurrenceAt(anchor, 'Monthly', 1, 3), at(2026, 4, 30));
  assert.equal(nextOccurrenceAfter(anchor, 'Monthly', 1, at(2026, 2, 1)), at(2026, 2, 28));
});

test('mensal em ano bissexto: 31/01 -> 29/02', () => {
  assert.equal(occurrenceAt(at(2028, 1, 31), 'Monthly', 1, 1), at(2028, 2, 29));
});

test('consolida ocorrências perdidas em uma única próxima futura (RN010)', () => {
  const anchor = at(2026, 1, 1, 7, 0);
  const now = at(2026, 3, 15, 12, 0); // 73 ocorrências diárias perdidas
  assert.equal(nextOccurrenceAfter(anchor, 'Daily', 1, now), at(2026, 3, 16, 7, 0));
});

test('muito tempo depois: resultado sempre é o primeiro instante estritamente futuro', () => {
  const anchor = at(2020, 1, 31, 10, 15);
  for (const type of ['Daily', 'Weekly', 'Monthly']) {
    const now = at(2031, 7, 3, 4, 0);
    const next = nextOccurrenceAfter(anchor, type, 2, now);
    assert.ok(next > now, `${type}: próximo deve ser futuro`);
    let n = 0;
    while (occurrenceAt(anchor, type, 2, n) <= now) n += 1;
    assert.equal(next, occurrenceAt(anchor, type, 2, n));
  }
});

test('firstPendingAt: âncora futura, única atrasada e recorrente atrasada', () => {
  const now = at(2026, 5, 10, 12);
  assert.equal(firstPendingAt({ scheduledAt: at(2026, 5, 11), repeatType: 'Daily', repeatInterval: 1 }, now), at(2026, 5, 11));
  assert.equal(firstPendingAt({ scheduledAt: at(2026, 5, 9), repeatType: 'Once', repeatInterval: 1 }, now), at(2026, 5, 9));
  assert.equal(firstPendingAt({ scheduledAt: at(2026, 5, 9, 9), repeatType: 'Daily', repeatInterval: 1 }, now), at(2026, 5, 11, 9));
});
