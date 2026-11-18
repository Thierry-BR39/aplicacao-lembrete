'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StartupService } = require('../../src/infrastructure/windows/startupService');
const { isHiddenLaunch, shouldOpenPanelForSecondInstance } = require('../../src/app/launchArgs');

function fakeApp({ isPackaged = true, launchItems = [] } = {}) {
  const calls = { set: [], get: [] };
  return {
    calls,
    isPackaged,
    getPath: () => 'C:\\Users\\teste\\Desktop',
    setLoginItemSettings: (opts) => calls.set.push(opts),
    getLoginItemSettings: (opts) => { calls.get.push(opts); return { openAtLogin: true, launchItems }; },
  };
}

/** Shell falso que grava um arquivo de verdade, para exercitar a criação e a remoção do atalho. */
function fakeShell({ ok = true } = {}) {
  const written = [];
  return {
    written,
    writeShortcutLink(link, op, opts) {
      written.push({ link, op, opts });
      if (ok) fs.writeFileSync(link, 'lnk');
      return ok;
    },
  };
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rd-startup-'));
const onWindows = process.platform === 'win32' ? test : test.skip;

onWindows('versão portátil registra o arquivo original, não a pasta temporária', () => {
  const app = fakeApp();
  const startup = new StartupService({
    app,
    env: { PORTABLE_EXECUTABLE_FILE: 'D:\\Apps\\Reminder-Desk-portable.exe' },
    execPath: 'C:\\Users\\teste\\AppData\\Local\\Temp\\abc123\\Reminder Desk.exe',
  });
  startup.setEnabled(true);
  assert.deepEqual(app.calls.set[0], {
    openAtLogin: true,
    path: 'D:\\Apps\\Reminder-Desk-portable.exe',
    args: ['--hidden'],
  });
  assert.equal(startup.isPortable, true);
  assert.equal(startup.isEnabled(), true);
  assert.equal(app.calls.get[0].path, 'D:\\Apps\\Reminder-Desk-portable.exe');
});

onWindows('versão instalada registra o próprio executável com --hidden', () => {
  const app = fakeApp();
  const startup = new StartupService({ app, env: {}, execPath: 'C:\\Users\\teste\\AppData\\Local\\Programs\\Reminder Desk\\Reminder Desk.exe' });
  startup.setEnabled(true);
  assert.equal(app.calls.set[0].path, 'C:\\Users\\teste\\AppData\\Local\\Programs\\Reminder Desk\\Reminder Desk.exe');
  assert.deepEqual(app.calls.set[0].args, ['--hidden']);
  assert.equal(startup.isPortable, false);
});

onWindows('desabilitar remove a entrada usando o mesmo caminho', () => {
  const app = fakeApp();
  const startup = new StartupService({ app, env: { PORTABLE_EXECUTABLE_FILE: 'D:\\x.exe' }, execPath: 'C:\\tmp\\a.exe' });
  startup.setEnabled(false);
  assert.equal(app.calls.set[0].openAtLogin, false);
  assert.equal(app.calls.set[0].path, 'D:\\x.exe');
});

test('em desenvolvimento (não empacotado) nada é registrado', () => {
  const app = fakeApp({ isPackaged: false });
  const startup = new StartupService({ app, env: {}, execPath: 'C:\\electron.exe' });
  startup.setEnabled(true);
  assert.equal(app.calls.set.length, 0);
  assert.equal(startup.isEnabled(), false);
  assert.deepEqual(startup.diagnose(), { supported: false });
  assert.throws(() => startup.createDesktopShortcut(), /empacotado/);
});

onWindows('atalho da Área de Trabalho aponta para o arquivo original e leva a identidade do app', () => {
  const app = fakeApp();
  const shell = fakeShell();
  const dir = tmpDir();
  try {
    app.getPath = () => dir;
    const startup = new StartupService({
      app, shell, appUserModelId: 'br.com.beirario.reminderdesk',
      env: { PORTABLE_EXECUTABLE_FILE: 'D:\\Apps\\RD.exe' }, execPath: 'C:\\tmp\\a.exe',
    });
    const link = startup.createDesktopShortcut();
    assert.equal(link, path.join(dir, 'Reminder Desk.lnk'));
    assert.equal(shell.written[0].opts.target, 'D:\\Apps\\RD.exe');
    assert.equal(shell.written[0].opts.cwd, 'D:\\Apps');
    assert.equal(shell.written[0].opts.appUserModelId, 'br.com.beirario.reminderdesk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

onWindows('falha ao gravar o atalho vira erro explícito', () => {
  const startup = new StartupService({ app: fakeApp(), shell: fakeShell({ ok: false }), env: {}, execPath: 'C:\\a.exe' });
  assert.throws(() => startup.createDesktopShortcut(), /atalho/);
});

onWindows('habilitar cria o atalho na pasta Inicializar com --hidden; desabilitar remove', () => {
  const dir = tmpDir();
  try {
    const shell = fakeShell();
    const startup = new StartupService({ app: fakeApp(), shell, startupDir: dir, env: {}, execPath: 'C:\\Programs\\RD\\Reminder Desk.exe' });
    startup.setEnabled(true);
    const link = path.join(dir, 'Reminder Desk.lnk');
    assert.equal(fs.existsSync(link), true);
    assert.equal(shell.written[0].opts.args, '--hidden');
    assert.equal(shell.written[0].opts.target, 'C:\\Programs\\RD\\Reminder Desk.exe');
    startup.setEnabled(false);
    assert.equal(fs.existsSync(link), false);
    startup.setEnabled(false); // remover algo inexistente não pode falhar
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

onWindows('falha no atalho da pasta Inicializar não impede o registro principal e é registrada', () => {
  const app = fakeApp();
  const warnings = [];
  const startup = new StartupService({
    app, shell: fakeShell({ ok: false }), startupDir: tmpDir(), env: {}, execPath: 'C:\\a.exe',
    logger: { info() {}, warn: (m) => warnings.push(m) },
  });
  startup.setEnabled(true);
  assert.equal(app.calls.set[0].openAtLogin, true);
  assert.equal(warnings.length, 1);
});

onWindows('diagnóstico: tudo certo, arquivo ausente e desativado no Gerenciador de Tarefas', () => {
  const dir = tmpDir();
  try {
    const exe = path.join(dir, 'Reminder Desk.exe');
    fs.writeFileSync(exe, 'x');

    const ok = new StartupService({ app: fakeApp({ launchItems: [{ path: exe, enabled: true }] }), startupDir: dir, env: {}, execPath: exe });
    const good = ok.diagnose();
    assert.equal(good.supported, true);
    assert.equal(good.targetExists, true);
    assert.equal(good.registered, true);
    assert.equal(good.allowedByWindows, true);
    assert.equal(good.portable, false);

    const missing = new StartupService({ app: fakeApp(), startupDir: dir, env: {}, execPath: path.join(dir, 'nao-existe.exe') });
    assert.equal(missing.diagnose().targetExists, false);

    const disabled = new StartupService({
      app: fakeApp({ launchItems: [{ path: exe.toUpperCase(), enabled: false }] }), startupDir: dir, env: {}, execPath: exe,
    });
    assert.equal(disabled.diagnose().allowedByWindows, false, 'comparação de caminho ignora maiúsculas');

    const portable = new StartupService({ app: fakeApp(), startupDir: dir, env: { PORTABLE_EXECUTABLE_FILE: exe }, execPath: 'C:\\tmp\\t.exe' });
    assert.equal(portable.diagnose().portable, true);
    assert.equal(portable.diagnose().executablePath, exe);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('segunda execução automática (--hidden) não abre o painel; a manual abre', () => {
  assert.equal(isHiddenLaunch(['app.exe', '--hidden']), true);
  assert.equal(isHiddenLaunch(['app.exe']), false);
  assert.equal(isHiddenLaunch(undefined), false);
  assert.equal(shouldOpenPanelForSecondInstance(['app.exe', '--hidden']), false);
  assert.equal(shouldOpenPanelForSecondInstance(['app.exe']), true);
});
