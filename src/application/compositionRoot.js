'use strict';

const { EventBus } = require('./eventBus');
const { SettingsService } = require('./settingsService');
const { CategoryService } = require('./categoryService');
const { ReminderService } = require('./reminderService');
const { OccurrenceService } = require('./occurrenceService');
const { DashboardService } = require('./dashboardService');
const { CategoryRepository } = require('../infrastructure/persistence/categoryRepository');
const { ReminderRepository } = require('../infrastructure/persistence/reminderRepository');
const { OccurrenceRepository } = require('../infrastructure/persistence/occurrenceRepository');
const { SettingsRepository } = require('../infrastructure/persistence/settingsRepository');
const { WindowSettingsRepository } = require('../infrastructure/persistence/windowSettingsRepository');

const systemClock = { now: () => Date.now() };

/** Monta repositórios e serviços sobre um banco já aberto. */
function createServices(db, { clock = systemClock } = {}) {
  const bus = new EventBus();
  const repos = {
    categories: new CategoryRepository(db),
    reminders: new ReminderRepository(db),
    occurrences: new OccurrenceRepository(db),
    settings: new SettingsRepository(db),
    windowSettings: new WindowSettingsRepository(db),
  };

  const settingsService = new SettingsService({ settings: repos.settings, clock, bus });
  const categoryService = new CategoryService({ categories: repos.categories, clock, bus });
  const reminderService = new ReminderService({
    db, reminders: repos.reminders, occurrences: repos.occurrences, categoryService, clock, bus,
  });
  const occurrenceService = new OccurrenceService({
    db, reminders: repos.reminders, occurrences: repos.occurrences, windowSettings: repos.windowSettings, clock, bus,
  });
  const dashboardService = new DashboardService({ occurrences: repos.occurrences, clock });

  return { db, bus, clock, settingsService, categoryService, reminderService, occurrenceService, dashboardService };
}

module.exports = { createServices, systemClock };
