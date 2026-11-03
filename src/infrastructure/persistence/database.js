'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { migrations } = require('./migrations');

/** Envolve o DatabaseSync com transações aninháveis. */
class Database {
  constructor(raw) {
    this.raw = raw;
    this.depth = 0;
  }

  prepare(sql) {
    return this.raw.prepare(sql);
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  /** Executa `fn` (síncrona) em transação; qualquer exceção desfaz tudo. */
  transaction(fn) {
    if (this.depth > 0) {
      this.depth += 1;
      try {
        return fn();
      } finally {
        this.depth -= 1;
      }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const result = fn();
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.raw.exec('ROLLBACK');
      } catch {
        /* transação já encerrada pelo SQLite */
      }
      throw err;
    } finally {
      this.depth = 0;
    }
  }

  get schemaVersion() {
    return this.raw.prepare('PRAGMA user_version').get().user_version;
  }

  close() {
    this.raw.close();
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backup(db, backupDir, fromVersion, logger) {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `reminderdesk-v${fromVersion}-${timestamp()}.db`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  logger?.info(`Backup do banco criado antes da migração: ${target}`);
}

function migrate(db, { backupDir, isMemory, logger }) {
  const current = db.schemaVersion;
  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return;

  if (current > 0 && !isMemory && backupDir) backup(db, backupDir, current, logger);

  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    });
    logger?.info(`Migração ${migration.version} (${migration.name}) aplicada.`);
  }
}

/**
 * Abre (criando, se preciso) o banco SQLite e aplica as migrações pendentes.
 * Use ':memory:' em `file` para testes.
 */
function openDatabase({ file, backupDir = null, logger = null }) {
  const isMemory = file === ':memory:';
  if (!isMemory) fs.mkdirSync(path.dirname(file), { recursive: true });

  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  if (!isMemory) raw.exec('PRAGMA journal_mode = WAL');

  const db = new Database(raw);
  try {
    migrate(db, { backupDir, isMemory, logger });
  } catch (err) {
    raw.close();
    throw err;
  }
  return db;
}

module.exports = { openDatabase, Database };
