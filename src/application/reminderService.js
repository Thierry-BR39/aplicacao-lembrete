'use strict';

const { ConflictError, NotFoundError } = require('../domain/errors');
const { OccurrenceStatus, ReminderStatus } = require('../domain/enums');
const { firstPendingAt } = require('../domain/rules/recurrence');
const { validateReminder } = require('../domain/rules/validation');

/** Situação exibida ao usuário, derivada do estado do lembrete e da ocorrência em aberto. */
function deriveStatus(reminder, now) {
  if (!reminder.isActive) return ReminderStatus.Cancelled;
  if (reminder.finishedAt) return ReminderStatus.Completed;
  if (reminder.openStatus === OccurrenceStatus.Displayed) return ReminderStatus.Displayed;
  if (reminder.openStatus === OccurrenceStatus.Pending && reminder.nextAt < now) return ReminderStatus.Overdue;
  return ReminderStatus.Scheduled;
}

class ReminderService {
  constructor({ db, reminders, occurrences, categoryService, clock, bus }) {
    this.db = db;
    this.reminders = reminders;
    this.occurrences = occurrences;
    this.categoryService = categoryService;
    this.clock = clock;
    this.bus = bus;
  }

  withStatus(reminder) {
    return reminder ? { ...reminder, status: deriveStatus(reminder, this.clock.now()) } : null;
  }

  get(id) {
    const reminder = this.reminders.getById(id);
    if (!reminder || reminder.deletedAt) throw new NotFoundError('Lembrete não encontrado.');
    return this.withStatus(reminder);
  }

  /** Lista com filtros opcionais: { search, categoryId, status }. */
  list({ search = '', categoryId = null, status = null } = {}) {
    const term = String(search).trim().toLowerCase();
    return this.reminders
      .list()
      .map((r) => this.withStatus(r))
      .filter((r) => !term || r.title.toLowerCase().includes(term) || r.description.toLowerCase().includes(term))
      .filter((r) => categoryId === null || r.categoryId === categoryId)
      .filter((r) => !status || r.status === status);
  }

  create(input) {
    const now = this.clock.now();
    const data = validateReminder(input, { now });
    this.categoryService.assertUsable(data.categoryId);

    const id = this.db.transaction(() => {
      const newId = this.reminders.insert(data, now);
      if (data.isActive) this.occurrences.insertPending(newId, data.scheduledAt);
      return newId;
    });
    this.bus.emit('data-changed', { entity: 'reminder', id });
    return this.get(id);
  }

  update(id, input) {
    const now = this.clock.now();
    const existing = this.reminders.getById(id);
    if (!existing || existing.deletedAt) throw new NotFoundError('Lembrete não encontrado.');
    if (existing.finishedAt) throw new ConflictError('Lembretes concluídos não podem ser editados.');

    const data = validateReminder(input, { now, existing });
    if (data.categoryId !== existing.categoryId) this.categoryService.assertUsable(data.categoryId);

    const scheduleChanged = data.scheduledAt !== existing.scheduledAt
      || data.repeatType !== existing.repeatType
      || data.repeatInterval !== existing.repeatInterval;

    const cancelled = this.db.transaction(() => {
      this.reminders.update(id, data, now);

      if (!data.isActive) return this.occurrences.cancelOpen(id, now);

      // Reagenda quando o lembrete foi reativado, a programação mudou ou não há ocorrência em aberto.
      if (!existing.isActive || scheduleChanged || existing.openStatus === null) {
        const cancelledPending = this.occurrences.cancelOpen(id, now, { onlyPending: true });
        // Um post-it já na tela é mantido; a próxima ocorrência será calculada ao concluí-lo.
        if (existing.openStatus !== OccurrenceStatus.Displayed) {
          this.occurrences.insertPending(id, firstPendingAt(data, now));
        }
        return cancelledPending;
      }
      return [];
    });

    this.notifyCancelled(cancelled);
    this.bus.emit('data-changed', { entity: 'reminder', id });
    return this.get(id);
  }

  /** Cancela o agendamento sem excluir o lembrete: ele deixa de ser exibido. */
  cancel(id) {
    const now = this.clock.now();
    const existing = this.reminders.getById(id);
    if (!existing || existing.deletedAt) throw new NotFoundError('Lembrete não encontrado.');

    const cancelled = this.db.transaction(() => {
      this.reminders.setActive(id, false, now);
      return this.occurrences.cancelOpen(id, now);
    });
    this.notifyCancelled(cancelled);
    this.bus.emit('data-changed', { entity: 'reminder', id });
    return this.get(id);
  }

  /** Exclusão lógica: o histórico de ocorrências permanece disponível (RN009). */
  remove(id) {
    const now = this.clock.now();
    const existing = this.reminders.getById(id);
    if (!existing || existing.deletedAt) throw new NotFoundError('Lembrete não encontrado.');

    const cancelled = this.db.transaction(() => {
      const open = this.occurrences.cancelOpen(id, now);
      this.reminders.softDelete(id, now);
      return open;
    });
    this.notifyCancelled(cancelled);
    this.bus.emit('data-changed', { entity: 'reminder', id });
  }

  notifyCancelled(cancelled) {
    for (const occ of cancelled) {
      if (occ.status === OccurrenceStatus.Displayed) this.bus.emit('occurrence-cancelled', { occurrenceId: occ.id });
    }
  }
}

module.exports = { ReminderService, deriveStatus };
