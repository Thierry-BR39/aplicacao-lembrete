'use strict';

/**
 * Registra os canais IPC do painel e dos post-its. Toda chamada devolve
 * { ok: true, data } ou { ok: false, error: { name, message, field } }, para
 * que erros de validação cheguem à interface sem expor stack traces.
 */
function registerIpc({ ipcMain, services, windowManager, appInfo, logger }) {
  const { reminderService, categoryService, occurrenceService, dashboardService, settingsService } = services;

  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        if (!event.senderFrame?.url?.startsWith('file://')) throw new Error('Origem não autorizada.');
        return { ok: true, data: await fn(payload ?? {}, event) };
      } catch (err) {
        const known = ['ValidationError', 'NotFoundError', 'ConflictError'].includes(err?.name);
        if (!known) logger?.error(`Erro no canal ${channel}.`, err);
        return {
          ok: false,
          error: {
            name: err?.name ?? 'Error',
            message: known ? err.message : 'Ocorreu um erro inesperado. Consulte o log do aplicativo.',
            field: err?.field ?? null,
          },
        };
      }
    });
  }

  handle('reminders:list', (filters) => reminderService.list(filters));
  handle('reminders:get', ({ id }) => reminderService.get(id));
  handle('reminders:create', (input) => reminderService.create(input));
  handle('reminders:update', ({ id, input }) => reminderService.update(id, input));
  handle('reminders:cancel', ({ id }) => reminderService.cancel(id));
  handle('reminders:delete', ({ id }) => reminderService.remove(id));

  handle('categories:list', (opts) => categoryService.list(opts));
  handle('categories:create', (input) => categoryService.create(input));
  handle('categories:update', ({ id, input }) => categoryService.update(id, input));
  handle('categories:delete', ({ id }) => categoryService.remove(id));

  handle('history:list', (filters) => occurrenceService.history(filters));
  handle('dashboard:get', () => dashboardService.get());
  handle('settings:get', () => settingsService.get());
  handle('settings:update', (changes) => settingsService.update(changes));

  handle('postit:get', ({ id }) => occurrenceService.getView(id));
  handle('postit:complete', ({ id }) => windowManager.completeOccurrence(id));
  handle('app:info', () => appInfo());
}

module.exports = { registerIpc };
