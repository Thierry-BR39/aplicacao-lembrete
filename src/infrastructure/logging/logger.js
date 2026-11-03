'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEEP_FILES = 14;

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayStamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Logger simples em arquivo diário (local), com retenção das últimas 14 jornadas. */
class FileLogger {
  constructor(dir) {
    this.dir = dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.prune();
    } catch {
      /* sem diretório de log, o aplicativo continua funcionando */
    }
  }

  write(level, message, err) {
    const now = new Date();
    const detail = err ? ` | ${err.stack ?? err.message ?? err}` : '';
    const line = `${now.toISOString()} [${level}] ${message}${detail}\n`;
    try {
      fs.appendFileSync(path.join(this.dir, `reminderdesk-${dayStamp(now)}.log`), line);
    } catch {
      /* falha de log nunca pode afetar o agendador */
    }
    if (level === 'ERROR') console.error(line.trimEnd());
  }

  info(message) {
    this.write('INFO', message);
  }

  warn(message, err) {
    this.write('WARN', message, err);
  }

  error(message, err) {
    this.write('ERROR', message, err);
  }

  prune() {
    const files = fs.readdirSync(this.dir).filter((f) => /^reminderdesk-.*\.log$/.test(f)).sort();
    for (const file of files.slice(0, Math.max(0, files.length - KEEP_FILES))) {
      fs.rmSync(path.join(this.dir, file), { force: true });
    }
  }
}

module.exports = { FileLogger };
