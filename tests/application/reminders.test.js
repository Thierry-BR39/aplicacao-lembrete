'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, at } = require('./helpers');
const { ValidationError, ConflictError } = require('../../src/domain/errors');

test('cria lembrete único, gera ocorrência pendente e lista com situação', () => {
  const { reminderService } = setup();
  const r = reminderService.create({ title: 'Ligar para o cliente', scheduledAt: at(2026, 5, 10, 9) });
  assert.equal(r.status, 'Scheduled');
  assert.equal(r.nextAt, at(2026, 5, 10, 9));
  assert.equal(reminderService.list().length, 1);
});

test('não permite criar lembrete no passado', () => {
  const { reminderService } = setup();
  assert.throws(
    () => reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 9, 9) }),
    (e) => e instanceof ValidationError && e.field === 'scheduledAt',
  );
});

test('categorias iniciais existem e categoria inválida é rejeitada', () => {
  const { categoryService, reminderService } = setup();
  const names = categoryService.list().map((c) => c.name);
  assert.deepEqual(names.sort(), ['Estudos', 'Importante', 'Pessoal', 'Projetos', 'Trabalho']);
  assert.throws(() => reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9), categoryId: 999 }), ValidationError);
});

test('edita lembrete: reagenda a ocorrência pendente', () => {
  const { reminderService, occurrenceService, clock } = setup();
  const r = reminderService.create({ title: 'Reunião', scheduledAt: at(2026, 5, 10, 9) });
  const updated = reminderService.update(r.id, { title: 'Reunião 2', scheduledAt: at(2026, 5, 10, 15) });
  assert.equal(updated.title, 'Reunião 2');
  assert.equal(updated.nextAt, at(2026, 5, 10, 15));
  clock.t = at(2026, 5, 10, 10);
  assert.equal(occurrenceService.findDue(clock.now()).length, 0);
  clock.t = at(2026, 5, 10, 15);
  assert.equal(occurrenceService.findDue(clock.now()).length, 1);
});

test('cancelar impede a exibição e mantém o histórico', () => {
  const { reminderService, scheduler, clock, shown, occurrenceService } = setup();
  const r = reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9) });
  reminderService.cancel(r.id);
  clock.t = at(2026, 5, 10, 9, 5);
  scheduler.tick();
  assert.equal(shown.length, 0);
  assert.equal(reminderService.get(r.id).status, 'Cancelled');
  assert.equal(occurrenceService.history({ status: 'Cancelled' }).length, 1);
});

test('reativar um lembrete cancelado volta a agendá-lo', () => {
  const { reminderService } = setup();
  const r = reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9) });
  reminderService.cancel(r.id);
  const again = reminderService.update(r.id, { title: 'x', scheduledAt: at(2026, 5, 10, 9), isActive: true });
  assert.equal(again.status, 'Scheduled');
});

test('excluir é lógico: some da lista mas o histórico permanece (RN009)', () => {
  const { reminderService, scheduler, clock, occurrenceService } = setup();
  const r = reminderService.create({ title: 'Histórico', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  const [occ] = occurrenceService.findDisplayed();
  occurrenceService.complete(occ.id);
  reminderService.remove(r.id);
  assert.equal(reminderService.list().length, 0);
  const history = occurrenceService.history({});
  assert.equal(history.length, 1);
  assert.equal(history[0].title, 'Histórico');
});

test('excluir lembrete com post-it aberto emite cancelamento da janela', () => {
  const { reminderService, scheduler, clock, bus } = setup();
  const events = [];
  bus.on('occurrence-cancelled', (e) => events.push(e));
  const r = reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  reminderService.remove(r.id);
  assert.equal(events.length, 1);
});

test('lembrete concluído não pode ser editado', () => {
  const { reminderService, occurrenceService, scheduler, clock } = setup();
  const r = reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  occurrenceService.complete(occurrenceService.findDisplayed()[0].id);
  assert.equal(reminderService.get(r.id).status, 'Completed');
  assert.throws(() => reminderService.update(r.id, { title: 'y', scheduledAt: at(2026, 5, 11, 9) }), ConflictError);
});

test('categorias: nome duplicado é rejeitado e categoria em uso é arquivada, não apagada', () => {
  const { categoryService, reminderService } = setup();
  assert.throws(() => categoryService.create({ name: 'trabalho', color: '#111111' }), ConflictError);
  const nova = categoryService.create({ name: 'Casa', color: '#123456' });
  reminderService.create({ title: 'x', scheduledAt: at(2026, 5, 10, 9), categoryId: nova.id });
  assert.deepEqual(categoryService.remove(nova.id), { archived: true });
  assert.equal(categoryService.list().some((c) => c.id === nova.id), false);
  const vazia = categoryService.create({ name: 'Vazia', color: '#654321' });
  assert.deepEqual(categoryService.remove(vazia.id), { archived: false });
});

test('configurações: padrões, validação e persistência', () => {
  const { settingsService } = setup();
  assert.equal(settingsService.get().startMinimized, true);
  assert.equal(settingsService.update({ schedulerIntervalSeconds: 5 }).schedulerIntervalSeconds, 5);
  assert.throws(() => settingsService.update({ schedulerIntervalSeconds: 60 }), ValidationError);
  assert.throws(() => settingsService.update({ inexistente: 1 }), ValidationError);
  assert.equal(settingsService.get().schedulerIntervalSeconds, 5);
});
