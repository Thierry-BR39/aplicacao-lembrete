'use strict';

/**
 * Migrações versionadas. A versão aplicada é gravada em PRAGMA user_version.
 * Nunca altere uma migração já publicada: crie uma nova.
 */
const migrations = [
  {
    version: 1,
    name: 'schema-inicial',
    sql: `
      CREATE TABLE categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 40),
        color      TEXT    NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX ux_categories_name_active ON categories (name) WHERE is_active = 1;

      CREATE TABLE reminders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
        description     TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
        category_id     INTEGER REFERENCES categories (id),
        scheduled_at    INTEGER NOT NULL,
        repeat_type     TEXT    NOT NULL CHECK (repeat_type IN ('Once', 'Daily', 'Weekly', 'Monthly')),
        repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK (repeat_interval >= 1),
        color           TEXT    CHECK (color IS NULL OR color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        finished_at     INTEGER,
        deleted_at      INTEGER,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      CREATE INDEX ix_reminders_category ON reminders (category_id);
      CREATE INDEX ix_reminders_state ON reminders (is_active, deleted_at);

      CREATE TABLE reminder_occurrences (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        reminder_id  INTEGER NOT NULL REFERENCES reminders (id),
        scheduled_at INTEGER NOT NULL,
        displayed_at INTEGER,
        closed_at    INTEGER,
        status       TEXT    NOT NULL CHECK (status IN ('Pending', 'Displayed', 'Completed', 'Cancelled')),
        is_overdue   INTEGER NOT NULL DEFAULT 0 CHECK (is_overdue IN (0, 1)),
        UNIQUE (reminder_id, scheduled_at)
      );
      CREATE INDEX ix_occurrences_status_date ON reminder_occurrences (status, scheduled_at);
      CREATE INDEX ix_occurrences_reminder ON reminder_occurrences (reminder_id);
      -- Um lembrete nunca tem mais de uma ocorrência em aberto (RN007 / RN010).
      CREATE UNIQUE INDEX ux_occurrences_one_open ON reminder_occurrences (reminder_id)
        WHERE status IN ('Pending', 'Displayed');

      CREATE TABLE app_settings (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key   TEXT    NOT NULL UNIQUE,
        setting_value TEXT    NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE reminder_window_settings (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        reminder_id      INTEGER NOT NULL UNIQUE REFERENCES reminders (id),
        position_x       INTEGER NOT NULL,
        position_y       INTEGER NOT NULL,
        width            INTEGER NOT NULL CHECK (width > 0),
        height           INTEGER NOT NULL CHECK (height > 0),
        is_always_on_top INTEGER NOT NULL DEFAULT 1 CHECK (is_always_on_top IN (0, 1))
      );

      INSERT INTO categories (name, color, is_active, created_at) VALUES
        ('Trabalho',   '#4DA3FF', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        ('Pessoal',    '#7BD88F', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        ('Estudos',    '#C792EA', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        ('Projetos',   '#FFB454', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
        ('Importante', '#FF6A6A', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
    `,
  },
];

module.exports = { migrations };
