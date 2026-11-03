'use strict';

(() => {
  const api = window.reminderDesk;
  const $ = (selector, root = document) => root.querySelector(selector);

  // ------------------------------------------------------------------ infra

  async function call(channel, payload) {
    const res = await api.invoke(channel, payload);
    if (!res.ok) {
      const err = new Error(res.error.message);
      err.field = res.error.field;
      throw err;
    }
    return res.data;
  }

  /** Cria elementos sem innerHTML: todo texto entra como textContent. */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style') Object.assign(el.style, value);
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
    const append = (child) => {
      if (Array.isArray(child)) child.forEach(append);
      else if (child !== null && child !== undefined && child !== false) {
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    };
    children.forEach(append);
    return el;
  }

  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8',
    redo: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  };
  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const fmtDateTime = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const toDateInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toTimeInput = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const REMINDER_STATUS = { Scheduled: 'Agendado', Overdue: 'Vencido', Displayed: 'Na tela', Completed: 'Concluído', Cancelled: 'Cancelado' };
  const OCCURRENCE_STATUS = { Pending: 'Pendente', Displayed: 'Exibido', Completed: 'Concluído', Cancelled: 'Cancelado' };
  const UNITS = { Daily: ['dia', 'dias'], Weekly: ['semana', 'semanas'], Monthly: ['mês', 'meses'] };

  function repeatLabel(type, interval) {
    if (type === 'Once') return 'Única';
    if (interval === 1) return { Daily: 'Diária', Weekly: 'Semanal', Monthly: 'Mensal' }[type];
    return `A cada ${interval} ${UNITS[type][1]}`;
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.className = isError ? 'toast error' : 'toast';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  function confirmDialog(message, okLabel = 'Confirmar') {
    const dialog = $('#confirm-dialog');
    $('#confirm-message').textContent = message;
    $('#confirm-ok').textContent = okLabel;
    return new Promise((resolve) => {
      const finish = (result) => {
        $('#confirm-ok').onclick = null;
        $('#confirm-cancel').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(result);
      };
      $('#confirm-ok').onclick = () => finish(true);
      $('#confirm-cancel').onclick = () => finish(false);
      dialog.onclose = () => finish(false);
      dialog.showModal();
    });
  }

  const dot = (color) => h('span', { class: 'dot', style: { background: color ?? 'var(--muted)' } });
  const categoryChip = (name, color) => (name ? h('span', { class: 'chip' }, dot(color), name) : h('span', { class: 'chip' }, '—'));

  // ------------------------------------------------------------------ estado

  const state = {
    view: 'dashboard',
    categories: [],
    reminderFilters: { search: '', categoryId: null, status: null },
    historyFilters: { from: '', to: '', categoryId: null, status: null },
  };
  const content = $('#content');

  async function loadCategories() {
    state.categories = await call('categories:list', { includeInactive: false });
  }

  function categorySelect(selected, { withAll = false, onChange } = {}) {
    const select = h('select', { 'aria-label': 'Categoria', onchange: onChange },
      withAll ? h('option', { value: '' }, 'Todas as categorias') : h('option', { value: '' }, 'Sem categoria'),
      state.categories.map((c) => h('option', { value: c.id }, c.name)));
    select.value = selected === null || selected === undefined ? '' : String(selected);
    return select;
  }

  const optionalNumber = (value) => (value === '' ? null : Number(value));

  // ------------------------------------------------------------- navegação

  const views = { dashboard: renderDashboard, reminders: renderReminders, categories: renderCategories, history: renderHistory, settings: renderSettings };

  async function show(view, { action } = {}) {
    state.view = views[view] ? view : 'dashboard';
    for (const item of document.querySelectorAll('.nav-item')) {
      if (item.dataset.view === state.view) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    try {
      await loadCategories();
      await views[state.view]();
      if (action === 'new') openReminderDialog();
    } catch (err) {
      toast(err.message, true);
    }
  }

  $('#nav').addEventListener('click', (event) => {
    const button = event.target.closest('.nav-item');
    if (button) show(button.dataset.view);
  });

  const pageHead = (title, subtitle, ...actions) => h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), subtitle ? h('p', {}, subtitle) : null),
    h('div', {}, actions));

  const newReminderButton = () => h('button', { class: 'btn btn-primary', onclick: () => openReminderDialog() }, icon('plus'), 'Novo lembrete');

  // ---------------------------------------------------------------- painel

  function occurrenceList(items, emptyText, showStatus = false) {
    if (items.length === 0) return h('p', { class: 'empty' }, emptyText);
    return h('ul', { class: 'list' }, items.map((o) => h('li', {},
      dot(o.categoryColor ?? o.color),
      h('div', { class: 'grow' },
        h('div', { class: 'ellipsis' }, o.title),
        h('div', { class: 'when' }, showStatus ? `${OCCURRENCE_STATUS[o.status]} · ${fmtDateTime(o.closedAt ?? o.displayedAt ?? o.scheduledAt)}` : fmtDateTime(o.scheduledAt))))));
  }

  async function renderDashboard() {
    const d = await call('dashboard:get');
    content.replaceChildren(
      pageHead('Painel', 'Visão geral dos seus lembretes.', newReminderButton()),
      h('div', { class: 'cards' },
        h('div', { class: 'card accent' }, h('div', { class: 'label' }, 'Agendados'), h('div', { class: 'value' }, d.scheduledCount)),
        h('div', { class: 'card' }, h('div', { class: 'label' }, 'Ativos na tela'), h('div', { class: 'value' }, d.displayedCount)),
        h('div', { class: d.overdueCount ? 'card danger' : 'card' }, h('div', { class: 'label' }, 'Vencidos'), h('div', { class: 'value' }, d.overdueCount))),
      h('div', { class: 'panels' },
        h('section', { class: 'panel' }, h('h2', {}, 'Próximos lembretes'), occurrenceList(d.upcoming, 'Nenhum lembrete agendado.')),
        d.overdue.length ? h('section', { class: 'panel' }, h('h2', {}, 'Vencidos'), occurrenceList(d.overdue, '')) : null,
        h('section', { class: 'panel' }, h('h2', {}, 'Histórico recente'), occurrenceList(d.recent, 'Ainda não há ocorrências no histórico.', true))));
  }

  // ------------------------------------------------------------ lembretes

  let reminderTableHost = null;

  async function renderReminders() {
    const f = state.reminderFilters;
    const statusSelect = h('select', { 'aria-label': 'Situação', onchange: (e) => { f.status = e.target.value || null; loadReminderTable(); } },
      h('option', { value: '' }, 'Todas as situações'),
      Object.entries(REMINDER_STATUS).map(([value, label]) => h('option', { value }, label)));
    statusSelect.value = f.status ?? '';

    reminderTableHost = h('div');
    content.replaceChildren(
      pageHead('Lembretes', 'Consulte, edite, cancele ou exclua seus lembretes.', newReminderButton()),
      h('div', { class: 'toolbar' },
        h('input', { class: 'grow', type: 'search', placeholder: 'Buscar por título ou descrição', 'aria-label': 'Buscar', value: f.search,
          oninput: (e) => { f.search = e.target.value; loadReminderTable(); } }),
        categorySelect(f.categoryId, { withAll: true, onChange: (e) => { f.categoryId = optionalNumber(e.target.value); loadReminderTable(); } }),
        statusSelect),
      reminderTableHost);
    await loadReminderTable();
  }

  async function loadReminderTable() {
    if (!reminderTableHost) return;
    const reminders = await call('reminders:list', state.reminderFilters);
    if (!reminderTableHost.isConnected) return;
    if (reminders.length === 0) {
      reminderTableHost.replaceChildren(h('p', { class: 'empty' }, 'Nenhum lembrete encontrado.'));
      return;
    }
    reminderTableHost.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Lembrete', 'Categoria', 'Próxima exibição', 'Recorrência', 'Situação', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, reminders.map(reminderRow)))));
  }

  function reminderRow(r) {
    const editable = r.status !== 'Completed';
    const cancelled = r.status === 'Cancelled';
    return h('tr', {},
      h('td', {}, h('div', {}, r.title), r.description ? h('div', { class: 'sub ellipsis' }, r.description) : null),
      h('td', {}, categoryChip(r.categoryName, r.categoryColor)),
      h('td', {}, r.nextAt && !cancelled ? fmtDateTime(r.nextAt) : '—'),
      h('td', {}, repeatLabel(r.repeatType, r.repeatInterval)),
      h('td', {}, h('span', { class: `badge ${r.status}` }, REMINDER_STATUS[r.status])),
      h('td', { class: 'actions' },
        editable ? h('button', { class: 'btn btn-icon', title: 'Editar', 'aria-label': `Editar ${r.title}`, onclick: () => openReminderDialog(r) }, icon('edit')) : null,
        ' ',
        editable && !cancelled ? h('button', { class: 'btn btn-icon', title: 'Cancelar agendamento', 'aria-label': `Cancelar ${r.title}`, onclick: () => cancelReminder(r) }, icon('ban')) : null,
        editable && cancelled ? h('button', { class: 'btn btn-icon', title: 'Reativar', 'aria-label': `Reativar ${r.title}`, onclick: () => reactivateReminder(r) }, icon('redo')) : null,
        ' ',
        h('button', { class: 'btn btn-icon btn-danger', title: 'Excluir', 'aria-label': `Excluir ${r.title}`, onclick: () => deleteReminder(r) }, icon('trash'))));
  }

  async function cancelReminder(r) {
    if (!(await confirmDialog(`Cancelar o lembrete "${r.title}"? Ele não será mais exibido, mas o histórico é mantido.`, 'Cancelar lembrete'))) return;
    try { await call('reminders:cancel', { id: r.id }); toast('Lembrete cancelado.'); } catch (err) { toast(err.message, true); }
  }

  async function reactivateReminder(r) {
    try {
      await call('reminders:update', { id: r.id, input: { ...reminderInput(r), isActive: true } });
      toast('Lembrete reativado.');
    } catch (err) { toast(err.message, true); }
  }

  async function deleteReminder(r) {
    if (!(await confirmDialog(`Excluir o lembrete "${r.title}"? O histórico de ocorrências será preservado.`, 'Excluir'))) return;
    try { await call('reminders:delete', { id: r.id }); toast('Lembrete excluído.'); } catch (err) { toast(err.message, true); }
  }

  const reminderInput = (r) => ({
    title: r.title, description: r.description, categoryId: r.categoryId, scheduledAt: r.scheduledAt,
    repeatType: r.repeatType, repeatInterval: r.repeatInterval, color: r.color, isActive: r.isActive,
  });

  // --------------------------------------------------- diálogo de lembrete

  const rd = {
    dialog: $('#reminder-dialog'), form: $('#reminder-form'), error: $('#reminder-error'),
    title: $('#f-title'), description: $('#f-description'), date: $('#f-date'), time: $('#f-time'),
    repeat: $('#f-repeat'), interval: $('#f-interval'), intervalWrap: $('#f-interval-wrap'), intervalLabel: $('#f-interval-label'),
    dateHint: $('#f-date-hint'), category: $('#f-category'), color: $('#f-color'), useCategoryColor: $('#f-use-category-color'),
    active: $('#f-active'), editingId: null,
  };
  const FIELD_BY_NAME = { title: rd.title, description: rd.description, scheduledAt: rd.date, repeatType: rd.repeat, repeatInterval: rd.interval, categoryId: rd.category, color: rd.color };

  function syncRepeatUi() {
    const recurring = rd.repeat.value !== 'Once';
    rd.intervalWrap.hidden = !recurring;
    rd.dateHint.hidden = !recurring;
    if (recurring) rd.intervalLabel.textContent = `Repetir a cada (${UNITS[rd.repeat.value][1]})`;
  }
  rd.repeat.addEventListener('change', syncRepeatUi);
  rd.useCategoryColor.addEventListener('change', () => { rd.color.disabled = rd.useCategoryColor.checked; });
  rd.color.addEventListener('input', () => { rd.useCategoryColor.checked = false; });
  $('#reminder-cancel').addEventListener('click', () => rd.dialog.close());

  function showFormError(box, message, fieldEl) {
    box.textContent = message;
    box.hidden = false;
    for (const el of box.closest('form').querySelectorAll('.invalid')) el.classList.remove('invalid');
    if (fieldEl) { fieldEl.classList.add('invalid'); fieldEl.focus(); }
  }

  function openReminderDialog(reminder = null) {
    rd.editingId = reminder ? reminder.id : null;
    $('#reminder-dialog-title').textContent = reminder ? 'Editar lembrete' : 'Novo lembrete';
    rd.error.hidden = true;
    for (const el of rd.form.querySelectorAll('.invalid')) el.classList.remove('invalid');

    rd.category.replaceChildren(
      h('option', { value: '' }, 'Sem categoria'),
      ...state.categories.map((c) => h('option', { value: c.id }, c.name)));

    let when;
    if (reminder) {
      when = reminder.scheduledAt;
    } else {
      when = new Date(Date.now() + 60 * 60 * 1000);
      when.setMinutes(0, 0, 0);
      when = when.getTime();
    }
    rd.title.value = reminder?.title ?? '';
    rd.description.value = reminder?.description ?? '';
    rd.date.value = toDateInput(when);
    rd.time.value = toTimeInput(when);
    rd.repeat.value = reminder?.repeatType ?? 'Once';
    rd.interval.value = reminder?.repeatInterval ?? 1;
    rd.category.value = reminder?.categoryId ? String(reminder.categoryId) : '';
    rd.useCategoryColor.checked = !reminder?.color;
    rd.color.value = reminder?.color ?? '#FFE66D';
    rd.color.disabled = rd.useCategoryColor.checked;
    rd.active.checked = reminder ? reminder.isActive : true;
    rd.date.min = reminder ? '' : toDateInput(Date.now());
    syncRepeatUi();
    rd.dialog.showModal();
    rd.title.focus();
  }

  rd.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const scheduledAt = rd.date.value && rd.time.value ? new Date(`${rd.date.value}T${rd.time.value}`).getTime() : NaN;
    const input = {
      title: rd.title.value,
      description: rd.description.value,
      categoryId: optionalNumber(rd.category.value),
      scheduledAt: Number.isNaN(scheduledAt) ? null : scheduledAt,
      repeatType: rd.repeat.value,
      repeatInterval: Number(rd.interval.value) || 1,
      color: rd.useCategoryColor.checked ? null : rd.color.value,
      isActive: rd.active.checked,
    };
    try {
      if (rd.editingId) await call('reminders:update', { id: rd.editingId, input });
      else await call('reminders:create', input);
      rd.dialog.close();
      toast(rd.editingId ? 'Lembrete atualizado.' : 'Lembrete criado.');
    } catch (err) {
      const target = FIELD_BY_NAME[err.field] ?? null;
      showFormError(rd.error, err.message, err.field === 'scheduledAt' && !rd.date.value ? rd.date : target);
    }
  });

  // ------------------------------------------------------------ categorias

  async function renderCategories() {
    const all = await call('categories:list', { includeInactive: false });
    content.replaceChildren(
      pageHead('Categorias', 'Organize e identifique visualmente seus lembretes.',
        h('button', { class: 'btn btn-primary', onclick: () => openCategoryDialog() }, icon('plus'), 'Nova categoria')),
      h('div', { class: 'cat-grid' }, all.map((c) => h('div', { class: 'cat' },
        h('span', { class: 'swatch', style: { background: c.color } }),
        h('div', { class: 'grow' }, h('div', { class: 'ellipsis' }, c.name), h('div', { class: 'count' }, `${c.reminderCount} lembrete(s)`)),
        h('button', { class: 'btn btn-icon', title: 'Editar', 'aria-label': `Editar categoria ${c.name}`, onclick: () => openCategoryDialog(c) }, icon('edit')),
        h('button', { class: 'btn btn-icon btn-danger', title: 'Excluir', 'aria-label': `Excluir categoria ${c.name}`, onclick: () => deleteCategory(c) }, icon('trash'))))));
  }

  const cd = { dialog: $('#category-dialog'), form: $('#category-form'), error: $('#category-error'), name: $('#c-name'), color: $('#c-color'), editingId: null };
  $('#category-cancel').addEventListener('click', () => cd.dialog.close());

  function openCategoryDialog(category = null) {
    cd.editingId = category ? category.id : null;
    $('#category-dialog-title').textContent = category ? 'Editar categoria' : 'Nova categoria';
    cd.error.hidden = true;
    cd.name.classList.remove('invalid');
    cd.name.value = category?.name ?? '';
    cd.color.value = category?.color ?? '#4DA3FF';
    cd.dialog.showModal();
    cd.name.focus();
  }

  cd.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = { name: cd.name.value, color: cd.color.value, isActive: true };
    try {
      if (cd.editingId) await call('categories:update', { id: cd.editingId, input });
      else await call('categories:create', input);
      cd.dialog.close();
      toast('Categoria salva.');
    } catch (err) {
      showFormError(cd.error, err.message, err.field === 'name' || !err.field ? cd.name : cd.color);
    }
  });

  async function deleteCategory(c) {
    const message = c.reminderCount > 0
      ? `A categoria "${c.name}" tem ${c.reminderCount} lembrete(s). Ela será desativada e os lembretes continuarão funcionando. Continuar?`
      : `Excluir a categoria "${c.name}"?`;
    if (!(await confirmDialog(message, 'Excluir'))) return;
    try {
      const { archived } = await call('categories:delete', { id: c.id });
      toast(archived ? 'Categoria desativada (há lembretes associados).' : 'Categoria excluída.');
    } catch (err) { toast(err.message, true); }
  }

  // -------------------------------------------------------------- histórico

  let historyHost = null;

  async function renderHistory() {
    const f = state.historyFilters;
    const reload = () => loadHistory();
    const statusSelect = h('select', { 'aria-label': 'Situação', onchange: (e) => { f.status = e.target.value || null; reload(); } },
      h('option', { value: '' }, 'Todas as situações'),
      ['Displayed', 'Completed', 'Cancelled'].map((s) => h('option', { value: s }, OCCURRENCE_STATUS[s])));
    statusSelect.value = f.status ?? '';

    historyHost = h('div');
    content.replaceChildren(
      pageHead('Histórico', 'Ocorrências exibidas, concluídas e canceladas.'),
      h('div', { class: 'toolbar' },
        h('label', { class: 'chip' }, 'De ', h('input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; reload(); } })),
        h('label', { class: 'chip' }, 'Até ', h('input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; reload(); } })),
        categorySelect(f.categoryId, { withAll: true, onChange: (e) => { f.categoryId = optionalNumber(e.target.value); reload(); } }),
        statusSelect),
      historyHost);
    await loadHistory();
  }

  async function loadHistory() {
    if (!historyHost) return;
    const f = state.historyFilters;
    const rows = await call('history:list', {
      from: f.from ? new Date(`${f.from}T00:00`).getTime() : null,
      to: f.to ? new Date(`${f.to}T00:00`).getTime() + 24 * 60 * 60 * 1000 : null,
      categoryId: f.categoryId,
      status: f.status,
    });
    if (!historyHost.isConnected) return;
    if (rows.length === 0) {
      historyHost.replaceChildren(h('p', { class: 'empty' }, 'Nenhuma ocorrência encontrada para os filtros.'));
      return;
    }
    historyHost.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Lembrete', 'Categoria', 'Programado', 'Exibido', 'Fechado', 'Situação'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((o) => h('tr', {},
        h('td', {}, o.title),
        h('td', {}, categoryChip(o.categoryName, o.categoryColor)),
        h('td', {}, fmtDateTime(o.scheduledAt)),
        h('td', {}, fmtDateTime(o.displayedAt)),
        h('td', {}, fmtDateTime(o.closedAt)),
        h('td', {}, h('span', { class: `badge ${o.status}` }, OCCURRENCE_STATUS[o.status]), o.isOverdue ? h('span', { class: 'badge late' }, 'Atrasado') : null)))))));
  }

  // ---------------------------------------------------------- configurações

  async function renderSettings() {
    const [settings, info] = await Promise.all([call('settings:get'), call('app:info')]);
    const save = async (changes) => {
      try { await call('settings:update', changes); toast('Configuração salva.'); } catch (err) { toast(err.message, true); }
    };
    const toggle = (key, title, desc, disabled = false) => h('label', { class: 'setting' },
      h('div', {}, h('div', {}, title), h('div', { class: 'desc' }, desc)),
      h('input', { type: 'checkbox', checked: settings[key] && !disabled, disabled, onchange: (e) => save({ [key]: e.target.checked }) }));
    const choice = (key, title, desc, options) => {
      const select = h('select', { onchange: (e) => save({ [key]: e.target.value }) }, options.map(([v, l]) => h('option', { value: v }, l)));
      select.value = settings[key];
      return h('label', { class: 'setting' }, h('div', {}, h('div', {}, title), h('div', { class: 'desc' }, desc)), select);
    };

    content.replaceChildren(
      pageHead('Configurações', 'Preferências do aplicativo.'),
      h('div', { class: 'settings' },
        toggle('startWithWindows', 'Iniciar com o Windows',
          info.startupSupported ? 'Executa o Reminder Desk automaticamente ao entrar no Windows.' : 'Disponível apenas no aplicativo instalado.', !info.startupSupported),
        toggle('startMinimized', 'Iniciar minimizado na bandeja', 'Na inicialização do Windows, abre sem mostrar o painel.'),
        choice('theme', 'Tema visual', 'Aparência do painel principal.', [['dark', 'Escuro'], ['light', 'Claro']]),
        toggle('postitAlwaysOnTop', 'Post-its sempre sobre outras janelas', 'Mantém os lembretes visíveis acima dos demais aplicativos.'),
        choice('postitPosition', 'Posição inicial dos post-its', 'Onde um post-it novo aparece. Depois de movido, a posição é lembrada.',
          [['top-right', 'Canto superior direito'], ['bottom-right', 'Canto inferior direito'], ['center', 'Centro da tela']]),
        h('label', { class: 'setting' },
          h('div', {}, h('div', {}, 'Intervalo de verificação'), h('div', { class: 'desc' }, 'A cada quantos segundos o agendador procura lembretes (1 a 15).')),
          h('input', { type: 'number', min: 1, max: 15, value: settings.schedulerIntervalSeconds,
            onchange: (e) => save({ schedulerIntervalSeconds: Number(e.target.value) }) })),
        h('p', { class: 'about' }, `Versão ${info.version} · Dados em ${info.dataDir}`)));
  }

  // ------------------------------------------------------------------ boot

  // Com um diálogo aberto a tela não é redesenhada (preservaria o formulário em edição);
  // a atualização fica pendente e é feita assim que o diálogo fecha.
  let refreshPending = false;
  document.addEventListener('close', () => {
    if (refreshPending) refreshCurrent();
  }, true);

  function refreshCurrent() {
    if (document.querySelector('dialog[open]')) {
      refreshPending = true;
      return;
    }
    refreshPending = false;
    if (state.view === 'dashboard') renderDashboard().catch(() => {});
    else if (state.view === 'reminders') loadReminderTable().catch(() => {});
    else if (state.view === 'history') loadHistory().catch(() => {});
    else if (state.view === 'categories') renderCategories().catch(() => {});
  }

  api.on('data-changed', async (change) => {
    if (change?.entity === 'category') await loadCategories().catch(() => {});
    refreshCurrent();
  });
  api.on('navigate', ({ view, action } = {}) => show(view ?? 'dashboard', { action }));
  api.on('settings-changed', (settings) => { document.documentElement.dataset.theme = settings.theme; });
  setInterval(refreshCurrent, 30000); // mantém "vencidos" e horários atualizados

  call('settings:get').then((settings) => { document.documentElement.dataset.theme = settings.theme; }).catch(() => {});
  show('dashboard');
})();
