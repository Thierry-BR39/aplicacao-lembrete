'use strict';

const { openDatabase } = require('../../src/infrastructure/persistence/database');
const { createServices } = require('../../src/application/compositionRoot');
const { ReminderSchedulerService } = require('../../src/infrastructure/scheduling/reminderSchedulerService');

const at = (y, mo, d, h = 9, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

/** Cria serviços sobre SQLite em memória com um relógio controlável. */
function setup({ start = at(2026, 5, 10, 8, 0), db = null } = {}) {
  const clock = { t: start, now() { return this.t; } };
  const database = db ?? openDatabase({ file: ':memory:' });
  const services = createServices(database, { clock });
  const shown = [];
  const scheduler = new ReminderSchedulerService({
    occurrenceService: services.occurrenceService,
    settingsService: services.settingsService,
    clock,
    onShow: (occ) => {
      if (!shown.some((s) => s.id === occ.id)) shown.push(occ);
    },
  });
  return { ...services, clock, shown, scheduler };
}

module.exports = { setup, at };
