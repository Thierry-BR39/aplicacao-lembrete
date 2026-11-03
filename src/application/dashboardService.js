'use strict';

const { OccurrenceStatus } = require('../domain/enums');

class DashboardService {
  constructor({ occurrences, clock }) {
    this.occurrences = occurrences;
    this.clock = clock;
  }

  get() {
    const now = this.clock.now();
    return {
      scheduledCount: this.occurrences.countByStatus(OccurrenceStatus.Pending),
      displayedCount: this.occurrences.countByStatus(OccurrenceStatus.Displayed),
      overdueCount: this.occurrences.countOverdue(now),
      upcoming: this.occurrences.listUpcoming(now, 5),
      overdue: this.occurrences.listOverdue(now, 5),
      recent: this.occurrences.listHistory({ limit: 5 }),
    };
  }
}

module.exports = { DashboardService };
