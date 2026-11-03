'use strict';

const RepeatType = Object.freeze({
  Once: 'Once',
  Daily: 'Daily',
  Weekly: 'Weekly',
  Monthly: 'Monthly',
});

const OccurrenceStatus = Object.freeze({
  Pending: 'Pending',
  Displayed: 'Displayed',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
});

/** Situação derivada de um lembrete, usada apenas para exibição. */
const ReminderStatus = Object.freeze({
  Scheduled: 'Scheduled',
  Overdue: 'Overdue',
  Displayed: 'Displayed',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
});

module.exports = { RepeatType, OccurrenceStatus, ReminderStatus };
