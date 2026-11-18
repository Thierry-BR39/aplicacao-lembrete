'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHORTCUT_NAME = 'Reminder Desk.lnk';

const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/**
 * Inicialização automática com o Windows e atalhos, para o usuário atual.
 *
 * Dois mecanismos independentes, para resistir a bloqueios de um deles:
 *  1. chave HKCU\Software\Microsoft\Windows\CurrentVersion\Run (via Electron);
 *  2. atalho na pasta Inicializar do usuário.
 * Ambos usam --hidden (abre direto na bandeja, RN008). Se os dois dispararem, a
 * segunda execução é descartada pela instância única, sem abrir o painel.
 */
class StartupService {
  constructor({
    app,
    shell = null,
    logger,
    env = process.env,
    execPath = process.execPath,
    appUserModelId = null,
    startupDir = null,
    fsApi = fs,
  }) {
    this.app = app;
    this.shell = shell;
    this.logger = logger;
    this.env = env;
    this.execPath = execPath;
    this.appUserModelId = appUserModelId;
    this.fs = fsApi;
    this.startupDir = startupDir;
  }

  /**
   * Caminho do executável que o usuário realmente abriu. Na versão portátil, o
   * processo roda de uma pasta temporária que é apagada ao sair; o arquivo
   * original vem em PORTABLE_EXECUTABLE_FILE e é esse que deve ser registrado.
   */
  get executablePath() {
    return this.env.PORTABLE_EXECUTABLE_FILE || this.execPath;
  }

  get isPortable() {
    return Boolean(this.env.PORTABLE_EXECUTABLE_FILE);
  }

  /** Só registra a versão empacotada; em desenvolvimento isso apontaria para o electron.exe. */
  get supported() {
    return this.app.isPackaged && process.platform === 'win32';
  }

  get startupLinkPath() {
    const dir = this.startupDir
      ?? path.join(this.app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return path.join(dir, SHORTCUT_NAME);
  }

  shortcutOptions(extra = {}) {
    const target = this.executablePath;
    return {
      target,
      cwd: path.dirname(target),
      icon: target,
      iconIndex: 0,
      description: 'Reminder Desk — lembretes em post-its',
      ...(this.appUserModelId ? { appUserModelId: this.appUserModelId } : {}),
      ...extra,
    };
  }

  isEnabled() {
    if (!this.supported) return false;
    return this.app.getLoginItemSettings({ path: this.executablePath, args: ['--hidden'] }).openAtLogin;
  }

  setEnabled(enabled) {
    if (!this.supported) {
      this.logger?.info('Inicialização automática ignorada: aplicativo não está instalado (modo desenvolvimento).');
      return;
    }
    this.app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: this.executablePath,
      args: ['--hidden'],
    });
    this.syncStartupFolderShortcut(Boolean(enabled));
    this.logger?.info(`Inicialização automática ${enabled ? 'habilitada' : 'desabilitada'} (${this.executablePath}).`);
  }

  /** Mantém o atalho da pasta Inicializar em sincronia; falhas aqui não impedem o mecanismo principal. */
  syncStartupFolderShortcut(enabled) {
    if (!this.shell) return;
    try {
      const link = this.startupLinkPath;
      if (enabled) {
        this.fs.mkdirSync(path.dirname(link), { recursive: true });
        const ok = this.shell.writeShortcutLink(link, 'create', this.shortcutOptions({ args: '--hidden' }));
        if (!ok) throw new Error('writeShortcutLink retornou falso');
      } else {
        this.fs.rmSync(link, { force: true });
      }
    } catch (err) {
      this.logger?.warn('Não foi possível atualizar o atalho da pasta Inicializar.', err);
    }
  }

  /** Situação da inicialização automática, para exibir ao usuário e registrar no log. */
  diagnose() {
    if (!this.supported) return { supported: false };
    const target = this.executablePath;
    const login = this.app.getLoginItemSettings({ path: target, args: ['--hidden'] });
    const ours = (login.launchItems ?? []).find((item) => samePath(item.path, target));
    return {
      supported: true,
      portable: this.isPortable,
      executablePath: target,
      targetExists: this.fs.existsSync(target),
      registered: Boolean(login.openAtLogin),
      // false quando o usuário desativou o app em Gerenciador de Tarefas > Aplicativos de inicialização.
      allowedByWindows: ours ? ours.enabled !== false : true,
      folderShortcut: this.fs.existsSync(this.startupLinkPath),
    };
  }

  /** Cria (ou atualiza) o atalho "Reminder Desk" na Área de Trabalho; retorna o caminho do atalho. */
  createDesktopShortcut() {
    if (!this.supported || !this.shell) {
      throw new Error('O atalho só pode ser criado no aplicativo empacotado (instalado ou portátil).');
    }
    const link = path.join(this.app.getPath('desktop'), SHORTCUT_NAME);
    const ok = this.shell.writeShortcutLink(link, 'create', this.shortcutOptions());
    if (!ok) throw new Error('Não foi possível criar o atalho na Área de Trabalho.');
    this.logger?.info(`Atalho criado em ${link}.`);
    return link;
  }
}

module.exports = { StartupService, SHORTCUT_NAME };
