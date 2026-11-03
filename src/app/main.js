'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, powerMonitor } = require('electron');
const { openDatabase } = require('../infrastructure/persistence/database');
const { createServices } = require('../application/compositionRoot');
const { FileLogger } = require('../infrastructure/logging/logger');
const { ReminderSchedulerService } = require('../infrastructure/scheduling/reminderSchedulerService');
const { TrayIconService } = require('../infrastructure/windows/trayIconService');
const { StartupService } = require('../infrastructure/windows/startupService');
const { WindowManager } = require('./windowManager');
const { registerIpc } = require('./ipc');

const APP_NAME = 'ReminderDesk';
const ASSETS = path.join(__dirname, '..', '..', 'assets');

app.setName(APP_NAME);
const dataDir = process.env.REMINDERDESK_DATA_DIR || path.join(app.getPath('appData'), APP_NAME);
app.setPath('userData', dataDir);
if (process.platform === 'win32') app.setAppUserModelId('br.com.beirario.reminderdesk');

const logger = new FileLogger(path.join(dataDir, 'logs'));
const state = { quitting: false };

// Falhas inesperadas são registradas; o agendador não pode morrer por causa delas.
process.on('uncaughtException', (err) => logger.error('Exceção não tratada.', err));
process.on('unhandledRejection', (err) => logger.error('Promessa rejeitada sem tratamento.', err instanceof Error ? err : new Error(String(err))));

// Instância única: uma segunda execução apenas pede à principal que abra o painel.
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  start();
}

function start() {
  let services = null;
  let windowManager = null;
  let scheduler = null;
  let tray = null;

  app.on('second-instance', () => {
    logger.info('Segunda execução detectada: abrindo o painel da instância principal.');
    windowManager?.showPanel();
  });
  // Os post-its e o painel podem fechar sem encerrar o processo: o agendador continua na bandeja.
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    state.quitting = true;
  });
  app.on('will-quit', () => {
    scheduler?.stop();
    tray?.destroy();
    try {
      services?.db.close();
    } catch (err) {
      logger.error('Falha ao fechar o banco de dados.', err);
    }
    logger.info('Aplicativo encerrado.');
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    logger.info(`Iniciando Reminder Desk ${app.getVersion()} (dados em ${dataDir}).`);

    const db = openDatabase({
      file: path.join(dataDir, 'reminderdesk.db'),
      backupDir: path.join(dataDir, 'backups'),
      logger,
    });
    services = createServices(db);
    const { bus, settingsService, occurrenceService, reminderService } = services;

    const startup = new StartupService({ app, logger });
    const iconPath = path.join(ASSETS, 'icon.png');

    windowManager = new WindowManager({ BrowserWindow, screen, services, state, logger, iconPath });

    registerIpc({
      ipcMain,
      services,
      windowManager,
      logger,
      appInfo: () => ({
        version: app.getVersion(),
        dataDir,
        startupSupported: startup.supported,
        startupEnabled: startup.isEnabled(),
      }),
    });

    tray = new TrayIconService({
      Tray,
      Menu,
      nativeImage,
      iconPath: path.join(ASSETS, 'tray.png'),
      actions: {
        open: () => windowManager.showPanel(),
        newReminder: () => windowManager.showPanel({ view: 'reminders', action: 'new' }),
        listReminders: () => windowManager.showPanel({ view: 'reminders' }),
        settings: () => windowManager.showPanel({ view: 'settings' }),
        quit: () => app.quit(),
      },
    });
    tray.create();

    const refreshTooltip = () => {
      try {
        const { scheduledCount, displayedCount } = services.dashboardService.get();
        tray.setTooltip(`Reminder Desk — ${scheduledCount} agendado(s), ${displayedCount} na tela`);
      } catch (err) {
        logger.error('Falha ao atualizar a dica da bandeja.', err);
      }
    };

    bus.on('data-changed', (change) => {
      windowManager.broadcast('data-changed', change);
      refreshTooltip();
    });
    bus.on('occurrence-cancelled', ({ occurrenceId }) => windowManager.closeSilently(occurrenceId));
    bus.on('settings-changed', ({ settings }) => {
      startup.setEnabled(settings.startWithWindows);
      windowManager.broadcast('settings-changed', settings);
    });

    const settings = settingsService.get();
    startup.setEnabled(settings.startWithWindows);

    scheduler = new ReminderSchedulerService({
      occurrenceService,
      settingsService,
      clock: services.clock,
      logger,
      onShow: (occurrence) => windowManager.openPostIt(occurrence),
    });

    // Após suspensão ou desbloqueio, verifica imediatamente em vez de esperar o próximo ciclo.
    powerMonitor.on('resume', () => scheduler.tick());
    powerMonitor.on('unlock-screen', () => scheduler.tick());

    // RN008: iniciado pelo Windows (--hidden), abre direto na bandeja; execução manual mostra o painel.
    const launchedHidden = process.argv.includes('--hidden') && settings.startMinimized;
    if (!launchedHidden) windowManager.showPanel();

    scheduler.start(); // recupera atrasados e exibidos não fechados na primeira passada
    if (process.env.REMINDERDESK_CAPTURE_DIR) {
      require('./devCapture').run({ app, BrowserWindow, windowManager, dir: process.env.REMINDERDESK_CAPTURE_DIR, delayMs: 4000 })
        .catch((err) => logger.error('Falha na captura de verificação.', err));
    }
    refreshTooltip();
    logger.info(`Pronto. ${reminderService.list().length} lembrete(s) cadastrado(s).`);
  }).catch((err) => {
    logger.error('Falha fatal na inicialização.', err);
    app.exit(1);
  });
}
