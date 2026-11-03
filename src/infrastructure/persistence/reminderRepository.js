'use strict';

const SELECT = `
  SELECT r.id, r.title, r.description, r.category_id, r.scheduled_at, r.repeat_type,
         r.repeat_interval, r.color, r.is_active, r.finished_at, r.deleted_at,
         r.created_at, r.updated_at,
         c.name AS category_name, c.color AS category_color,
         (SELECT o.scheduled_at FROM reminder_occurrences o
            WHERE o.reminder_id = r.id AND o.status IN ('Pending', 'Displayed')) AS next_at,
         (SELECT o.status FROM reminder_occurrences o
            WHERE o.reminder_id = r.id AND o.status IN ('Pending', 'Displayed')) AS open_status
  FROM reminders r
  LEFT JOIN categories c ON c.id = r.category_id`;

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    scheduledAt: row.scheduled_at,
    repeatType: row.repeat_type,
    repeatInterval: row.repeat_interval,
    color: row.color,
    isActive: row.is_active === 1,
    finishedAt: row.finished_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextAt: row.next_at,
    openStatus: row.open_status,
  };
}

class ReminderRepository {
  constructor(db) {
    this.db = db;
  }

  insert(data, now) {
    const res = this.db
      .prepare(`INSERT INTO reminders
        (title, description, category_id, scheduled_at, repeat_type, repeat_interval, color, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(data.title, data.description, data.categoryId, data.scheduledAt, data.repeatType,
        data.repeatInterval, data.color, data.isActive ? 1 : 0, now, now);
    return Number(res.lastInsertRowid);
  }

  update(id, data, now) {
    this.db
      .prepare(`UPDATE reminders SET title = ?, description = ?, category_id = ?, scheduled_at = ?,
        repeat_type = ?, repeat_interval = ?, color = ?, is_active = ?, updated_at = ? WHERE id = ?`)
      .run(data.title, data.description, data.categoryId, data.scheduledAt, data.repeatType,
        data.repeatInterval, data.color, data.isActive ? 1 : 0, now, id);
  }

  setActive(id, isActive, now) {
    this.db.prepare('UPDATE reminders SET is_active = ?, updated_at = ? WHERE id = ?').run(isActive ? 1 : 0, now, id);
  }

  markFinished(id, now) {
    this.db.prepare('UPDATE reminders SET finished_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  /** Exclusão lógica: o histórico de ocorrências é preservado (RN009). */
  softDelete(id, now) {
    this.db
      .prepare('UPDATE reminders SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }

  getById(id) {
    return map(this.db.prepare(`${SELECT} WHERE r.id = ?`).get(id));
  }

  /** Lembretes não excluídos. */
  list() {
    return this.db
      .prepare(`${SELECT} WHERE r.deleted_at IS NULL ORDER BY COALESCE(next_at, r.scheduled_at), r.id`)
      .all()
      .map(map);
  }
}

module.exports = { ReminderRepository };
