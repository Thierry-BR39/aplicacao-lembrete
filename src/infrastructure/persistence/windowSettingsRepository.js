'use strict';

class WindowSettingsRepository {
  constructor(db) {
    this.db = db;
  }

  get(reminderId) {
    const row = this.db.prepare('SELECT * FROM reminder_window_settings WHERE reminder_id = ?').get(reminderId);
    if (!row) return null;
    return {
      x: row.position_x,
      y: row.position_y,
      width: row.width,
      height: row.height,
      isAlwaysOnTop: row.is_always_on_top === 1,
    };
  }

  save(reminderId, { x, y, width, height }) {
    this.db
      .prepare(`INSERT INTO reminder_window_settings (reminder_id, position_x, position_y, width, height)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (reminder_id) DO UPDATE SET position_x = excluded.position_x,
                  position_y = excluded.position_y, width = excluded.width, height = excluded.height`)
      .run(reminderId, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }
}

module.exports = { WindowSettingsRepository };
