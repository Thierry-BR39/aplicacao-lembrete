'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReminder, validateCategory } = require('../../src/domain/rules/validation');
const { ValidationError } = require('../../src/domain/errors');

const NOW = new Date(2026, 4, 10, 12, 0, 30).getTime();
const FUTURE = new Date(2026, 4, 10, 13, 0).getTime();
const base = { title: 'Reunião', scheduledAt: FUTURE };

const fails = (input, field, ctx = {}) =>
  assert.throws(() => validateReminder(input, { now: NOW, ...ctx }), (e) => e instanceof ValidationError && e.field === field);

test('aceita lembrete mínimo e aplica padrões', () => {
  const r = validateReminder(base, { now: NOW });
  assert.equal(r.title, 'Reunião');
  assert.equal(r.repeatType, 'Once');
  assert.equal(r.repeatInterval, 1);
  assert.equal(r.isActive, true);
  assert.equal(r.categoryId, null);
});

test('título obrigatório e com limite', () => {
  fails({ ...base, title: '   ' }, 'title');
  fails({ ...base, title: 'x'.repeat(101) }, 'title');
  assert.equal(validateReminder({ ...base, title: 'x'.repeat(100) }, { now: NOW }).title.length, 100);
});

test('descrição aceita várias linhas e tem limite', () => {
  assert.equal(validateReminder({ ...base, description: 'a\r\nb' }, { now: NOW }).description, 'a\nb');
  fails({ ...base, description: 'x'.repeat(1001) }, 'description');
});

test('data inválida ou ausente é rejeitada', () => {
  fails({ ...base, scheduledAt: undefined }, 'scheduledAt');
  fails({ ...base, scheduledAt: 'abc' }, 'scheduledAt');
  fails({ ...base, scheduledAt: NaN }, 'scheduledAt');
});

test('data passada é rejeitada, mas o minuto atual é aceito', () => {
  fails({ ...base, scheduledAt: new Date(2026, 4, 10, 11, 59).getTime() }, 'scheduledAt');
  const sameMinute = new Date(2026, 4, 10, 12, 0).getTime();
  assert.equal(validateReminder({ ...base, scheduledAt: sameMinute }, { now: NOW }).scheduledAt, sameMinute);
});

test('na edição, uma data passada só é aceita se não for alterada', () => {
  const past = new Date(2026, 4, 9, 9, 0).getTime();
  const existing = { scheduledAt: past };
  assert.equal(validateReminder({ ...base, scheduledAt: past }, { now: NOW, existing }).scheduledAt, past);
  fails({ ...base, scheduledAt: past - 60000 }, 'scheduledAt', { existing });
});

test('horário é normalizado para o início do minuto', () => {
  const withSeconds = FUTURE + 42_000;
  assert.equal(validateReminder({ ...base, scheduledAt: withSeconds }, { now: NOW }).scheduledAt, FUTURE);
});

test('recorrência e intervalo', () => {
  fails({ ...base, repeatType: 'Yearly' }, 'repeatType');
  fails({ ...base, repeatType: 'Daily', repeatInterval: 0 }, 'repeatInterval');
  fails({ ...base, repeatType: 'Daily', repeatInterval: 1.5 }, 'repeatInterval');
  assert.equal(validateReminder({ ...base, repeatType: 'Weekly', repeatInterval: '2' }, { now: NOW }).repeatInterval, 2);
  assert.equal(validateReminder({ ...base, repeatType: 'Once', repeatInterval: 9 }, { now: NOW }).repeatInterval, 1);
});

test('cor deve ser hexadecimal #RRGGBB', () => {
  fails({ ...base, color: 'red' }, 'color');
  assert.equal(validateReminder({ ...base, color: '#ff6a00' }, { now: NOW }).color, '#FF6A00');
  assert.equal(validateReminder({ ...base, color: '' }, { now: NOW }).color, null);
});

test('categoria: nome e cor obrigatórios', () => {
  assert.throws(() => validateCategory({ name: '', color: '#FFFFFF' }), ValidationError);
  assert.throws(() => validateCategory({ name: 'Casa', color: 'azul' }), ValidationError);
  assert.deepEqual(validateCategory({ name: ' Casa ', color: '#abcdef' }), { name: 'Casa', color: '#ABCDEF', isActive: true });
});
