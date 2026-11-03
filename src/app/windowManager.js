'use strict';

const path = require('node:path');
const { resolveBounds, MIN_WIDTH, MIN_HEIGHT } = require('../domain/rules/windowBounds');

const POSTIT_WIDTH = 300;
const POSTIT_HEIGHT = 240;
const MARGIN = 24;
const SAVE_DEBOUNCE_MS = 400;

/** Gerencia a janela do painel e as janelas independentes dos post-its. */
class WindowManager {
  constructor({ BrowserWindow, screen, services, state, logger, iconPath }) {
    this.BrowserWindow = BrowserWindow;
    this.screen = screen;
    this.services = services;
    this.state = state; // { quitting: boolean }
    this.logger = logger;
    this.iconPath = iconPath;
    this.panel = null;
    this.postIts = new Map(); // occurrenceId -> { win, handled, saveTimer }
  }

  webPreferences() {
    return {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    };
  }

  lockDown(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
  }

  // ---------------------------------------------------------------- painel

  /** Abre (ou traz para a frente) o painel principal; `navigation` = { view, action }. */
  showPanel(navigation = null) {
    if (this.panel && !this.panel.isDestroyed()) {
      if (this.panel.isMinimized()) this.panel.restore();
      this.panel.show();
      this.panel.focus();
      if (navigation) this.panel.webContents.send('navigate', navigation);
      return this.panel;
    }

    const win = new this.BrowserWindow({
      width: 1120,
      height: 740,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: 'Reminder Desk',
      backgroundColor: '#111111',
      icon: this.iconPath,
      autoHideMenuBar: true,
      webPreferences: this.webPreferences(),
    });
    win.setMenuBarVisibility(false);
    this.lockDown(win);
    win.loadFile(path.join(__dirname, 'renderer', 'panel', 'index.html'));
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    if (navigation) win.webContents.once('did-finish-load', () => win.webContents.send('navigate', navigation));
    // Fechar o painel apenas o descarta: o processo (e o agendador) segue na bandeja.
    win.on('closed', () => {
      if (this.panel === win) this.panel = null;
    });
    this.panel = win;
    return win;
  }

  /** Envia um evento ao painel, se estiver aberto. */
  broadcast(channel, payload) {
    if (this.panel && !this.panel.isDestroyed()) this.panel.webContents.send(channel, payload);
  }

  // --------------------------------------------------------------- post-its

  defaultBounds(settings) {
    const area = this.screen.getPrimaryDisplay().workArea;
    const offset = (this.postIts.size % 8) * 30;
    const width = POSTIT_WIDTH;
    const height = POSTIT_HEIGHT;
    switch (settings.postitPosition) {
      case 'bottom-right':
        return { x: area.x + area.width - width - MARGIN - offset, y: area.y + area.height - height - MARGIN - offset, width, height };
      case 'center':
        return { x: Math.round(area.x + (area.width - width) / 2) + offset, y: Math.round(area.y + (area.height - height) / 2) + offset, width, height };
      default:
        return { x: area.x + area.width - width - MARGIN - offset, y: area.y + MARGIN + offset, width, height };
    }
  }

  /** Abre o post-it da ocorrência. Ignora se já estiver aberto (RN007). */
  openPostIt(occurrence) {
    if (this.postIts.has(occurrence.id)) return;

    const settings = this.services.settingsService.get();
    const saved = this.services.occurrenceService.getWindowSettings(occurrence.reminderId);
    const workAreas = this.screen.getAllDisplays().map((d) => d.workArea);
    const bounds = resolveBounds(saved, workAreas, this.defaultBounds(settings));
    const alwaysOnTop = settings.postitAlwaysOnTop && (saved?.isAlwaysOnTop ?? true);

    const win = new this.BrowserWindow({
      ...bounds,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop,
      title: occurrence.title,
      backgroundColor: occurrence.color ?? '#FFE66D',
      icon: this.iconPath,
      webPreferences: this.webPreferences(),
    });
    if (alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
    // Janelas sem moldura no Windows nascem alguns pixels maiores que o pedido; fixar os limites
    // evita que o tamanho salvo cresça a cada abertura.
    win.setBounds(bounds);
    this.lockDown(win);

    const entry = { win, handled: false, saveTimer: null, extra: { width: 0, height: 0 } };
    this.postIts.set(occurrence.id, entry);

    const persistBounds = () => {
      if (win.isDestroyed()) return;
      try {
        const real = win.getBounds();
        this.services.occurrenceService.saveWindowBounds(occurrence.reminderId, {
          x: real.x,
          y: real.y,
          width: real.width - entry.extra.width,
          height: real.height - entry.extra.height,
        });
      } catch (err) {
        this.logger?.error('Falha ao salvar a posição do post-it.', err);
      }
    };
    const scheduleSave = () => {
      clearTimeout(entry.saveTimer);
      entry.saveTimer = setTimeout(persistBounds, SAVE_DEBOUNCE_MS);
    };
    win.on('moved', scheduleSave);
    win.on('resized', scheduleSave);

    // Encerramento da sessão do Windows: o post-it não pode ser dado como concluído.
    win.on('session-end', () => {
      this.state.quitting = true;
    });

    // Fechamento por qualquer meio (botão, Alt+F4) conclui a ocorrência.
    win.on('close', (event) => {
      if (entry.handled || this.state.quitting) {
        entry.handled = true;
        clearTimeout(entry.saveTimer);
        if (!this.state.quitting) persistBounds();
        return;
      }
      try {
        persistBounds();
        entry.handled = true;
        this.services.occurrenceService.complete(occurrence.id);
      } catch (err) {
        entry.handled = false;
        event.preventDefault();
        this.logger?.error(`Falha ao concluir a ocorrência ${occurrence.id}; o post-it foi mantido.`, err);
      }
    });
    win.on('closed', () => {
      clearTimeout(entry.saveTimer);
      this.postIts.delete(occurrence.id);
    });

    win.loadFile(path.join(__dirname, 'renderer', 'postit', 'postit.html'), { query: { id: String(occurrence.id) } });
    win.once('ready-to-show', () => {
      win.setBounds(bounds);
      // showInactive: o lembrete aparece sem roubar o foco do que o usuário está digitando.
      win.showInactive();
      if (alwaysOnTop) win.moveTop();
      // Mede quanto maior o Windows criou a janela e desconta isso ao salvar, sem deriva.
      const real = win.getBounds();
      entry.extra = { width: real.width - bounds.width, height: real.height - bounds.height };
    });
  }

  /** Conclusão pedida pelo próprio post-it (botão de fechar). */
  completeOccurrence(occurrenceId) {
    const entry = this.postIts.get(occurrenceId);
    if (entry) entry.handled = true;
    try {
      this.services.occurrenceService.complete(occurrenceId);
    } catch (err) {
      if (entry) entry.handled = false;
      throw err;
    }
    if (entry && !entry.win.isDestroyed()) entry.win.close();
    return { completed: true };
  }

  /** Fecha o post-it sem concluir (lembrete cancelado ou excluído). */
  closeSilently(occurrenceId) {
    const entry = this.postIts.get(occurrenceId);
    if (!entry) return;
    entry.handled = true;
    if (!entry.win.isDestroyed()) entry.win.close();
  }
}

module.exports = { WindowManager };
