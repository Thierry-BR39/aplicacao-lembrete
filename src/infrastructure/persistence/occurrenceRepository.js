'use strict';

const VIEW = `
  SELECT o.id, o.reminder_id, o.scheduled_at, o.displayed_at, o.closed_at, o.status, o.is_overdue,
         r.title, r.description, r.color AS reminder_color, r.category_id,
         r.repeat_type, r.is_active AS reminder_active,
         c.name AS category_name, c.color AS category_color
  FROM reminder_occurrences o
  JOIN reminders r ON r.id = o.reminder_id
  LEFT JOIN categories c ON c.id = r.category_id`;

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    reminderId: row.reminder_id,
    scheduledAt: row.scheduled_at,
    displayedAt: row.displayed_at,
    closedAt: row.closed_at,
    status: row.status,
    isOverdue: row.is_overdue === 1,
    title: row.title,
    description: row.description,
    color: row.reminder_color ?? row.category_color ?? null,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    repeatType: row.repeat_type,
  };
}

const LIVE = 'r.is_active = 1 AND r.deleted_at IS NULL';

class OccurrenceRepository {
  constructor(db) {
    this.db = db;
  }

  getById(id) {
    return map(this.db.prepare(`${VIEW} WHERE o.id = ?`).get(id));
  }

  /** Cria a ocorrência pendente; retorna o id, ou null se já existir (RN007). */
  insertPending(reminderId, scheduledAt) {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO reminder_occurrences (reminder_id, scheduled_at, status)
                VALUES (?, ?, 'Pending')`)
      .run(reminderId, scheduledAt);
    return res.changes === 1 ? Number(res.lastInsertRowid) : null;
  }

  findDue(now) {
    return this.db
      .prepare(`${VIEW} WHERE o.status = 'Pending' AND o.scheduled_at <= ? AND ${LIVE} ORDER BY o.scheduled_at, o.id`)
      .all(now)
      .map(map);
  }

  findDisplayed() {
    return this.db.prepare(`${VIEW} WHERE o.status = 'Displayed' ORDER BY o.displayed_at, o.id`).all().map(map);
  }

  /** Transição Pending -> Displayed condicional; true somente para quem "ganhou" a transição. */
  markDisplayed(id, now, isOverdue) {
    const res = this.db
      .prepare(`UPDATE reminder_occurrences SET status = 'Displayed', displayed_at = ?, is_overdue = ?
                WHERE id = ? AND status = 'Pending'`)
      .run(now, isOverdue ? 1 : 0, id);
    return res.changes === 1;
  }

  /** Transição Displayed -> Completed condicional. */
  complete(id, now) {
    const res = this.db
      .prepare(`UPDATE reminder_occurrences SET status = 'Completed', closed_at = ?
                WHERE id = ? AND status = 'Displayed'`)
      .run(now, id);
    return res.changes === 1;
  }

  /** Cancela ocorrências em aberto de um lembrete; retorna [{id, status}] do estado anterior. */
  cancelOpen(reminderId, now, { onlyPending = false } = {}) {
    const statuses = onlyPending ? "('Pending')" : "('Pending', 'Displayed')";
    const open = this.db
      .prepare(`SELECT id, status FROM reminder_occurrences WHERE reminder_id = ? AND status IN ${statuses}`)
      .all(reminderId)
      .map((r) => ({ id: r.id, status: r.status }));
    for (const occ of open) {
      this.db
        .prepare("UPDATE reminder_occurrences SET status = 'Cancelled', closed_at = ? WHERE id = ?")
        .run(now, occ.id);
    }
    return open;
  }

  countByStatus(status) {
    return this.db
      .prepare(`SELECT COUNT(*) AS n FROM reminder_occurrences o JOIN reminders r ON r.id = o.reminder_id
                WHERE o.status = ? AND ${LIVE}`)
      .get(status).n;
  }

  countOverdue(now) {
    return this.db
      .prepare(`SELECT COUNT(*) AS n FROM reminder_occurrences o JOIN reminders r ON r.id = o.reminder_id
                WHERE o.status = 'Pending' AND o.scheduled_at < ? AND ${LIVE}`)
      .get(now).n;
  }

  listUpcoming(now, limit) {
    return this.db
      .prepare(`${VIEW} WHERE o.status = 'Pending' AND o.scheduled_at >= ? AND ${LIVE}
                ORDER BY o.scheduled_at LIMIT ?`)
      .all(now, limit)
      .map(map);
  }

  listOverdue(now, limit) {
    return this.db
      .prepare(`${VIEW} WHERE o.status = 'Pending' AND o.scheduled_at < ? AND ${LIVE}
                ORDER BY o.scheduled_at LIMIT ?`)
      .all(now, limit)
      .map(map);
  }

  /** Histórico: ocorrências já exibidas ou encerradas, com filtros opcionais. */
  listHistory({ from = null, to = null, categoryId = null, status = null, limit = 200 } = {}) {
    const where = [];
    const params = [];
    if (status) {
      where.push('o.status = ?');
      params.push(status);
    } else {
      where.push("o.status <> 'Pending'");
    }
    if (from !== null) {
      where.push('o.scheduled_at >= ?');
      params.push(from);
    }
    if (to !== null) {
      where.push('o.scheduled_at < ?');
      params.push(to);
    }
    if (categoryId !== null) {
      where.push('r.category_id = ?');
      params.push(categoryId);
    }
    params.push(limit);
    return this.db
      .prepare(`${VIEW} WHERE ${where.join(' AND ')} ORDER BY o.scheduled_at DESC, o.id DESC LIMIT ?`)
      .all(...params)
      .map(map);
  }
}

module.exports = { OccurrenceRepository };
