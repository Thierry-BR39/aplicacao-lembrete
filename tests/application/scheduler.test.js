'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setup, at } = require('./helpers');
const { openDatabase } = require('../../src/infrastructure/persistence/database');

test('dispara no horário correto e não antes', () => {
  const { reminderService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 8, 59, 59);
  scheduler.tick();
  assert.equal(shown.length, 0);
  clock.t = at(2026, 5, 10, 9, 0, 5);
  scheduler.tick();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'A');
  assert.equal(shown[0].isOverdue, false);
});

test('não duplica: ticks repetidos não geram nova ocorrência (RN007)', () => {
  const { reminderService, scheduler, clock, shown, occurrenceService } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9, 1);
  for (let i = 0; i < 5; i += 1) scheduler.tick();
  assert.equal(shown.length, 1);
  assert.equal(occurrenceService.history({}).length, 1);
});

test('markDisplayed é condicional: só uma execução vence a disputa', () => {
  const { reminderService, occurrenceService, clock } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  const [occ] = occurrenceService.findDue(clock.now());
  assert.equal(occurrenceService.markDisplayed(occ.id, clock.now(), false), true);
  assert.equal(occurrenceService.markDisplayed(occ.id, clock.now(), false), false);
});

test('vários lembretes no mesmo horário abrem juntos', () => {
  const { reminderService, scheduler, clock, shown } = setup();
  for (const t of ['A', 'B', 'C']) reminderService.create({ title: t, scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  assert.deepEqual(shown.map((s) => s.title).sort(), ['A', 'B', 'C']);
});

test('fechar um lembrete único conclui a ocorrência e encerra o agendamento (RN003)', () => {
  const { reminderService, occurrenceService, scheduler, clock } = setup();
  const r = reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  clock.t = at(2026, 5, 10, 9, 10);
  const [occ] = occurrenceService.findDisplayed();
  const result = occurrenceService.complete(occ.id);
  assert.deepEqual(result, { completed: true, nextAt: null });
  assert.equal(occurrenceService.getView(occ.id).status, 'Completed');
  assert.equal(occurrenceService.getView(occ.id).closedAt, clock.t);
  assert.equal(reminderService.get(r.id).status, 'Completed');
  scheduler.tick();
  assert.equal(occurrenceService.findDisplayed().length, 0);
});

test('concluir duas vezes é inofensivo', () => {
  const { reminderService, occurrenceService, scheduler, clock } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9), repeatType: 'Daily' });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  const [occ] = occurrenceService.findDisplayed();
  assert.equal(occurrenceService.complete(occ.id).completed, true);
  assert.equal(occurrenceService.complete(occ.id).completed, false);
});

for (const [type, expected] of [
  ['Daily', at(2026, 5, 11, 9)],
  ['Weekly', at(2026, 5, 17, 9)],
  ['Monthly', at(2026, 6, 10, 9)],
]) {
  test(`recorrência ${type}: ao fechar, programa a próxima ocorrência preservando o horário`, () => {
    const { reminderService, occurrenceService, scheduler, clock } = setup();
    const r = reminderService.create({ title: 'R', scheduledAt: at(2026, 5, 10, 9), repeatType: type });
    clock.t = at(2026, 5, 10, 9, 2);
    scheduler.tick();
    const result = occurrenceService.complete(occurrenceService.findDisplayed()[0].id);
    assert.equal(result.nextAt, expected);
    assert.equal(reminderService.get(r.id).nextAt, expected);
    assert.equal(reminderService.get(r.id).status, 'Scheduled');
  });
}

test('mensal dia 31: fevereiro usa o último dia e março volta ao 31', () => {
  const { reminderService, occurrenceService, scheduler, clock } = setup({ start: at(2026, 1, 31, 8) });
  reminderService.create({ title: 'Fim de mês', scheduledAt: at(2026, 1, 31, 9), repeatType: 'Monthly' });
  clock.t = at(2026, 1, 31, 9);
  scheduler.tick();
  assert.equal(occurrenceService.complete(occurrenceService.findDisplayed()[0].id).nextAt, at(2026, 2, 28, 9));
  clock.t = at(2026, 2, 28, 9);
  scheduler.tick();
  assert.equal(occurrenceService.complete(occurrenceService.findDisplayed()[0].id).nextAt, at(2026, 3, 31, 9));
});

test('recorrência atrasada: várias ocorrências perdidas viram uma só e a próxima é futura (RN010)', () => {
  const { reminderService, occurrenceService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'Diário', scheduledAt: at(2026, 5, 10, 9), repeatType: 'Daily' });
  clock.t = at(2026, 5, 20, 14, 0); // computador ficou desligado 10 dias
  scheduler.tick();
  assert.equal(shown.length, 1, 'apenas um post-it, não dez');
  assert.equal(shown[0].isOverdue, true);
  assert.equal(shown[0].scheduledAt, at(2026, 5, 10, 9));
  const result = occurrenceService.complete(shown[0].id);
  assert.equal(result.nextAt, at(2026, 5, 21, 9));
  scheduler.tick();
  assert.equal(occurrenceService.findDisplayed().length, 0);
});

test('lembrete único perdido é recuperado como atrasado na próxima execução (RN005)', () => {
  const { reminderService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'Perdido', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 12, 8);
  scheduler.tick();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].isOverdue, true);
});

test('atraso pequeno (intervalo do agendador) não é marcado como atrasado', () => {
  const { reminderService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'Ok', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9, 0, 30);
  scheduler.tick();
  assert.equal(shown[0].isOverdue, false);
});

test('reinício com post-it aberto: a ocorrência exibida é reapresentada, sem nova ocorrência', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rd-')), 'rd.db');
  try {
    const first = setup({ db: openDatabase({ file }) });
    first.reminderService.create({ title: 'Persistente', scheduledAt: at(2026, 5, 10, 9) });
    first.clock.t = at(2026, 5, 10, 9);
    first.scheduler.tick();
    assert.equal(first.shown.length, 1);
    first.db.close(); // encerramento do aplicativo sem fechar o post-it

    const second = setup({ db: openDatabase({ file }), start: at(2026, 5, 10, 18) });
    second.scheduler.tick();
    assert.equal(second.shown.length, 1);
    assert.equal(second.shown[0].title, 'Persistente');
    assert.equal(second.occurrenceService.history({}).length, 1, 'sem duplicar ocorrências');
    second.db.close();
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('dados sobrevivem à reinicialização e lembrete futuro continua pendente', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rd-')), 'rd.db');
  try {
    const first = setup({ db: openDatabase({ file }) });
    first.reminderService.create({ title: 'Futuro', scheduledAt: at(2026, 5, 11, 9), repeatType: 'Weekly' });
    first.db.close();

    const second = setup({ db: openDatabase({ file }) });
    const [r] = second.reminderService.list();
    assert.equal(r.title, 'Futuro');
    assert.equal(r.status, 'Scheduled');
    second.scheduler.tick();
    assert.equal(second.shown.length, 0);
    second.db.close();
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('mudança do relógio do Windows: voltar não reabre concluídos e avançar dispara os vencidos', () => {
  const { reminderService, occurrenceService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  occurrenceService.complete(shown[0].id);
  clock.t = at(2026, 5, 10, 7); // relógio voltou
  scheduler.tick();
  assert.equal(shown.length, 1);

  reminderService.create({ title: 'B', scheduledAt: at(2026, 5, 10, 20) });
  clock.t = at(2026, 5, 11, 1); // relógio avançou
  scheduler.tick();
  assert.deepEqual(shown.map((s) => s.title), ['A', 'B']);
});

test('suspensão e retomada: lembretes vencidos durante a suspensão aparecem ao retomar', () => {
  const { reminderService, scheduler, clock, shown } = setup();
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 12) });
  reminderService.create({ title: 'B', scheduledAt: at(2026, 5, 10, 13) });
  clock.t = at(2026, 5, 10, 11, 59);
  scheduler.tick();
  clock.t = at(2026, 5, 10, 15); // notebook suspenso por 3 horas
  scheduler.tick();
  assert.equal(shown.length, 2);
});

test('uma falha ao abrir o post-it não derruba o agendador e é repetida no próximo tick', () => {
  const { reminderService, occurrenceService, settingsService, clock } = setup();
  const { ReminderSchedulerService } = require('../../src/infrastructure/scheduling/reminderSchedulerService');
  let failing = true;
  const shown = [];
  const errors = [];
  const scheduler = new ReminderSchedulerService({
    occurrenceService, settingsService, clock,
    onShow: (o) => { if (failing) throw new Error('janela falhou'); shown.push(o); },
    logger: { info() {}, error: (m) => errors.push(m) },
  });
  reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  assert.equal(errors.length, 1);
  failing = false;
  scheduler.tick();
  assert.equal(shown.length, 1);
});

test('histórico: filtros por período, categoria e situação', () => {
  const { reminderService, categoryService, occurrenceService, scheduler, clock } = setup();
  const work = categoryService.list().find((c) => c.name === 'Trabalho');
  reminderService.create({ title: 'W', scheduledAt: at(2026, 5, 10, 9), categoryId: work.id });
  reminderService.create({ title: 'P', scheduledAt: at(2026, 5, 10, 10) });
  clock.t = at(2026, 5, 10, 10);
  scheduler.tick();
  const [w] = occurrenceService.findDisplayed().filter((o) => o.title === 'W');
  occurrenceService.complete(w.id);

  assert.equal(occurrenceService.history({}).length, 2);
  assert.equal(occurrenceService.history({ categoryId: work.id }).length, 1);
  assert.equal(occurrenceService.history({ status: 'Completed' }).length, 1);
  assert.equal(occurrenceService.history({ status: 'Displayed' }).length, 1);
  assert.equal(occurrenceService.history({ from: at(2026, 5, 11), to: at(2026, 5, 12) }).length, 0);
});

test('painel: contadores, próximos e vencidos', () => {
  const { reminderService, dashboardService, scheduler, clock } = setup();
  reminderService.create({ title: 'Futuro', scheduledAt: at(2026, 5, 10, 18) });
  reminderService.create({ title: 'Agora', scheduledAt: at(2026, 5, 10, 9) });
  clock.t = at(2026, 5, 10, 9);
  scheduler.tick();
  const d = dashboardService.get();
  assert.equal(d.scheduledCount, 1);
  assert.equal(d.displayedCount, 1);
  assert.equal(d.overdueCount, 0);
  assert.equal(d.upcoming[0].title, 'Futuro');
});

test('posição e tamanho do post-it são preservados', () => {
  const { reminderService, occurrenceService } = setup();
  const r = reminderService.create({ title: 'A', scheduledAt: at(2026, 5, 10, 9) });
  assert.equal(occurrenceService.getWindowSettings(r.id), null);
  occurrenceService.saveWindowBounds(r.id, { x: 100.4, y: 50, width: 300, height: 220 });
  occurrenceService.saveWindowBounds(r.id, { x: 120, y: 60, width: 310, height: 230 });
  const saved = occurrenceService.getWindowSettings(r.id);
  assert.deepEqual({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }, { x: 120, y: 60, width: 310, height: 230 });
});
