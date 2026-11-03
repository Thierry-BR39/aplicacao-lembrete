'use strict';

/** Ícone na área de notificação do Windows e seu menu de contexto. */
class TrayIconService {
  constructor({ Tray, Menu, nativeImage, iconPath, actions }) {
    this.Tray = Tray;
    this.Menu = Menu;
    this.nativeImage = nativeImage;
    this.iconPath = iconPath;
    this.actions = actions;
    this.tray = null;
  }

  create() {
    const image = this.nativeImage.createFromPath(this.iconPath);
    this.tray = new this.Tray(image);
    this.tray.setToolTip('Reminder Desk');
    this.tray.setContextMenu(this.Menu.buildFromTemplate([
      { label: 'Abrir Reminder Desk', click: () => this.actions.open() },
      { label: 'Novo lembrete', click: () => this.actions.newReminder() },
      { label: 'Consultar lembretes', click: () => this.actions.listReminders() },
      { label: 'Configurações', click: () => this.actions.settings() },
      { type: 'separator' },
      { label: 'Sair', click: () => this.actions.quit() },
    ]));
    this.tray.on('click', () => this.actions.open());
    this.tray.on('double-click', () => this.actions.open());
  }

  setTooltip(text) {
    this.tray?.setToolTip(text);
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}

module.exports = { TrayIconService };
