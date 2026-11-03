'use strict';

class SettingsRepository {
  constructor(db) {
    this.db = db;
  }

  /** Retorna { chave: valor } com os valores JSON já decodificados. */
  getAll() {
    const out = {};
    for (const row of this.db.prepare('SELECT setting_key, setting_value FROM app_settings').all()) {
      try {
        out[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        /* valor corrompido: ignora e usa o padrão */
      }
    }
    return out;
  }

  set(key, value, now) {
    this.db
      .prepare(`INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT (setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), now);
  }
}

module.exports = { SettingsRepository };
