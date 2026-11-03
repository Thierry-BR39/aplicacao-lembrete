'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../../src/infrastructure/persistence/database');
const { migrations } = require('../../src/infrastructure/persistence/migrations');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rd-db-'));

test('aplica as migrações e semeia as categorias iniciais', () => {
  const db = openDatabase({ file: ':memory:' });
  assert.equal(db.schemaVersion, migrations.at(-1).version);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, 5);
  db.close();
});

test('reabrir um banco existente não reaplica migrações nem duplica sementes', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, 'a.db');
    openDatabase({ file }).close();
    const db = openDatabase({ file, backupDir: path.join(dir, 'backups') });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, 5);
    assert.equal(fs.existsSync(path.join(dir, 'backups')), false, 'sem backup quando não há migração pendente');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('transação desfaz tudo em caso de erro e aceita aninhamento', () => {
  const db = openDatabase({ file: ':memory:' });
  assert.throws(() => db.transaction(() => {
    db.prepare("INSERT INTO categories (name, color, created_at) VALUES ('X', '#111111', 1)").run();
    db.transaction(() => db.prepare("INSERT INTO categories (name, color, created_at) VALUES ('Y', '#111111', 1)").run());
    throw new Error('falha');
  }), /falha/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, 5);
  db.close();
});

test('restrições impedem estados inválidos', () => {
  const db = openDatabase({ file: ':memory:' });
  const insert = (sql) => () => db.prepare(sql).run();
  assert.throws(insert("INSERT INTO reminders (title, scheduled_at, repeat_type, created_at, updated_at) VALUES ('', 1, 'Once', 1, 1)"));
  assert.throws(insert("INSERT INTO reminders (title, scheduled_at, repeat_type, created_at, updated_at) VALUES ('a', 1, 'Yearly', 1, 1)"));
  assert.throws(insert("INSERT INTO reminders (title, category_id, scheduled_at, repeat_type, created_at, updated_at) VALUES ('a', 999, 1, 'Once', 1, 1)"), 'chave estrangeira');
  assert.throws(insert("INSERT INTO reminder_occurrences (reminder_id, scheduled_at, status) VALUES (1, 1, 'Pending')"), 'chave estrangeira');
  db.close();
});

test('índice único impede duas ocorrências em aberto para o mesmo lembrete (RN007)', () => {
  const db = openDatabase({ file: ':memory:' });
  db.prepare("INSERT INTO reminders (title, scheduled_at, repeat_type, created_at, updated_at) VALUES ('a', 1, 'Once', 1, 1)").run();
  db.prepare("INSERT INTO reminder_occurrences (reminder_id, scheduled_at, status) VALUES (1, 1, 'Pending')").run();
  assert.throws(() => db.prepare("INSERT INTO reminder_occurrences (reminder_id, scheduled_at, status) VALUES (1, 2, 'Displayed')").run());
  db.prepare("UPDATE reminder_occurrences SET status = 'Completed' WHERE id = 1").run();
  db.prepare("INSERT INTO reminder_occurrences (reminder_id, scheduled_at, status) VALUES (1, 2, 'Pending')").run();
  db.close();
});

test('migração pendente em banco existente gera backup antes de aplicar', () => {
  const dir = tmp();
  const original = migrations.slice();
  try {
    const file = path.join(dir, 'b.db');
    openDatabase({ file }).close();
    migrations.push({ version: 99, name: 'teste', sql: 'CREATE TABLE extra (id INTEGER PRIMARY KEY);' });
    const backupDir = path.join(dir, 'backups');
    const db = openDatabase({ file, backupDir });
    assert.equal(db.schemaVersion, 99);
    const backups = fs.readdirSync(backupDir);
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^reminderdesk-v1-.*\.db$/);
    db.close();
  } finally {
    migrations.length = 0;
    migrations.push(...original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migração com erro é desfeita por completo', () => {
  const dir = tmp();
  const original = migrations.slice();
  try {
    const file = path.join(dir, 'c.db');
    openDatabase({ file }).close();
    migrations.push({ version: 50, name: 'quebrada', sql: 'CREATE TABLE ok (id INTEGER); CREATE TABLE ok (id INTEGER);' });
    assert.throws(() => openDatabase({ file, backupDir: path.join(dir, 'bk') }));
    migrations.length = 0;
    migrations.push(...original);
    const db = openDatabase({ file });
    assert.equal(db.schemaVersion, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'ok'").get().n, 0);
    db.close();
  } finally {
    migrations.length = 0;
    migrations.push(...original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
