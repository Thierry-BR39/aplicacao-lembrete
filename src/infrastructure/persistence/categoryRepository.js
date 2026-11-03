'use strict';

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    reminderCount: row.reminder_count ?? 0,
  };
}

const SELECT = `
  SELECT c.id, c.name, c.color, c.is_active, c.created_at,
         (SELECT COUNT(*) FROM reminders r WHERE r.category_id = c.id AND r.deleted_at IS NULL) AS reminder_count
  FROM categories c`;

class CategoryRepository {
  constructor(db) {
    this.db = db;
  }

  list({ includeInactive = false } = {}) {
    const where = includeInactive ? '' : 'WHERE c.is_active = 1';
    return this.db.prepare(`${SELECT} ${where} ORDER BY c.name COLLATE NOCASE`).all().map(map);
  }

  getById(id) {
    return map(this.db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  }

  findActiveByName(name) {
    return map(this.db.prepare(`${SELECT} WHERE c.is_active = 1 AND c.name = ?`).get(name));
  }

  insert({ name, color, isActive }, now) {
    const res = this.db
      .prepare('INSERT INTO categories (name, color, is_active, created_at) VALUES (?, ?, ?, ?)')
      .run(name, color, isActive ? 1 : 0, now);
    return Number(res.lastInsertRowid);
  }

  update(id, { name, color, isActive }) {
    this.db
      .prepare('UPDATE categories SET name = ?, color = ?, is_active = ? WHERE id = ?')
      .run(name, color, isActive ? 1 : 0, id);
  }

  setActive(id, isActive) {
    this.db.prepare('UPDATE categories SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
  }

  /** Quantidade de lembretes (inclusive excluídos logicamente) que referenciam a categoria. */
  countReferences(id) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE category_id = ?').get(id).n;
  }

  remove(id) {
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }
}

module.exports = { CategoryRepository };
