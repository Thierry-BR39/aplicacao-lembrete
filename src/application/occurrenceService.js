'use strict';

const { NotFoundError } = require('../domain/errors');
const { RepeatType } = require('../domain/enums');
const { nextOccurrenceAfter } = require('../domain/rules/recurrence');

class OccurrenceService {
  constructor({ db, reminders, occurrences, windowSettings, clock, bus }) {
    this.db = db;
    this.reminders = reminders;
    this.occurrences = occurrences;
    this.windowSettings = windowSettings;
    this.clock = clock;
    this.bus = bus;
  }

  getView(id) {
    const occurrence = this.occurrences.getById(id);
    if (!occurrence) throw new NotFoundError('Ocorrência não encontrada.');
    return occurrence;
  }

  findDue(now) {
    return this.occurrences.findDue(now);
  }

  findDisplayed() {
    return this.occurrences.findDisplayed();
  }

  /**
   * Registra, de forma transacional, que a ocorrência será exibida. Retorna
   * false se outra execução já a reivindicou (prevenção de duplicidade, RN007).
   */
  markDisplayed(id, now, isOverdue) {
    const won = this.db.transaction(() => this.occurrences.markDisplayed(id, now, isOverdue));
    if (won) this.bus.emit('data-changed', { entity: 'occurrence', id });
    return won;
  }

  /**
   * Conclui a ocorrência (fechamento do post-it). Em lembretes únicos encerra o
   * agendamento; em recorrentes programa a próxima ocorrência futura, mesmo que
   * várias tenham sido perdidas (RN003 e RN010).
   */
  complete(id) {
    const now = this.clock.now();
    const result = this.db.transaction(() => {
      if (!this.occurrences.complete(id, now)) return { completed: false, nextAt: null };

      const occurrence = this.occurrences.getById(id);
      const reminder = this.reminders.getById(occurrence.reminderId);
      let nextAt = null;
      if (reminder && reminder.isActive && !reminder.deletedAt) {
        if (reminder.repeatType === RepeatType.Once) {
          this.reminders.markFinished(reminder.id, now);
        } else {
          nextAt = nextOccurrenceAfter(reminder.scheduledAt, reminder.repeatType, reminder.repeatInterval, now);
          this.occurrences.insertPending(reminder.id, nextAt);
        }
      }
      return { completed: true, nextAt };
    });
    if (result.completed) this.bus.emit('data-changed', { entity: 'occurrence', id });
    return result;
  }

  getWindowSettings(reminderId) {
    return this.windowSettings.get(reminderId);
  }

  saveWindowBounds(reminderId, bounds) {
    this.windowSettings.save(reminderId, bounds);
  }

  history(filters) {
    return this.occurrences.listHistory(filters);
  }
}

module.exports = { OccurrenceService };
