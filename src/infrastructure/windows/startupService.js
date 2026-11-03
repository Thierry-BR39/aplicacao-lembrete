'use strict';

/**
 * Inicialização automática com o Windows para o usuário atual. O Electron
 * grava em HKCU\Software\Microsoft\Windows\CurrentVersion\Run, o que é simples
 * e removível. A flag --hidden faz o aplicativo abrir direto na bandeja (RN008).
 */
class StartupService {
  constructor({ app, logger }) {
    this.app = app;
    this.logger = logger;
  }

  /** Só registra a versão instalada; em desenvolvimento isso apontaria para o electron.exe. */
  get supported() {
    return this.app.isPackaged && process.platform === 'win32';
  }

  isEnabled() {
    if (!this.supported) return false;
    return this.app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  }

  setEnabled(enabled) {
    if (!this.supported) {
      this.logger?.info('Inicialização automática ignorada: aplicativo não está instalado (modo desenvolvimento).');
      return;
    }
    this.app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: ['--hidden'],
    });
    this.logger?.info(`Inicialização automática ${enabled ? 'habilitada' : 'desabilitada'}.`);
  }
}

module.exports = { StartupService };
