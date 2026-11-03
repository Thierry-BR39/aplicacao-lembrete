'use strict';

/**
 * Auxiliar de verificação visual, ativado apenas quando REMINDERDESK_CAPTURE_DIR
 * está definido: percorre as telas do painel, captura PNGs de todas as janelas
 * abertas e encerra o aplicativo. Não é usado em execução normal.
 */
const fs = require('node:fs');
const path = require('node:path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function save(win, dir, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
}

async function run({ app, BrowserWindow, windowManager, dir, delayMs }) {
  fs.mkdirSync(dir, { recursive: true });
  await wait(delayMs);
  const panel = windowManager.panel;
  const postIts = [...windowManager.postIts.entries()];
  let categoryOptions = 'n/a';
  let createdRows = 'n/a';

  for (const [id, entry] of postIts) {
    if (!entry.win.isDestroyed()) await save(entry.win, dir, `postit-${id}`);
  }
  if (panel && !panel.isDestroyed()) {
    const click = (js) => panel.webContents.executeJavaScript(js);
    for (const view of ['dashboard', 'reminders', 'categories', 'history', 'settings']) {
      await click(`document.querySelector('[data-view="${view}"]').click()`);
      await wait(700);
      await save(panel, dir, `panel-${view}`);
    }
    await click(`document.querySelector('[data-view="reminders"]').click()`);
    await wait(500);
    await click(`document.querySelector('.page-head .btn-primary').click()`);
    await wait(500);
    await save(panel, dir, 'panel-new-reminder-dialog');
    categoryOptions = await click("[...document.querySelectorAll('#f-category option')].map((o) => o.textContent).join('|')");
    // Cria um lembrete pelo formulário e confere se a lista é atualizada sem trocar de tela.
    const rows = () => click("document.querySelectorAll('tbody tr').length");
    const before = await rows();
    await click(`document.querySelector('#f-title').value = 'Criado pelo teste'; document.querySelector('#reminder-form').requestSubmit()`);
    await wait(1200);
    createdRows = `${before}->${await rows()}`;
  }
  let closeResult = 'n/a';
  if (process.env.REMINDERDESK_CLOSE_FIRST_POSTIT && postIts.length > 0) {
    const [firstId, first] = postIts[0];
    await first.win.webContents.executeJavaScript("document.querySelector('#done').click()");
    await wait(1000);
    closeResult = `closed=${first.win.isDestroyed()} stillTracked=${windowManager.postIts.has(firstId)}`;
  }
  const bounds = postIts.map(([id, e]) => (e.win.isDestroyed() ? `${id}:destroyed` : `${id}:${JSON.stringify(e.win.getBounds())}`));
  fs.writeFileSync(path.join(dir, 'done.txt'), `postits=${postIts.length}\nclose:${closeResult}\nbounds:${bounds.join(' ')}\ncategories:${categoryOptions}\nrows:${createdRows}\n`);
  if (!process.env.REMINDERDESK_KEEP_OPEN) app.quit();
}

module.exports = { run };
