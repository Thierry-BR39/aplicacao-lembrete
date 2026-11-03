'use strict';

const { ValidationError } = require('../domain/errors');

const POSITIONS = ['top-right', 'bottom-right', 'center'];
const THEMES = ['dark', 'light'];

const DEFAULTS = Object.freeze({
  startWithWindows: true,
  startMinimized: true,
  theme: 'dark',
  postitAlwaysOnTop: true,
  schedulerIntervalSeconds: 10,
  postitPosition: 'top-right',
});

const VALIDATORS = {
  startWithWindows: (v) => typeof v === 'boolean',
  startMinimized: (v) => typeof v === 'boolean',
  theme: (v) => THEMES.includes(v),
  postitAlwaysOnTop: (v) => typeof v === 'boolean',
  schedulerIntervalSeconds: (v) => Number.isInteger(v) && v >= 1 && v <= 15,
  postitPosition: (v) => POSITIONS.includes(v),
};

class SettingsService {
  constructor({ settings, clock, bus }) {
    this.settings = settings;
    this.clock = clock;
    this.bus = bus;
  }

  /** Configurações efetivas: valores gravados sobre os padrões. */
  get() {
    const stored = this.settings.getAll();
    const result = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && VALIDATORS[key](stored[key])) result[key] = stored[key];
    }
    return result;
  }

  update(partial) {
    const changes = partial ?? {};
    for (const [key, value] of Object.entries(changes)) {
      if (!(key in DEFAULTS)) throw new ValidationError(`Configuração desconhecida: ${key}`, key);
      if (!VALIDATORS[key](value)) throw new ValidationError(`Valor inválido para ${key}.`, key);
    }
    const now = this.clock.now();
    for (const [key, value] of Object.entries(changes)) this.settings.set(key, value, now);
    const current = this.get();
    this.bus.emit('settings-changed', { settings: current });
    return current;
  }
}

module.exports = { SettingsService, DEFAULTS, POSITIONS, THEMES };
