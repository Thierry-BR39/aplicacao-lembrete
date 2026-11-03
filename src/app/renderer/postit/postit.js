'use strict';

(() => {
  const api = window.reminderDesk;
  const id = Number(new URLSearchParams(location.search).get('id'));
  const $ = (selector) => document.querySelector(selector);

  /** Escolhe tinta clara ou escura conforme a luminância do fundo, para manter o contraste. */
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55
      ? { ink: '#1b1b1b', soft: 'rgba(27,27,27,.66)', line: 'rgba(27,27,27,.18)' }
      : { ink: '#ffffff', soft: 'rgba(255,255,255,.75)', line: 'rgba(255,255,255,.28)' };
  }

  async function complete() {
    $('#close').disabled = true;
    $('#done').disabled = true;
    const res = await api.invoke('postit:complete', { id });
    if (!res.ok) {
      $('#close').disabled = false;
      $('#done').disabled = false;
    }
  }

  $('#close').addEventListener('click', complete);
  $('#done').addEventListener('click', complete);

  async function load() {
    const res = await api.invoke('postit:get', { id });
    if (!res.ok) {
      $('#title').textContent = 'Não foi possível carregar o lembrete';
      return;
    }
    const o = res.data;
    const bg = o.color ?? '#FFE66D';
    const { ink, soft, line } = inkFor(bg);
    const root = document.documentElement.style;
    root.setProperty('--note-bg', bg);
    root.setProperty('--note-ink', ink);
    root.setProperty('--note-ink-soft', soft);
    root.setProperty('--note-line', line);

    document.title = o.title;
    $('#title').textContent = o.title;
    $('#description').textContent = o.description;
    $('#when').textContent = `Programado para ${new Date(o.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
    if (o.categoryName) {
      $('#category').hidden = false;
      $('#category-name').textContent = o.categoryName;
      $('#category-dot').style.background = o.categoryColor ?? bg;
    }
    $('#late').hidden = !o.isOverdue;
    $('#done').focus({ preventScroll: true });
  }

  load();
})();
