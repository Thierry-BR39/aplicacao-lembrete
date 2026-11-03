'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'reminders:list', 'reminders:get', 'reminders:create', 'reminders:update', 'reminders:cancel', 'reminders:delete',
  'categories:list', 'categories:create', 'categories:update', 'categories:delete',
  'history:list', 'dashboard:get', 'settings:get', 'settings:update',
  'postit:get', 'postit:complete', 'app:info',
]);
const EVENTS = new Set(['data-changed', 'navigate', 'settings-changed']);

contextBridge.exposeInMainWorld('reminderDesk', {
  invoke(channel, payload) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Canal não permitido: ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel, callback) {
    if (!EVENTS.has(channel)) throw new Error(`Evento não permitido: ${channel}`);
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
