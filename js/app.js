/**
 * Carteira Digital — lógica da aplicação (vanilla JS, sem frameworks).
 */
(() => {
  'use strict';

  // ---------- Metadados das categorias (ordem fixa, cor sempre a mesma) ----------
  const CATEGORIES = [
    { tipo: 'Fixo',    tab: 'fixo',    label: 'Gastos Fixos', short: 'Fixos',    icon: '📌', colorVar: '--cat-fixo',    fixedNatureza: 'Saida'   },
    { tipo: 'Debito',  tab: 'debito',  label: 'Débitos',      short: 'Débitos',  icon: '💳', colorVar: '--cat-debito',  fixedNatureza: 'Saida'   },
    { tipo: 'Credito', tab: 'credito', label: 'Créditos',     short: 'Créditos', icon: '🧾', colorVar: '--cat-credito', fixedNatureza: 'Saida'   },
    { tipo: 'Entrada', tab: 'entrada', label: 'Entradas',     short: 'Entradas', icon: '⬆️', colorVar: '--cat-entrada', fixedNatureza: 'Entrada' },
    { tipo: 'Caixa',   tab: 'caixa',   label: 'Caixa',        short: 'Caixa',    icon: '💵', colorVar: '--cat-caixa',   fixedNatureza: null      }
  ];
  const byTipo = Object.fromEntries(CATEGORIES.map(c => [c.tipo, c]));
  const byTab = Object.fromEntries(CATEGORIES.map(c => [c.tab, c]));

  const CACHE_KEY = 'carteira-digital-cache-v1';

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateFmtLong = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

  // ---------- Estado ----------
  const state = {
    transactions: [],
    dadosList: [],
    activeTab: 'resumo',
    period: { month: currentMonthStr(), all: false },
    loaded: false
  };

  function currentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ---------- Elementos ----------
  const el = {
    setupBanner: document.getElementById('setup-banner'),
    periodToggle: document.getElementById('period-toggle'),
    periodLabel: document.getElementById('period-label'),
    periodPanel: document.getElementById('period-panel'),
    periodMonth: document.getElementById('period-month'),
    periodAll: document.getElementById('period-all'),
    tabs: document.querySelectorAll('.tab'),
    main: document.getElementById('main'),
    viewResumo: document.getElementById('view-resumo'),
    tplCategory: document.getElementById('tpl-category-view'),
    heroCard: document.getElementById('hero-card'),
    heroSaldo: document.getElementById('hero-saldo'),
    heroPeriod: document.getElementById('hero-period'),
    statGrid: document.getElementById('stat-grid'),
    chartBars: document.getElementById('chart-bars'),
    recentList: document.getElementById('recent-list'),
    fabAdd: document.getElementById('fab-add'),
    dialog: document.getElementById('tx-dialog'),
    form: document.getElementById('tx-form'),
    formTitle: document.getElementById('tx-form-title'),
    formClose: document.getElementById('tx-form-close'),
    formDelete: document.getElementById('tx-form-delete'),
    fId: document.getElementById('f-id'),
    fTipo: document.getElementById('f-tipo'),
    fieldNatureza: document.getElementById('field-natureza'),
    fNatureza: document.getElementById('f-natureza'),
    fData: document.getElementById('f-data'),
    fValor: document.getElementById('f-valor'),
    labelValor: document.getElementById('label-valor'),
    fMotivo: document.getElementById('f-motivo'),
    fLocal: document.getElementById('f-local'),
    fAplicativo: document.getElementById('f-aplicativo'),
    dadosList: document.getElementById('dados-list'),
    toast: document.getElementById('toast'),
    fieldParceladoWrap: document.getElementById('field-parcelado-wrap'),
    fParcelado: document.getElementById('f-parcelado'),
    fieldParcelas: document.getElementById('field-parcelas'),
    fParcelasTotal: document.getElementById('f-parcelas-total'),
    fParcelaAtual: document.getElementById('f-parcela-atual'),
    parcelasHint: document.getElementById('parcelas-hint'),
    parcelaBadge: document.getElementById('parcela-badge'),
    parcelaBadgeText: document.getElementById('parcela-badge-text'),
    parcelaBadgeCancel: document.getElementById('parcela-badge-cancel'),
    panelParcelamentos: document.getElementById('panel-parcelamentos'),
    parcelamentosTotal: document.getElementById('parcelamentos-total'),
    parcelamentosList: document.getElementById('parcelamentos-list')
  };

  // ---------- Utilidades ----------
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function sign(tx) { return tx.natureza === 'Entrada' ? 1 : -1; }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Soma N meses a uma data "YYYY-MM-DD", preservando o dia (ajustando se o mês destino for mais curto). */
  function addMonths(dataStr, months) {
    const [y, m, d] = parseDateParts(dataStr) || [];
    const base = new Date(y, (m || 1) - 1 + months, 1);
    const lastDayOfTarget = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(d || 1, lastDayOfTarget));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  }

  /** Extrai y/m/d de uma data "YYYY-MM-DD" ignorando qualquer sufixo de hora/timezone. */
  function parseDateParts(dataStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataStr));
    if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
    const parsed = new Date(dataStr);
    if (Number.isNaN(parsed.getTime())) return null;
    return [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
  }

  /** Normaliza qualquer formato de data recebido (planilha, cache antigo…) para "YYYY-MM-DD" puro. */
  function normalizeDateStr(dataStr) {
    if (!dataStr) return '';
    const parts = parseDateParts(dataStr);
    if (!parts) return String(dataStr);
    const [y, m, d] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function normalizeTx(tx) {
    return { ...tx, data: normalizeDateStr(tx.data) };
  }

  function showToast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('is-error', isError);
    el.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        transactions: state.transactions,
        dadosList: state.dadosList,
        savedAt: Date.now()
      }));
    } catch (_) { /* localStorage indisponível — ignora */ }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      state.transactions = (parsed.transactions || []).map(normalizeTx);
      state.dadosList = parsed.dadosList || [];
      return true;
    } catch (_) { return false; }
  }

  // ---------- Filtro por período ----------
  function inPeriod(tx) {
    if (state.period.all) return true;
    return typeof tx.data === 'string' && tx.data.startsWith(state.period.month);
  }

  function filteredTransactions() {
    return state.transactions.filter(inPeriod);
  }

  function updatePeriodLabel() {
    if (state.period.all) {
      el.periodLabel.textContent = 'Todos os períodos';
    } else {
      const [y, m] = state.period.month.split('-').map(Number);
      const label = monthFmt.format(new Date(y, m - 1, 1));
      el.periodLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  // ---------- Totais ----------
  function totalsByCategory(list) {
    const totals = Object.fromEntries(CATEGORIES.map(c => [c.tipo, 0]));
    const counts = Object.fromEntries(CATEGORIES.map(c => [c.tipo, 0]));
    list.forEach(tx => {
      if (totals[tx.tipo] === undefined) return;
      totals[tx.tipo] += Math.abs(Number(tx.valor) || 0);
      counts[tx.tipo] += 1;
    });
    return { totals, counts };
  }

  function saldoDe(list) {
    return list.reduce((acc, tx) => acc + sign(tx) * Math.abs(Number(tx.valor) || 0), 0);
  }

  // ---------- Render: Resumo ----------
  function renderResumo() {
    const list = filteredTransactions();
    const saldo = saldoDe(list);
    el.heroSaldo.textContent = currency.format(saldo);
    el.heroCard.classList.toggle('is-negative', saldo < 0);
    el.heroPeriod.textContent = state.period.all ? 'Todos os períodos' : el.periodLabel.textContent;

    const { totals, counts } = totalsByCategory(list);

    // Stat grid
    el.statGrid.innerHTML = CATEGORIES.map(c => `
      <button class="stat-tile" data-jump="${c.tab}" type="button">
        <span class="stat-tile__label"><span class="stat-tile__dot" style="background:var(${c.colorVar})"></span>${c.icon} ${c.short}</span>
        <span class="stat-tile__value">${currency.format(totals[c.tipo])}</span>
      </button>
    `).join('');
    el.statGrid.querySelectorAll('[data-jump]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.jump));
    });

    // Bar chart
    const max = Math.max(1, ...CATEGORIES.map(c => totals[c.tipo]));
    el.chartBars.innerHTML = CATEGORIES.map(c => {
      const pct = Math.round((totals[c.tipo] / max) * 100);
      return `
        <div class="bar-row">
          <span class="bar-row__label"><span class="dot" style="background:var(${c.colorVar})"></span>${c.short}</span>
          <span class="bar-row__track"><span class="bar-row__fill" style="width:${pct}%;background:var(${c.colorVar})"></span></span>
          <span class="bar-row__value">${currency.format(totals[c.tipo])}</span>
        </div>`;
    }).join('');

    // Últimos lançamentos (das transações do período, mais recentes primeiro)
    const recent = [...list].sort(sortByDateCreatedDesc).slice(0, 8);
    el.recentList.innerHTML = recent.length
      ? recent.map(tx => txItemHtml(tx)).join('')
      : `<p class="empty-state">Nenhum lançamento neste período.</p>`;
    bindTxItemClicks(el.recentList);

    renderParcelamentos();
  }

  // ---------- Parcelamentos em aberto (independe do período selecionado) ----------
  function activeInstallmentGroups() {
    const groups = {};
    state.transactions.forEach(tx => {
      if (!tx.parcelaGrupo) return;
      (groups[tx.parcelaGrupo] = groups[tx.parcelaGrupo] || []).push(tx);
    });
    const today = todayStr();
    return Object.values(groups)
      .map(items => {
        items.sort((a, b) => (a.data < b.data ? -1 : 1));
        const future = items.filter(tx => tx.data > today);
        const paid = items.length - future.length;
        return {
          groupId: items[0].parcelaGrupo,
          tipo: items[0].tipo,
          motivo: (items[0].motivo || '').replace(/\s*\(\d+\/\d+\)\s*$/, ''),
          total: Number(items[0].parcelaTotal) || items.length,
          paid,
          remainingCount: future.length,
          remainingValue: future.reduce((s, tx) => s + Math.abs(Number(tx.valor) || 0), 0),
          installmentValue: Math.abs(Number(items[0].valor) || 0),
          nextDate: future.length ? future[0].data : null
        };
      })
      .filter(g => g.remainingCount > 0)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  }

  function renderParcelamentos() {
    const groups = activeInstallmentGroups();
    el.panelParcelamentos.hidden = groups.length === 0;
    if (!groups.length) return;

    const totalRestante = groups.reduce((s, g) => s + g.remainingValue, 0);
    el.parcelamentosTotal.textContent = currency.format(totalRestante) + ' restantes';

    el.parcelamentosList.innerHTML = groups.map(g => {
      const cat = byTipo[g.tipo] || {};
      const pct = Math.round((g.paid / g.total) * 100);
      return `
        <li class="parcela-card">
          <div class="parcela-card__top">
            <span class="parcela-card__title">${cat.icon || '💸'} ${escapeHtml(g.motivo || cat.label || '')}</span>
            <span class="parcela-card__value">− ${currency.format(g.remainingValue)}</span>
          </div>
          <div class="parcela-card__track"><span class="parcela-card__track-fill" style="width:${pct}%;background:var(${cat.colorVar})"></span></div>
          <span class="parcela-card__meta">${g.paid}/${g.total} pagas · restam ${g.remainingCount}x de ${currency.format(g.installmentValue)} · próxima em ${formatDateShort(g.nextDate)}</span>
          <button type="button" class="parcela-card__cancel" data-cancel-group="${g.groupId}">Cancelar parcelas restantes</button>
        </li>`;
    }).join('');

    el.parcelamentosList.querySelectorAll('[data-cancel-group]').forEach(btn => {
      btn.addEventListener('click', () => cancelGroup(btn.dataset.cancelGroup));
    });
  }

  async function cancelGroup(groupId) {
    if (!confirm('Cancelar todas as parcelas restantes deste parcelamento? As parcelas já vencidas continuam registradas.')) return;
    try {
      const today = todayStr();
      await API.deleteGroup(groupId);
      // remove localmente só as parcelas futuras — as já vencidas permanecem (dinheiro já movimentado)
      state.transactions = state.transactions.filter(tx => !(tx.parcelaGrupo === groupId && tx.data > today));
      saveCache();
      showToast('Parcelamento cancelado.');
      renderAll();
    } catch (err) {
      showToast('Erro ao cancelar: ' + err.message, true);
    }
  }

  function sortByDateCreatedDesc(a, b) {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.criadoEm || '').localeCompare(a.criadoEm || '');
  }

  // ---------- Render: item de lançamento ----------
  function txItemHtml(tx) {
    const cat = byTipo[tx.tipo] || {};
    const positive = tx.natureza === 'Entrada';
    const valorFmt = (positive ? '+ ' : '− ') + currency.format(Math.abs(Number(tx.valor) || 0));
    const meta = [tx.local, tx.aplicativo].filter(Boolean).join(' · ');
    const dateLabel = formatDateShort(tx.data);
    const parcelaChip = tx.parcelaTotal
      ? `<span class="chip-parcela">${tx.parcelaAtual}/${tx.parcelaTotal}</span>`
      : '';
    return `
      <li>
        <button class="tx-item" data-id="${tx.id}" type="button">
          <span class="tx-item__icon" style="background:var(${cat.colorVar || '--cat-caixa'})">${cat.icon || '💸'}</span>
          <span class="tx-item__body">
            <span class="tx-item__title-row">
              <span class="tx-item__title">${escapeHtml(tx.motivo || cat.label || '')}</span>
              ${parcelaChip}
            </span>
            <span class="tx-item__meta">${escapeHtml(meta || cat.label || '')}</span>
          </span>
          <span class="tx-item__right">
            <span class="tx-item__value ${positive ? 'is-positive' : 'is-negative'}">${valorFmt}</span>
            <span class="tx-item__date">${dateLabel}</span>
          </span>
        </button>
      </li>`;
  }

  function formatDateShort(dataStr) {
    if (!dataStr) return '';
    const parts = parseDateParts(dataStr);
    if (!parts) return String(dataStr);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(date.getTime())) return String(dataStr);
    return dateFmtLong.format(date).replace('.', '');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  function bindTxItemClicks(container) {
    container.querySelectorAll('.tx-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tx = state.transactions.find(t => t.id === btn.dataset.id);
        if (tx) openForm({ mode: 'edit', tx });
      });
    });
  }

  // ---------- Render: abas de categoria ----------
  const categoryViewCache = {}; // tab -> { root, list, emptyState, filterInput }

  function ensureCategoryView(tab) {
    if (categoryViewCache[tab]) return categoryViewCache[tab];
    const cat = byTab[tab];
    const frag = el.tplCategory.content.cloneNode(true);
    const root = frag.querySelector('.view');
    root.dataset.view = tab;
    root.id = `view-${tab}`;
    const list = root.querySelector('.tx-list');
    const emptyState = root.querySelector('.empty-state');
    const filterInput = root.querySelector('.filter-input');
    filterInput.placeholder = `Buscar em ${cat.label.toLowerCase()}…`;
    filterInput.addEventListener('input', () => renderCategoryView(tab));
    el.main.appendChild(root);
    const refs = { root, list, emptyState, filterInput, summaryValue: root.querySelector('.cat-summary__value'), summaryCount: root.querySelector('.cat-summary__count') };
    categoryViewCache[tab] = refs;
    return refs;
  }

  function renderCategoryView(tab) {
    const cat = byTab[tab];
    const refs = ensureCategoryView(tab);
    const query = refs.filterInput.value.trim().toLowerCase();

    let list = filteredTransactions().filter(tx => tx.tipo === cat.tipo);
    if (query) {
      list = list.filter(tx =>
        [tx.motivo, tx.local, tx.aplicativo].some(v => (v || '').toLowerCase().includes(query))
      );
    }
    list.sort(sortByDateCreatedDesc);

    const total = list.reduce((acc, tx) => acc + Math.abs(Number(tx.valor) || 0), 0);
    refs.summaryValue.textContent = currency.format(total);
    refs.summaryCount.textContent = `${list.length} lançamento${list.length === 1 ? '' : 's'}`;

    refs.list.innerHTML = list.map(txItemHtml).join('');
    refs.emptyState.hidden = list.length > 0;
    bindTxItemClicks(refs.list);
  }

  // ---------- Navegação por abas ----------
  function switchTab(tab) {
    state.activeTab = tab;
    el.tabs.forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.toggleAttribute('aria-current', active);
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });

    el.viewResumo.classList.toggle('is-active', tab === 'resumo');
    Object.entries(categoryViewCache).forEach(([t, refs]) => {
      refs.root.classList.toggle('is-active', t === tab);
    });
    if (tab !== 'resumo') {
      ensureCategoryView(tab).root.classList.add('is-active');
      renderCategoryView(tab);
    }
    window.scrollTo(0, 0);
  }

  el.tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // ---------- Render geral ----------
  function renderAll() {
    renderResumo();
    if (state.activeTab !== 'resumo') renderCategoryView(state.activeTab);
    else Object.keys(categoryViewCache).forEach(renderCategoryView);
  }

  // ---------- Período ----------
  el.periodToggle.addEventListener('click', () => {
    const isOpen = !el.periodPanel.hidden;
    el.periodPanel.hidden = isOpen;
    el.periodToggle.setAttribute('aria-expanded', String(!isOpen));
  });
  el.periodMonth.value = state.period.month;
  el.periodMonth.addEventListener('change', () => {
    state.period.month = el.periodMonth.value || currentMonthStr();
    state.period.all = false;
    el.periodAll.checked = false;
    updatePeriodLabel();
    renderAll();
  });
  el.periodAll.addEventListener('change', () => {
    state.period.all = el.periodAll.checked;
    updatePeriodLabel();
    renderAll();
  });

  // ---------- Formulário (adicionar / editar) ----------
  function refreshDadosList() {
    el.dadosList.innerHTML = state.dadosList.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  }

  function updateNaturezaFieldVisibility() {
    const cat = byTipo[el.fTipo.value];
    el.fieldNatureza.hidden = cat.fixedNatureza !== null;
  }
  el.fTipo.addEventListener('change', updateNaturezaFieldVisibility);

  // ---------- Parcelamento (opcional) ----------
  function updateValorLabel() {
    el.labelValor.textContent = el.fParcelado.checked ? 'Valor de cada parcela (R$)' : 'Valor (R$)';
  }

  function updateParcelasHint() {
    if (!el.fParcelado.checked) { el.parcelasHint.hidden = true; return; }
    const total = parseInt(el.fParcelasTotal.value, 10);
    const atual = parseInt(el.fParcelaAtual.value, 10) || 1;
    const valor = parseFloat(el.fValor.value);
    if (!(total >= 2) || atual < 1 || atual > total) {
      el.parcelasHint.hidden = true;
      return;
    }
    const restantes = total - atual + 1;
    const totalRestante = (Number.isFinite(valor) ? valor : 0) * restantes;
    el.parcelasHint.hidden = false;
    el.parcelasHint.textContent = `Serão criados ${restantes} lançamento(s): parcela ${atual}/${total} nesta data, as demais uma a cada mês` +
      (Number.isFinite(valor) ? ` · total restante: ${currency.format(totalRestante)}` : '') + '.';
  }

  el.fParcelado.addEventListener('change', () => {
    el.fieldParcelas.hidden = !el.fParcelado.checked;
    updateValorLabel();
    updateParcelasHint();
  });
  [el.fParcelasTotal, el.fParcelaAtual, el.fValor, el.fData].forEach(input => {
    input.addEventListener('input', updateParcelasHint);
  });

  el.parcelaBadgeCancel.addEventListener('click', async () => {
    const groupId = el.parcelaBadgeCancel.dataset.groupId;
    if (!groupId) return;
    await cancelGroup(groupId);
    closeForm();
  });

  function openForm({ mode, tab, tx }) {
    el.form.reset();
    el.fId.value = '';
    el.formDelete.hidden = mode !== 'edit';
    el.fParcelado.checked = false;
    el.fieldParcelas.hidden = true;
    el.parcelasHint.hidden = true;
    el.parcelaBadge.hidden = true;

    if (mode === 'edit' && tx) {
      el.formTitle.textContent = 'Editar lançamento';
      el.fId.value = tx.id;
      el.fTipo.value = tx.tipo;
      el.fNatureza.value = tx.natureza;
      el.fData.value = normalizeDateStr(tx.data);
      el.fValor.value = Number(tx.valor) || '';
      el.fMotivo.value = tx.motivo || '';
      el.fLocal.value = tx.local || '';
      el.fAplicativo.value = tx.aplicativo || '';
      // Ao editar um lançamento já existente não se cria um novo parcelamento
      // — apenas mostramos um selo informativo (e a opção de cancelar o resto).
      el.fieldParceladoWrap.hidden = true;
      if (tx.parcelaTotal) {
        el.parcelaBadge.hidden = false;
        el.parcelaBadgeText.textContent = `Parcela ${tx.parcelaAtual} de ${tx.parcelaTotal}`;
        el.parcelaBadgeCancel.dataset.groupId = tx.parcelaGrupo;
      }
    } else {
      el.formTitle.textContent = 'Novo lançamento';
      const presetTab = tab && byTab[tab] ? tab : (state.activeTab !== 'resumo' ? state.activeTab : 'fixo');
      el.fTipo.value = byTab[presetTab].tipo;
      el.fData.value = todayStr();
      el.fNatureza.value = 'Entrada';
      el.fieldParceladoWrap.hidden = false;
      el.fParcelasTotal.value = '';
      el.fParcelaAtual.value = 1;
    }
    updateNaturezaFieldVisibility();
    updateValorLabel();

    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
  }

  function closeForm() {
    if (typeof el.dialog.close === 'function' && el.dialog.open) el.dialog.close();
    else el.dialog.removeAttribute('open');
  }

  el.fabAdd.addEventListener('click', () => openForm({ mode: 'add' }));
  el.formClose.addEventListener('click', closeForm);
  el.dialog.addEventListener('cancel', () => closeForm());
  el.dialog.addEventListener('click', (e) => {
    const rect = el.form.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) closeForm();
  });

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cat = byTipo[el.fTipo.value];
    const natureza = cat.fixedNatureza || el.fNatureza.value;
    const valorNum = parseFloat(el.fValor.value);
    if (!el.fData.value || !el.fMotivo.value.trim() || !(valorNum > 0)) {
      showToast('Preencha data, motivo e um valor válido.', true);
      return;
    }

    const id = el.fId.value;
    const isParcelado = !id && el.fParcelado.checked;
    let parcelasTotal, parcelaInicial;
    if (isParcelado) {
      parcelasTotal = parseInt(el.fParcelasTotal.value, 10);
      parcelaInicial = parseInt(el.fParcelaAtual.value, 10) || 1;
      if (!(parcelasTotal >= 2) || parcelaInicial < 1 || parcelaInicial > parcelasTotal) {
        showToast('Informe um número de parcelas válido (mínimo 2) e uma parcela inicial coerente.', true);
        return;
      }
    }

    const base = {
      tipo: cat.tipo,
      natureza,
      motivo: el.fMotivo.value.trim(),
      local: el.fLocal.value.trim(),
      aplicativo: el.fAplicativo.value.trim()
    };

    const submitBtn = el.form.querySelector('.btn--primary');
    submitBtn.disabled = true;
    try {
      if (id) {
        const payload = { ...base, data: el.fData.value, valor: valorNum };
        await API.updateTransaction(id, payload);
        const idx = state.transactions.findIndex(t => t.id === id);
        if (idx > -1) state.transactions[idx] = { ...state.transactions[idx], ...payload };
        showToast('Lançamento atualizado.');
        addMotivoToSuggestions(payload);
      } else if (isParcelado) {
        const groupId = makeId();
        const items = [];
        for (let n = parcelaInicial; n <= parcelasTotal; n++) {
          items.push({
            ...base,
            motivo: `${base.motivo} (${n}/${parcelasTotal})`,
            data: addMonths(el.fData.value, n - parcelaInicial),
            valor: valorNum,
            parcelaGrupo: groupId,
            parcelaAtual: n,
            parcelaTotal: parcelasTotal
          });
        }
        const res = await API.addManyTransactions(items);
        const ids = res.ids || [];
        items.forEach((item, i) => {
          state.transactions.push({ id: ids[i] || makeId(), criadoEm: new Date().toISOString(), ...item });
        });
        showToast(`${items.length} parcela(s) registrada(s).`);
        addMotivoToSuggestions(base);
      } else {
        const payload = { ...base, data: el.fData.value, valor: valorNum };
        const res = await API.addTransaction(payload);
        state.transactions.push({ id: res.id, criadoEm: new Date().toISOString(), ...payload });
        showToast('Lançamento salvo.');
        addMotivoToSuggestions(payload);
      }
      saveCache();
      closeForm();
      renderAll();
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  function addMotivoToSuggestions(payload) {
    [payload.motivo, payload.aplicativo].forEach(v => {
      if (v && !state.dadosList.includes(v)) state.dadosList.push(v);
    });
    refreshDadosList();
  }

  el.formDelete.addEventListener('click', async () => {
    const id = el.fId.value;
    if (!id) return;
    if (!confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return;
    el.formDelete.disabled = true;
    try {
      await API.deleteTransaction(id);
      state.transactions = state.transactions.filter(t => t.id !== id);
      saveCache();
      showToast('Lançamento excluído.');
      closeForm();
      renderAll();
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, true);
    } finally {
      el.formDelete.disabled = false;
    }
  });

  // ---------- Carregamento inicial ----------
  async function init() {
    // Pré-cria as views de categoria (para navegação instantânea)
    CATEGORIES.forEach(c => ensureCategoryView(c.tab));

    updatePeriodLabel();

    if (!API.isConfigured()) {
      el.setupBanner.hidden = false;
    }

    const hadCache = loadCache();
    if (hadCache) {
      refreshDadosList();
      renderAll();
    }

    if (!API.isConfigured()) return;

    try {
      const [transactions, dados] = await Promise.all([API.listTransactions(), API.listDados()]);
      state.transactions = transactions.map(normalizeTx);
      state.dadosList = dados;
      state.loaded = true;
      refreshDadosList();
      saveCache();
      renderAll();
    } catch (err) {
      if (!hadCache) {
        showToast('Não foi possível carregar os dados: ' + err.message, true);
      } else {
        showToast('Sem conexão — mostrando dados salvos localmente.', true);
      }
    }
  }

  switchTab('resumo');
  init();
})();
