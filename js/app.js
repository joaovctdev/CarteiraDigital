/**
 * Carteira Digital — lógica da aplicação (vanilla JS, sem frameworks).
 * Os cálculos ficam em js/finance.js; aqui é estado, renderização e sincronização.
 */
(() => {
  "use strict";

  const F = window.Finance;

  // ---------- Metadados das categorias (ordem fixa, cor sempre a mesma) ----------
  const CATS = {
    Fixo: { label: "Fixo", plural: "Fixos", icon: "i-pin", color: "--cat-fixo" },
    Debito: { label: "Débito", plural: "Débito", icon: "i-card", color: "--cat-debito" },
    Credito: { label: "Crédito", plural: "Crédito", icon: "i-receipt", color: "--cat-credito" },
    Entrada: { label: "Entrada", plural: "Entradas", icon: "i-in", color: "--cat-entrada" },
    Caixa: { label: "Caixa", plural: "Caixa", icon: "i-vault", color: "--cat-caixa" },
  };

  const CONFIG_DEFAULTS = {
    CDI_ANUAL: 14.9,
    PCT_CDI: 120,
    TETO_MENSAL: 0,
    CAIXA_SALDO_INICIAL: 0,
    CAIXA_DATA_INICIAL: "",
  };

  const CACHE_KEY = "carteira-digital-cache-v2";
  const LEGACY_CACHE_KEY = "carteira-digital-cache-v1";

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const numberFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const compactFmt = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const shortDateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const monthShortFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

  // ---------- Estado ----------
  const state = {
    transactions: [],
    dadosList: [],
    config: { ...CONFIG_DEFAULTS },
    recorrentes: [],
    activeTab: "inicio",
    month: F.currentMonthStr(),
    filter: "todos",
    query: "",
    legacyBackend: false,
  };

  // ---------- Elementos ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    app: $("app"),
    setupBanner: $("setup-banner"),
    monthPrev: $("month-prev"),
    monthNext: $("month-next"),
    monthLabel: $("month-label"),
    monthNav: document.querySelector(".month-nav"),
    syncDot: $("sync-dot"),
    tabs: document.querySelectorAll(".tab"),
    views: document.querySelectorAll(".view"),
    // início
    bConta: $("b-conta"),
    bCaixa: $("b-caixa"),
    bTotal: $("b-total"),
    budgetOf: $("budget-of"),
    budgetBody: $("budget-body"),
    flow: $("flow"),
    flowResult: $("flow-result"),
    pendingPanel: $("pending-panel"),
    pendingList: $("pending-list"),
    pendingTotal: $("pending-total"),
    panelParcelamentos: $("panel-parcelamentos"),
    parcelamentosTotal: $("parcelamentos-total"),
    parcelamentosList: $("parcelamentos-list"),
    recentList: $("recent-list"),
    // lançamentos
    txTotals: $("tx-totals"),
    txChips: $("tx-chips"),
    txSearch: $("tx-search"),
    txGroups: $("tx-groups"),
    // caixa
    cBruto: $("c-bruto"),
    cRate: $("c-rate"),
    cKpis: $("c-kpis"),
    cGuardar: $("c-guardar"),
    cResgatar: $("c-resgatar"),
    cHistory: document.querySelector("#c-history tbody"),
    cRealForm: $("c-real-form"),
    cReal: $("c-real"),
    // projeção
    pLabel: $("p-label"),
    pFinal: $("p-final"),
    pNote: $("p-note"),
    pChart: $("p-chart"),
    pTable: document.querySelector("#p-table tbody"),
    pAssumptions: $("p-assumptions"),
    // ajustes
    settingsForm: $("settings-form"),
    sTeto: $("s-teto"),
    sCdi: $("s-cdi"),
    sPct: $("s-pct"),
    sSaldo: $("s-saldo"),
    sData: $("s-data"),
    recAdd: $("rec-add"),
    recList: $("rec-list"),
    sheetLink: $("sheet-link"),
    // formulário
    fabAdd: $("fab-add"),
    dialog: $("tx-dialog"),
    form: $("tx-form"),
    formTitle: $("tx-form-title"),
    formClose: $("tx-form-close"),
    formDelete: $("tx-form-delete"),
    formSubmit: $("tx-form-submit"),
    formError: $("form-error"),
    fKind: $("f-kind"),
    fCat: $("f-cat"),
    fValor: $("f-valor"),
    labelValor: $("label-valor"),
    fieldData: $("field-data"),
    fData: $("f-data"),
    fieldDia: $("field-dia"),
    fDia: $("f-dia"),
    fMotivo: $("f-motivo"),
    fLocal: $("f-local"),
    fAplicativo: $("f-aplicativo"),
    fieldRepetirWrap: $("field-repetir-wrap"),
    fRepetir: $("f-repetir"),
    fieldParceladoWrap: $("field-parcelado-wrap"),
    fParcelado: $("f-parcelado"),
    fieldAtivoWrap: $("field-ativo-wrap"),
    fAtivo: $("f-ativo"),
    fieldParcelas: $("field-parcelas"),
    fParcelasTotal: $("f-parcelas-total"),
    fParcelaAtual: $("f-parcela-atual"),
    parcelasHint: $("parcelas-hint"),
    parcelaBadge: $("parcela-badge"),
    parcelaBadgeText: $("parcela-badge-text"),
    parcelaBadgeCancel: $("parcela-badge-cancel"),
    dadosList: $("dados-list"),
    toast: $("toast"),
    toastText: $("toast-text"),
    toastAction: $("toast-action"),
  };

  // ---------- Utilidades ----------
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234". */
  function parseMoney(str) {
    let s = String(str || "").replace(/[R$\s]/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "5.000" = cinco mil
    return Number(s);
  }

  function fmtInput(n) {
    return Number(n) ? numberFmt.format(Number(n)) : "";
  }

  function dateObj(dataStr) {
    const [y, m, d] = F.parseDateParts(dataStr) || [1970, 1, 1];
    return new Date(y, m - 1, d);
  }

  function formatDateShort(dataStr) {
    if (!dataStr) return "";
    return shortDateFmt.format(dateObj(dataStr)).replace(".", "");
  }

  function monthLabel(monthStr, short = false) {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    if (short) return monthShortFmt.format(d).replace(".", "");
    const label = monthFmt.format(d);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(
      /[&<>"']/g,
      (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[s],
    );
  }

  const icon = (id) => `<svg class="ico"><use href="#${id}" /></svg>`;
  const valorAbs = (x) => Math.abs(Number(x.valor) || 0);

  function normalizeTx(tx) {
    return { ...tx, data: F.normalizeDateStr(tx.data) };
  }

  function sortByDateCreatedDesc(a, b) {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.criadoEm || "").localeCompare(a.criadoEm || "");
  }

  // ---------- Toast ----------
  function showToast(message, { error = false, action, onAction } = {}) {
    el.toastText.textContent = message;
    el.toast.classList.toggle("is-error", error);
    el.toastAction.hidden = !action;
    el.toastAction.textContent = action || "";
    el.toastAction.onclick = () => {
      el.toast.hidden = true;
      if (onAction) onAction();
    };
    el.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (el.toast.hidden = true), action ? 6000 : 3000);
  }

  // ---------- Cache local ----------
  function saveCache() {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          transactions: state.transactions,
          dadosList: state.dadosList,
          config: state.config,
          recorrentes: state.recorrentes,
          savedAt: Date.now(),
        }),
      );
    } catch (_) {
      /* localStorage indisponível — ignora */
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY) || localStorage.getItem(LEGACY_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      state.transactions = (parsed.transactions || []).map(normalizeTx);
      state.dadosList = parsed.dadosList || [];
      state.config = { ...CONFIG_DEFAULTS, ...(parsed.config || {}) };
      state.recorrentes = parsed.recorrentes || [];
      return true;
    } catch (_) {
      return false;
    }
  }

  // ---------- Sincronização otimista ----------
  let inflight = 0;
  function setSync(status) {
    el.syncDot.classList.toggle("is-busy", status === "busy");
    el.syncDot.classList.toggle("is-error", status === "error");
    el.syncDot.title =
      status === "busy" ? "Salvando na planilha…" : status === "error" ? "Erro ao salvar" : "Sincronizado";
  }

  /**
   * Aplica a mudança na tela na hora e manda para a planilha em segundo plano.
   * Se a planilha recusar, desfaz e oferece "Tentar de novo".
   */
  function commit({ apply, revert, remote, success, failure = "Não foi possível salvar" }) {
    apply();
    saveCache();
    renderAll();
    if (success) showToast(success);
    if (!API.isConfigured()) return Promise.resolve();
    inflight++;
    setSync("busy");
    return remote()
      .then(() => {
        inflight--;
        if (!inflight) setSync("ok");
      })
      .catch((err) => {
        inflight--;
        setSync("error");
        revert();
        saveCache();
        renderAll();
        showToast(`${failure}: ${err.message}`, {
          error: true,
          action: "Tentar de novo",
          onAction: () => commit({ apply, revert, remote, success, failure }),
        });
      });
  }

  function requireNewBackend() {
    if (!state.legacyBackend) return true;
    showToast("Publique a nova versão do Apps Script para salvar ajustes e recorrentes.", { error: true });
    return false;
  }

  // ---------- Linha de lançamento ----------
  function txRowHtml(tx, { showDate = true } = {}) {
    const cat = CATS[tx.tipo] || CATS.Debito;
    let value;
    let valueClass = "";
    let sub = showDate ? formatDateShort(tx.data) : "";
    if (F.isEntrada(tx)) {
      value = "+ " + currency.format(valorAbs(tx));
      valueClass = "is-positive";
    } else if (tx.tipo === "Caixa") {
      value = currency.format(valorAbs(tx));
      valueClass = "is-transfer";
      sub = (F.isGuardar(tx) ? "guardado" : "resgatado") + (showDate ? " · " + formatDateShort(tx.data) : "");
    } else {
      value = "− " + currency.format(valorAbs(tx));
    }
    const meta = [tx.local, tx.aplicativo].filter(Boolean).join(" · ") || cat.label;
    const tags = [
      tx.parcelaTotal ? `<span class="tag">${tx.parcelaAtual}/${tx.parcelaTotal}</span>` : "",
      tx.recorrenteId ? `<span class="tag">mensal</span>` : "",
    ].join("");
    const iconId = tx.tipo === "Caixa" && !F.isGuardar(tx) ? "i-out" : cat.icon;
    return `
      <li>
        <button class="row" data-id="${escapeHtml(tx.id)}" type="button">
          <span class="row__icon" style="--c:var(${cat.color})">${icon(iconId)}</span>
          <span class="row__body">
            <span class="row__title"><span>${escapeHtml(tx.motivo || cat.label)}</span>${tags}</span>
            <span class="row__meta">${escapeHtml(meta)}</span>
          </span>
          <span class="row__right">
            <span class="row__value money ${valueClass}">${value}</span>
            ${sub ? `<span class="row__sub">${sub}</span>` : ""}
          </span>
        </button>
      </li>`;
  }

  function bindRows(container) {
    container.querySelectorAll(".row[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tx = state.transactions.find((t) => t.id === btn.dataset.id);
        if (tx) openForm({ mode: "edit", tx });
      });
    });
  }

  // ---------- Render: Início ----------
  function renderInicio() {
    const today = F.todayStr();
    const conta = F.contaBalance(state.transactions, today);
    const caixa = F.caixaPosition(state.transactions, state.config, today).bruto;
    el.bConta.textContent = currency.format(conta);
    el.bConta.classList.toggle("is-negative", conta < 0);
    el.bCaixa.textContent = currency.format(caixa);
    el.bTotal.textContent = currency.format(conta + caixa);

    renderBudget();

    // Fluxo do mês
    const t = F.monthTotals(state.transactions, state.month);
    const guardouLiquido = t.guardado - t.resgatado;
    el.flow.innerHTML = [
      ["Entrou", t.entradas, "--cat-entrada"],
      ["Saiu", t.saidas, "--cat-debito"],
      [guardouLiquido < 0 ? "Resgatou" : "Guardou", Math.abs(guardouLiquido), "--cat-caixa"],
    ]
      .map(
        ([label, v, c]) => `
        <div class="flow__item">
          <span class="flow__label"><i style="background:var(${c})"></i>${label}</span>
          <span class="flow__value money">${currency.format(v)}</span>
        </div>`,
      )
      .join("");
    const max = Math.max(1, ...F.SAIDA_TIPOS.map((tp) => t.porTipo[tp]));
    el.flow.innerHTML += `<div class="cat-bars" style="grid-column:1/-1">${F.SAIDA_TIPOS.map((tp) => {
      const pct = (t.porTipo[tp] / max) * 100;
      return `
        <div class="cat-bar">
          <span class="cat-bar__label">${CATS[tp].plural}</span>
          <span class="cat-bar__track"><span class="cat-bar__fill" style="width:${pct}%;background:var(${CATS[tp].color})"></span></span>
          <span class="cat-bar__value money">${currency.format(t.porTipo[tp])}</span>
        </div>`;
    }).join("")}</div>`;
    el.flowResult.textContent =
      t.entradas || t.saidas
        ? (t.resultado >= 0 ? "Sobrou " : "Faltou ") + currency.format(Math.abs(t.resultado))
        : "";

    renderPending();
    renderParcelamentos();

    const recent = state.transactions
      .filter((tx) => tx.data.startsWith(state.month))
      .sort(sortByDateCreatedDesc)
      .slice(0, 6);
    el.recentList.innerHTML = recent.length
      ? recent.map((tx) => txRowHtml(tx)).join("")
      : `<li class="empty-state">Nada lançado em ${monthLabel(state.month).toLowerCase()}. Toque em + para registrar.</li>`;
    bindRows(el.recentList);
  }

  function renderBudget() {
    const b = F.budget(state.transactions, state.recorrentes, state.config, state.month);
    if (!(b.teto > 0)) {
      el.budgetOf.textContent = "";
      el.budgetBody.innerHTML = `
        <div class="budget-empty">
          <span>Defina quanto quer gastar por mês e veja aqui quanto ainda pode gastar.</span>
          <button type="button" class="btn btn--ghost" data-go-teto style="flex:none">Definir teto</button>
        </div>`;
      el.budgetBody.querySelector("[data-go-teto]").addEventListener("click", () => {
        switchTab("ajustes");
        el.sTeto.focus();
      });
      return;
    }
    const current = F.currentMonthStr();
    const over = b.restante < 0;
    const level = b.pct > 1 ? "is-over" : b.pct >= 0.8 ? "is-warn" : "";
    let sub;
    if (state.month === current) {
      sub = over
        ? "Você passou do teto deste mês."
        : `Dá para gastar ${currency.format(b.porDia)} por dia nos próximos ${b.diasRestantes} dia${b.diasRestantes === 1 ? "" : "s"}.`;
    } else if (state.month < current) {
      sub = `O mês fechou com ${Math.round(b.pct * 100)}% do teto usado.`;
    } else {
      sub = `${currency.format(b.usado)} já comprometidos com parcelas e recorrentes.`;
    }
    const wGasto = Math.min(100, (b.gasto / b.teto) * 100);
    const wPend = Math.min(100 - wGasto, (b.comprometido / b.teto) * 100);
    el.budgetOf.textContent = `${Math.round(b.pct * 100)}% de ${currency.format(b.teto)}`;
    el.budgetBody.innerHTML = `
      <p class="budget__headline money ${over ? "is-over" : ""}">
        ${over ? currency.format(-b.restante) + " acima do teto" : currency.format(b.restante) + " livres"}
      </p>
      <p class="budget__sub">${sub}</p>
      <div class="meter ${level}" role="meter" aria-valuemin="0" aria-valuemax="${b.teto}" aria-valuenow="${b.usado.toFixed(2)}" aria-label="Teto usado">
        <span class="meter__fill" style="width:${wGasto}%"></span>
        <span class="meter__fill meter__fill--pending" style="width:${wPend}%"></span>
      </div>
      <p class="budget__legend">
        <span>Gasto <b class="money">${currency.format(b.gasto)}</b></span>
        ${b.comprometido ? `<span>A lançar <b class="money">${currency.format(b.comprometido)}</b></span>` : ""}
      </p>`;
  }

  function renderPending() {
    const current = F.currentMonthStr();
    const pending = state.month <= current ? F.pendingRecurring(state.recorrentes, state.transactions, state.month) : [];
    el.pendingPanel.hidden = pending.length === 0;
    if (!pending.length) return;
    el.pendingTotal.textContent = `${pending.length} ${pending.length === 1 ? "item" : "itens"}`;
    el.pendingList.innerHTML = pending
      .map((rec) => {
        const cat = CATS[rec.tipo] || CATS.Fixo;
        const sign = rec.tipo === "Entrada" ? "+ " : rec.tipo === "Caixa" ? "" : "− ";
        return `
        <li class="pending-row">
          <button class="row" type="button" data-rec="${escapeHtml(rec.id)}">
            <span class="row__icon" style="--c:var(${cat.color})">${icon(cat.icon)}</span>
            <span class="row__body">
              <span class="row__title"><span>${escapeHtml(rec.motivo || cat.label)}</span></span>
              <span class="row__meta">vence ${formatDateShort(rec.dueDate)}</span>
            </span>
            <span class="row__right"><span class="row__value money ${rec.tipo === "Entrada" ? "is-positive" : ""}">${sign}${currency.format(rec.valor)}</span></span>
          </button>
          <button type="button" class="confirm-btn" data-confirm="${escapeHtml(rec.id)}" aria-label="Lançar ${escapeHtml(rec.motivo)}">${icon("i-check")}Lançar</button>
        </li>`;
      })
      .join("");
    el.pendingList.querySelectorAll("[data-rec]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const rec = pending.find((r) => r.id === btn.dataset.rec);
        if (rec) openForm({ mode: "confirm", rec });
      }),
    );
    el.pendingList.querySelectorAll("[data-confirm]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const rec = pending.find((r) => r.id === btn.dataset.confirm);
        if (rec) confirmRecurring(rec);
      }),
    );
  }

  function txFromRecurring(rec, overrides = {}) {
    return {
      id: makeId(),
      criadoEm: new Date().toISOString(),
      data: rec.dueDate,
      tipo: rec.tipo,
      natureza: rec.natureza,
      motivo: rec.motivo,
      local: rec.local || "",
      aplicativo: rec.aplicativo || "",
      valor: rec.valor,
      recorrenteId: rec.id,
      ...overrides,
    };
  }

  function confirmRecurring(rec) {
    const tx = txFromRecurring(rec);
    addTx(tx, `${rec.motivo} lançado.`);
  }

  // ---------- Parcelamentos em aberto (independe do mês selecionado) ----------
  function activeInstallmentGroups() {
    const groups = {};
    state.transactions.forEach((tx) => {
      if (!tx.parcelaGrupo) return;
      (groups[tx.parcelaGrupo] = groups[tx.parcelaGrupo] || []).push(tx);
    });
    const today = F.todayStr();
    return Object.values(groups)
      .map((items) => {
        items.sort((a, b) => (a.data < b.data ? -1 : 1));
        const future = items.filter((tx) => tx.data > today);
        return {
          groupId: items[0].parcelaGrupo,
          tipo: items[0].tipo,
          motivo: (items[0].motivo || "").replace(/\s*\(\d+\/\d+\)\s*$/, ""),
          total: Number(items[0].parcelaTotal) || items.length,
          paid: (Number(items[0].parcelaTotal) || items.length) - future.length,
          remainingCount: future.length,
          remainingValue: future.reduce((s, tx) => s + valorAbs(tx), 0),
          installmentValue: valorAbs(items[0]),
          nextDate: future.length ? future[0].data : null,
        };
      })
      .filter((g) => g.remainingCount > 0)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  }

  function renderParcelamentos() {
    const groups = activeInstallmentGroups();
    el.panelParcelamentos.hidden = groups.length === 0;
    if (!groups.length) return;
    const totalRestante = groups.reduce((s, g) => s + g.remainingValue, 0);
    el.parcelamentosTotal.textContent = currency.format(totalRestante);
    el.parcelamentosList.innerHTML = groups
      .map((g) => {
        const cat = CATS[g.tipo] || CATS.Credito;
        const pct = Math.round((g.paid / g.total) * 100);
        return `
        <li class="parcela-card">
          <div class="parcela-card__top">
            <span>${escapeHtml(g.motivo || cat.label)}</span>
            <span class="money">${currency.format(g.remainingValue)}</span>
          </div>
          <div class="parcela-card__track"><span style="width:${pct}%;background:var(${cat.color})"></span></div>
          <span class="parcela-card__meta">${g.paid}/${g.total} pagas · faltam ${g.remainingCount}× ${currency.format(g.installmentValue)} · próxima ${formatDateShort(g.nextDate)}</span>
          <button type="button" class="link-btn link-btn--danger" data-cancel-group="${escapeHtml(g.groupId)}">Cancelar parcelas restantes</button>
        </li>`;
      })
      .join("");
    el.parcelamentosList
      .querySelectorAll("[data-cancel-group]")
      .forEach((btn) => btn.addEventListener("click", () => cancelGroup(btn.dataset.cancelGroup)));
  }

  function cancelGroup(groupId) {
    if (!confirm("Cancelar as parcelas que ainda não venceram? As já vencidas continuam registradas.")) {
      return Promise.resolve();
    }
    const today = F.todayStr();
    const removed = state.transactions.filter((tx) => tx.parcelaGrupo === groupId && tx.data > today);
    return commit({
      apply: () => {
        state.transactions = state.transactions.filter((tx) => !removed.includes(tx));
      },
      revert: () => {
        state.transactions.push(...removed);
      },
      remote: () => API.deleteGroup(groupId),
      success: `${removed.length} parcela${removed.length === 1 ? "" : "s"} cancelada${removed.length === 1 ? "" : "s"}.`,
      failure: "Não foi possível cancelar",
    });
  }

  // ---------- Render: Lançamentos ----------
  function matchesFilter(tx) {
    switch (state.filter) {
      case "entradas":
        return F.isEntrada(tx);
      case "saidas":
        return F.isSaida(tx);
      case "todos":
        return true;
      default:
        return tx.tipo === state.filter;
    }
  }

  function renderLancamentos() {
    const monthTxs = state.transactions.filter((tx) => tx.data.startsWith(state.month));
    const t = F.monthTotals(monthTxs);
    el.txTotals.innerHTML = `
      <div><dt>Entradas</dt><dd class="money">${currency.format(t.entradas)}</dd></div>
      <div><dt>Saídas</dt><dd class="money">${currency.format(t.saidas)}</dd></div>
      <div><dt>Guardado</dt><dd class="money">${currency.format(t.guardado - t.resgatado)}</dd></div>`;

    const q = state.query.trim().toLowerCase();
    const list = monthTxs
      .filter(matchesFilter)
      .filter((tx) => !q || [tx.motivo, tx.local, tx.aplicativo].some((v) => (v || "").toLowerCase().includes(q)))
      .sort(sortByDateCreatedDesc);

    if (!list.length) {
      el.txGroups.innerHTML = `<p class="empty-state">${
        q || state.filter !== "todos"
          ? "Nenhum lançamento com esse filtro neste mês."
          : `Nada lançado em ${monthLabel(state.month).toLowerCase()}. Toque em + para registrar.`
      }</p>`;
      return;
    }

    const byDay = new Map();
    list.forEach((tx) => {
      if (!byDay.has(tx.data)) byDay.set(tx.data, []);
      byDay.get(tx.data).push(tx);
    });
    el.txGroups.innerHTML = [...byDay.entries()]
      .map(([day, items]) => {
        const net = items.reduce((s, tx) => s + (F.isEntrada(tx) ? valorAbs(tx) : F.isSaida(tx) ? -valorAbs(tx) : 0), 0);
        const label = dayFmt.format(dateObj(day)).replace(/\./g, "");
        return `
        <section class="day-group">
          <header class="day-group__head">
            <span>${label}${day > F.todayStr() ? " · previsto" : ""}</span>
            <span class="money">${net ? (net > 0 ? "+ " : "− ") + currency.format(Math.abs(net)) : ""}</span>
          </header>
          <ul class="rows">${items.map((tx) => txRowHtml(tx, { showDate: false })).join("")}</ul>
        </section>`;
      })
      .join("");
    bindRows(el.txGroups);
  }

  el.txChips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    el.txChips.querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-checked", String(c === chip)));
    renderLancamentos();
  });
  el.txSearch.addEventListener("input", () => {
    state.query = el.txSearch.value;
    renderLancamentos();
  });

  // ---------- Render: Caixa ----------
  function rateDescription() {
    const pct = Number(state.config.PCT_CDI) || 0;
    const cdi = Number(state.config.CDI_ANUAL) || 0;
    const efetiva = F.annualRate(state.config) * 100;
    return `${numberFmt.format(pct).replace(",00", "")}% do CDI · CDI ${numberFmt.format(cdi)}% a.a. ≈ ${numberFmt.format(efetiva)}% a.a.`;
  }

  function renderCaixa() {
    const today = F.todayStr();
    const current = F.currentMonthStr();
    const pos = F.caixaPosition(state.transactions, state.config, today);
    el.cBruto.textContent = currency.format(pos.bruto);
    el.cRate.textContent = rateDescription();
    const mes = F.caixaMonthYield(state.transactions, state.config, current);
    el.cKpis.innerHTML = `
      <div><dt>Rendeu em ${monthLabel(current, true)}</dt><dd class="money is-positive">+ ${currency.format(mes)}</dd></div>
      <div><dt>Rendimento no saldo</dt><dd class="money">${currency.format(pos.rendimentoBruto)}</dd></div>
      <div><dt>Líquido de IR</dt><dd class="money">${currency.format(pos.liquido)}</dd></div>`;

    const rows = [];
    for (let i = 0; i < 6; i++) {
      const m = F.addMonthsToMonth(current, -i);
      const t = F.monthTotals(state.transactions.filter((tx) => tx.tipo === "Caixa"), m);
      const y = F.caixaMonthYield(state.transactions, state.config, m);
      rows.push(`
        <tr>
          <td>${monthLabel(m, true)}${i === 0 ? " (até hoje)" : ""}</td>
          <td>${t.guardado ? currency.format(t.guardado) : "—"}</td>
          <td>${t.resgatado ? currency.format(t.resgatado) : "—"}</td>
          <td class="${y ? "is-positive" : ""}">${y ? "+ " + currency.format(y) : "—"}</td>
        </tr>`);
    }
    el.cHistory.innerHTML = rows.join("");
  }

  el.cGuardar.addEventListener("click", () => openForm({ mode: "add", kind: "caixa", cat: "guardar" }));
  el.cResgatar.addEventListener("click", () => openForm({ mode: "add", kind: "caixa", cat: "resgatar" }));

  el.cRealForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = parseMoney(el.cReal.value);
    if (!(v >= 0)) {
      el.cReal.setAttribute("aria-invalid", "true");
      el.cReal.focus();
      return;
    }
    el.cReal.removeAttribute("aria-invalid");
    if (!requireNewBackend()) return;
    saveConfig({ CAIXA_SALDO_INICIAL: v, CAIXA_DATA_INICIAL: F.todayStr() }, "Saldo do caixa atualizado.");
    el.cReal.value = "";
  });

  // ---------- Render: Projeção ----------
  function renderProjecao() {
    const rows = F.projection(state, 6);
    const last = rows[rows.length - 1];
    const hoje = F.caixaPosition(state.transactions, state.config).bruto;
    const totalRende = rows.reduce((s, r) => s + r.rendimento, 0);
    el.pLabel.textContent = `Caixa projetado em ${monthLabel(last.month).toLowerCase()}`;
    el.pFinal.textContent = currency.format(last.caixa);
    el.pNote.textContent = `Hoje ${currency.format(hoje)} · ${currency.format(totalRende)} de rendimento no período`;

    el.pChart.innerHTML = chartSvg(rows, hoje);

    const n0 = (v) => intFmt.format(Math.round(v));
    el.pTable.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td>${monthLabel(r.month, true)}</td>
          <td>${n0(r.entradas)}</td>
          <td>${n0(r.fixos)}</td>
          <td>${r.parcelas ? n0(r.parcelas) : "—"}</td>
          <td>${n0(r.variaveis)}</td>
          <td class="${r.sobra < 0 ? "is-negative" : "is-positive"}">${r.sobra < 0 ? "−" : ""}${n0(Math.abs(r.sobra))}</td>
          <td>${n0(r.rendimento)}</td>
          <td class="is-strong">${n0(r.caixa)}</td>
        </tr>`,
      )
      .join("");

    const recIn = state.recorrentes.filter((r) => r.ativo && r.tipo === "Entrada");
    const recOut = state.recorrentes.filter((r) => r.ativo && F.SAIDA_TIPOS.includes(r.tipo));
    const teto = Number(state.config.TETO_MENSAL) || 0;
    el.pAssumptions.innerHTML = [
      recIn.length
        ? `Entradas: ${recIn.length === 1 ? "o recorrente de entrada cadastrado" : `os ${recIn.length} recorrentes de entrada cadastrados`}.`
        : "Entradas: média dos últimos 3 meses. Cadastre o salário em Ajustes → Recorrentes para ficar exato.",
      recOut.length
        ? `Fixos: ${recOut.length === 1 ? "o recorrente de saída cadastrado" : `os ${recOut.length} recorrentes de saída cadastrados`}.`
        : "Fixos: média dos últimos 3 meses.",
      "Parcelas já lançadas entram com o valor exato de cada mês.",
      `Variáveis: média de débito e crédito avulsos dos últimos 3 meses${teto ? ", limitada ao seu teto" : ""}.`,
      `A sobra de cada mês vai para o caixa, que rende ${rateDescription()}; se faltar dinheiro, sai do caixa.`,
      "Valores brutos, sem IR, IOF nem feriados.",
    ]
      .map((s) => `<li>${s}</li>`)
      .join("");
  }

  function chartSvg(rows, caixaHoje) {
    const W = Math.max(300, Math.round(el.pChart.clientWidth || 640));
    const H = W < 480 ? 220 : 260;
    const padL = 8;
    const padR = 8;
    const barTop = H * 0.46;
    const barBottom = H - 34;
    const lineTop = 22;
    const lineBottom = 96;
    const colW = (W - padL - padR) / rows.length;
    const maxFlow = Math.max(1, ...rows.map((r) => Math.max(r.entradas, r.saidas)));
    const caixas = [caixaHoje, ...rows.map((r) => r.caixa)];
    const minC = Math.min(...caixas);
    const maxC = Math.max(...caixas);
    const spanC = maxC - minC || 1;
    const yLine = (v) => lineBottom - ((v - minC) / spanC) * (lineBottom - lineTop);
    const barH = (v) => (v / maxFlow) * (barBottom - barTop);
    const bw = Math.min(22, colW * 0.28);

    let bars = "";
    let labels = "";
    const pts = [];
    rows.forEach((r, i) => {
      const cx = padL + colW * i + colW / 2;
      const hIn = barH(r.entradas);
      const hOut = barH(r.saidas);
      bars += `<rect class="bar-in" x="${cx - bw - 2}" y="${barBottom - hIn}" width="${bw}" height="${Math.max(hIn, 1)}" rx="3"><title>Entradas ${currency.format(r.entradas)}</title></rect>`;
      bars += `<rect class="bar-out" x="${cx + 2}" y="${barBottom - hOut}" width="${bw}" height="${Math.max(hOut, 1)}" rx="3"><title>Saídas ${currency.format(r.saidas)}</title></rect>`;
      labels += `<text x="${cx}" y="${H - 14}" text-anchor="middle">${monthLabel(r.month, true)}</text>`;
      pts.push([cx, yLine(r.caixa), r.caixa]);
    });
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const dots = pts
      .map(
        (p, i) =>
          `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="4"><title>Caixa ${currency.format(p[2])}</title></circle>` +
          (i === 0 || i === pts.length - 1
            ? `<text class="dot-label" x="${p[0]}" y="${p[1] - 10}" text-anchor="middle">${compactFmt.format(p[2])}</text>`
            : ""),
      )
      .join("");
    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projeção de entradas, saídas e caixa nos próximos ${rows.length} meses">
        <line class="grid" x1="${padL}" x2="${W - padR}" y1="${barBottom + 0.5}" y2="${barBottom + 0.5}" />
        <line class="grid" x1="${padL}" x2="${W - padR}" y1="${barTop - 6}" y2="${barTop - 6}" stroke-dasharray="2 4" />
        ${bars}
        <path class="line" d="${path}" />
        ${dots}
        ${labels}
      </svg>`;
  }

  // ---------- Render: Ajustes ----------
  let settingsDirty = false;
  function renderAjustes() {
    if (!settingsDirty) {
      const c = state.config;
      el.sTeto.value = fmtInput(c.TETO_MENSAL);
      el.sCdi.value = c.CDI_ANUAL !== "" ? numberFmt.format(Number(c.CDI_ANUAL) || 0) : "";
      el.sPct.value = c.PCT_CDI !== "" ? String(Number(c.PCT_CDI) || 0).replace(".", ",") : "";
      el.sSaldo.value = fmtInput(c.CAIXA_SALDO_INICIAL);
      el.sData.value = F.normalizeDateStr(c.CAIXA_DATA_INICIAL);
    }

    const recs = [...state.recorrentes].sort((a, b) => (b.ativo - a.ativo) || (a.dia - b.dia));
    el.recList.innerHTML = recs.length
      ? recs
          .map((rec) => {
            const cat = CATS[rec.tipo] || CATS.Fixo;
            const sign = rec.tipo === "Entrada" ? "+ " : rec.tipo === "Caixa" ? "" : "− ";
            return `
            <li>
              <button class="row" type="button" data-rec-edit="${escapeHtml(rec.id)}">
                <span class="row__icon" style="--c:var(${rec.ativo ? cat.color : "--text-muted"})">${icon(cat.icon)}</span>
                <span class="row__body">
                  <span class="row__title"><span>${escapeHtml(rec.motivo || cat.label)}</span>${rec.ativo ? "" : `<span class="tag tag--paused">pausado</span>`}</span>
                  <span class="row__meta">Todo dia ${rec.dia} · ${cat.label}</span>
                </span>
                <span class="row__right"><span class="row__value money ${rec.tipo === "Entrada" ? "is-positive" : ""}">${sign}${currency.format(rec.valor)}</span></span>
              </button>
            </li>`;
          })
          .join("")
      : `<li class="empty-state">Nenhum recorrente ainda.</li>`;
    el.recList.querySelectorAll("[data-rec-edit]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const rec = state.recorrentes.find((r) => r.id === btn.dataset.recEdit);
        if (rec) openForm({ mode: "rec-edit", rec });
      }),
    );
  }

  el.settingsForm.addEventListener("input", () => (settingsDirty = true));
  el.settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = [
      [el.sTeto, "TETO_MENSAL", true],
      [el.sCdi, "CDI_ANUAL", false],
      [el.sPct, "PCT_CDI", false],
      [el.sSaldo, "CAIXA_SALDO_INICIAL", true],
    ];
    const patch = {};
    let firstInvalid = null;
    fields.forEach(([input, key, allowEmpty]) => {
      const raw = input.value.trim();
      const v = raw === "" && allowEmpty ? 0 : parseMoney(raw);
      const ok = Number.isFinite(v) && v >= 0;
      input.toggleAttribute("aria-invalid", !ok);
      if (ok) patch[key] = v;
      else firstInvalid = firstInvalid || input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      showToast("Confira os campos marcados.", { error: true });
      return;
    }
    patch.CAIXA_DATA_INICIAL = el.sData.value || "";
    if (!requireNewBackend()) return;
    settingsDirty = false;
    saveConfig(patch, "Ajustes salvos.");
  });

  function saveConfig(patch, message) {
    const before = { ...state.config };
    return commit({
      apply: () => Object.assign(state.config, patch),
      revert: () => (state.config = before),
      remote: () => API.setConfig(patch),
      success: message,
    });
  }

  el.recAdd.addEventListener("click", () => openForm({ mode: "rec-add" }));
  if (window.CONFIG && CONFIG.SHEET_VIEW_URL) el.sheetLink.href = CONFIG.SHEET_VIEW_URL;
  else el.sheetLink.hidden = true;

  // ---------- Navegação ----------
  function switchTab(tab) {
    state.activeTab = tab;
    el.tabs.forEach((btn) => {
      if (btn.dataset.tab === tab) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    el.views.forEach((v) => v.classList.toggle("is-active", v.dataset.view === tab));
    // o seletor de mês só vale para Início e Lançamentos
    el.monthNav.style.visibility = tab === "inicio" || tab === "lancamentos" ? "visible" : "hidden";
    el.fabAdd.hidden = tab === "ajustes";
    renderActive();
    window.scrollTo({ top: 0 });
  }

  el.tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  document.querySelectorAll("[data-jump]").forEach((btn) =>
    btn.addEventListener("click", () => switchTab(btn.dataset.jump)),
  );

  function setMonth(m) {
    state.month = m;
    el.monthLabel.textContent = monthLabel(m);
    el.monthLabel.setAttribute("aria-current", m === F.currentMonthStr() ? "date" : "false");
    renderActive();
  }
  el.monthPrev.addEventListener("click", () => setMonth(F.addMonthsToMonth(state.month, -1)));
  el.monthNext.addEventListener("click", () => setMonth(F.addMonthsToMonth(state.month, 1)));
  el.monthLabel.addEventListener("click", () => setMonth(F.currentMonthStr()));

  // ---------- Render geral ----------
  const renderers = {
    inicio: renderInicio,
    lancamentos: renderLancamentos,
    caixa: renderCaixa,
    projecao: renderProjecao,
    ajustes: renderAjustes,
  };

  function renderActive() {
    renderers[state.activeTab]();
  }

  function renderAll() {
    renderActive();
  }

  // ---------- Formulário ----------
  const KIND_CATS = {
    saida: [
      ["Fixo", "Fixo"],
      ["Debito", "Débito"],
      ["Credito", "Crédito"],
    ],
    entrada: [],
    caixa: [
      ["guardar", "Guardar"],
      ["resgatar", "Resgatar"],
    ],
  };

  const form = { mode: "add", kind: "saida", cat: "Debito", tx: null, rec: null };

  function kindOf(item) {
    if (item.tipo === "Entrada") return { kind: "entrada", cat: null };
    if (item.tipo === "Caixa") return { kind: "caixa", cat: item.natureza === "Saida" ? "resgatar" : "guardar" };
    return { kind: "saida", cat: item.tipo };
  }

  function tipoNatureza() {
    if (form.kind === "entrada") return { tipo: "Entrada", natureza: "Entrada" };
    if (form.kind === "caixa") return { tipo: "Caixa", natureza: form.cat === "resgatar" ? "Saida" : "Entrada" };
    return { tipo: form.cat, natureza: "Saida" };
  }

  function setKind(kind, cat) {
    form.kind = kind;
    const cats = KIND_CATS[kind];
    form.cat = cat && cats.some(([v]) => v === cat) ? cat : cats.length ? (kind === "saida" ? "Debito" : cats[0][0]) : null;
    el.fKind.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.kind === kind)));
    el.fCat.hidden = cats.length === 0;
    el.fCat.innerHTML = cats
      .map(([v, label]) => {
        const color = CATS[v] ? `<i style="background:var(${CATS[v].color})"></i>` : "";
        return `<button type="button" class="chip" role="radio" aria-checked="${v === form.cat}" data-cat="${v}">${color}${label}</button>`;
      })
      .join("");
    updateFormVisibility();
  }

  el.fKind.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (b) setKind(b.dataset.kind);
  });
  el.fCat.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    form.cat = b.dataset.cat;
    el.fCat.querySelectorAll("[data-cat]").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
    updateFormVisibility();
  });

  function updateFormVisibility() {
    const isRec = form.mode === "rec-add" || form.mode === "rec-edit";
    const isNew = form.mode === "add";
    el.fieldData.hidden = isRec;
    el.fieldDia.hidden = !isRec;
    el.fieldAtivoWrap.hidden = form.mode !== "rec-edit";
    el.fieldRepetirWrap.hidden = !isNew || el.fParcelado.checked;
    el.fieldParceladoWrap.hidden = !isNew || form.kind !== "saida" || el.fRepetir.checked;
    if (el.fieldParceladoWrap.hidden) el.fParcelado.checked = false;
    if (el.fieldRepetirWrap.hidden) el.fRepetir.checked = false;
    el.fieldParcelas.hidden = !el.fParcelado.checked;
    el.labelValor.textContent = el.fParcelado.checked ? "valor de cada parcela" : isRec ? "valor mensal" : "";
    updateParcelasHint();
  }

  function updateParcelasHint() {
    if (!el.fParcelado.checked) {
      el.parcelasHint.hidden = true;
      return;
    }
    const total = parseInt(el.fParcelasTotal.value, 10);
    const atual = parseInt(el.fParcelaAtual.value, 10) || 1;
    const valor = parseMoney(el.fValor.value);
    if (!(total >= 2) || atual < 1 || atual > total) {
      el.parcelasHint.hidden = true;
      return;
    }
    const restantes = total - atual + 1;
    el.parcelasHint.hidden = false;
    el.parcelasHint.textContent =
      `Serão ${restantes} lançamento${restantes > 1 ? "s" : ""}: a parcela ${atual}/${total} nesta data e as outras uma por mês` +
      (Number.isFinite(valor) ? `, somando ${currency.format(valor * restantes)}.` : ".");
  }

  el.fParcelado.addEventListener("change", updateFormVisibility);
  el.fRepetir.addEventListener("change", updateFormVisibility);
  [el.fParcelasTotal, el.fParcelaAtual, el.fValor].forEach((i) => i.addEventListener("input", updateParcelasHint));

  el.parcelaBadgeCancel.addEventListener("click", async () => {
    const groupId = el.parcelaBadgeCancel.dataset.groupId;
    if (!groupId) return;
    closeForm();
    await cancelGroup(groupId);
  });

  function setFormError(msg, input) {
    el.formError.hidden = !msg;
    el.formError.textContent = msg || "";
    el.form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  }

  function openForm({ mode, tx, rec, kind, cat }) {
    el.form.reset();
    setFormError(null);
    form.mode = mode;
    form.tx = tx || null;
    form.rec = rec || null;
    el.parcelaBadge.hidden = true;
    el.fParcelaAtual.value = 1;

    const source = tx || rec;
    const titles = {
      add: "Novo lançamento",
      edit: "Editar lançamento",
      confirm: "Lançar recorrente",
      "rec-add": "Novo recorrente",
      "rec-edit": "Editar recorrente",
    };
    el.formTitle.textContent = titles[mode];
    el.formDelete.hidden = !(mode === "edit" || mode === "rec-edit");
    el.formSubmit.textContent = mode === "confirm" ? "Lançar" : "Salvar";

    if (source) {
      const k = kindOf(source);
      setKind(k.kind, k.cat);
      el.fValor.value = fmtInput(source.valor);
      el.fMotivo.value = source.motivo || "";
      el.fLocal.value = source.local || "";
      el.fAplicativo.value = source.aplicativo || "";
    } else {
      const preset = kind || (state.activeTab === "caixa" ? "caixa" : "saida");
      setKind(preset, cat);
    }

    if (mode === "edit") {
      el.fData.value = F.normalizeDateStr(tx.data);
      if (tx.parcelaTotal) {
        el.parcelaBadge.hidden = false;
        el.parcelaBadgeText.textContent = `Parcela ${tx.parcelaAtual} de ${tx.parcelaTotal}`;
        el.parcelaBadgeCancel.dataset.groupId = tx.parcelaGrupo;
      } else if (tx.recorrenteId) {
        el.parcelaBadge.hidden = false;
        el.parcelaBadgeText.textContent = "Lançamento de um recorrente";
        el.parcelaBadgeCancel.hidden = true;
      }
    } else if (mode === "confirm") {
      el.fData.value = rec.dueDate;
    } else if (mode === "rec-edit") {
      el.fDia.value = rec.dia;
      el.fAtivo.checked = rec.ativo;
    } else if (mode === "rec-add") {
      el.fDia.value = Number(F.todayStr().slice(8, 10));
    } else {
      // novo lançamento: se estiver vendo outro mês, já sugere uma data nele
      const today = F.todayStr();
      el.fData.value = today.startsWith(state.month) ? today : `${state.month}-01`;
    }
    if (!(mode === "edit" && tx.recorrenteId && !tx.parcelaTotal)) el.parcelaBadgeCancel.hidden = false;
    updateFormVisibility();

    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
    if (mode === "add" || mode === "rec-add") el.fValor.focus();
  }

  function closeForm() {
    if (typeof el.dialog.close === "function" && el.dialog.open) el.dialog.close();
    else el.dialog.removeAttribute("open");
  }

  el.fabAdd.addEventListener("click", () => openForm({ mode: "add" }));
  el.formClose.addEventListener("click", closeForm);
  el.dialog.addEventListener("click", (e) => {
    if (e.target === el.dialog) closeForm(); // clique no fundo escuro
  });

  function readForm() {
    const valor = parseMoney(el.fValor.value);
    if (!(valor > 0)) return setFormError("Informe um valor maior que zero.", el.fValor);
    const motivo = el.fMotivo.value.trim();
    if (!motivo) return setFormError("Diga o motivo, por exemplo “Mercado” ou “Salário”.", el.fMotivo);
    const isRec = form.mode === "rec-add" || form.mode === "rec-edit";
    if (!isRec && !el.fData.value) return setFormError("Escolha a data.", el.fData);
    const dia = parseInt(el.fDia.value, 10);
    if (isRec && !(dia >= 1 && dia <= 31)) return setFormError("O dia precisa estar entre 1 e 31.", el.fDia);
    setFormError(null);
    return {
      ...tipoNatureza(),
      valor,
      motivo,
      local: el.fLocal.value.trim(),
      aplicativo: el.fAplicativo.value.trim(),
      data: el.fData.value,
      dia,
    };
  }

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = readForm();
    if (!d) return;
    const base = { tipo: d.tipo, natureza: d.natureza, motivo: d.motivo, local: d.local, aplicativo: d.aplicativo };

    if (form.mode === "rec-add" || form.mode === "rec-edit") {
      if (!requireNewBackend()) return;
      const rec = { ...base, valor: d.valor, dia: d.dia, ativo: form.mode === "rec-add" ? true : el.fAtivo.checked };
      closeForm();
      if (form.mode === "rec-add") addRecurring({ id: makeId(), inicio: F.todayStr(), fim: "", ...rec });
      else updateRecurring(form.rec.id, rec);
      return;
    }

    if (form.mode === "edit") {
      const id = form.tx.id;
      const payload = { ...base, data: d.data, valor: d.valor };
      const before = { ...form.tx };
      closeForm();
      commit({
        apply: () => replaceTx(id, { ...before, ...payload }),
        revert: () => replaceTx(id, before),
        remote: () => API.updateTransaction(id, payload),
        success: "Lançamento atualizado.",
      });
      addSuggestions(payload);
      return;
    }

    if (form.mode === "confirm") {
      closeForm();
      addTx(txFromRecurring(form.rec, { ...base, data: d.data, valor: d.valor }), `${d.motivo} lançado.`);
      return;
    }

    // novo lançamento
    if (el.fParcelado.checked) {
      const total = parseInt(el.fParcelasTotal.value, 10);
      const inicial = parseInt(el.fParcelaAtual.value, 10) || 1;
      if (!(total >= 2) || inicial < 1 || inicial > total) {
        setFormError("Informe ao menos 2 parcelas e uma parcela inicial dentro do total.", el.fParcelasTotal);
        return;
      }
      const groupId = makeId();
      const now = new Date().toISOString();
      const items = [];
      for (let n = inicial; n <= total; n++) {
        items.push({
          id: makeId(),
          criadoEm: now,
          ...base,
          motivo: `${base.motivo} (${n}/${total})`,
          data: F.addMonths(d.data, n - inicial),
          valor: d.valor,
          parcelaGrupo: groupId,
          parcelaAtual: n,
          parcelaTotal: total,
        });
      }
      closeForm();
      commit({
        apply: () => state.transactions.push(...items),
        revert: () => (state.transactions = state.transactions.filter((t) => !items.includes(t))),
        remote: () => API.addManyTransactions(items),
        success: `${items.length} parcelas registradas.`,
      });
      addSuggestions(base);
      return;
    }

    const tx = { id: makeId(), criadoEm: new Date().toISOString(), ...base, data: d.data, valor: d.valor };
    if (el.fRepetir.checked) {
      if (!requireNewBackend()) return;
      const rec = {
        id: makeId(),
        ...base,
        valor: d.valor,
        dia: Number(d.data.slice(8, 10)),
        ativo: true,
        inicio: d.data,
        fim: "",
      };
      tx.recorrenteId = rec.id;
      closeForm();
      addRecurring(rec, null).then(() => addTx(tx, "Salvo. Ele vai aparecer todo mês para lançar."));
      return;
    }
    closeForm();
    addTx(tx, "Lançamento salvo.");
  });

  function replaceTx(id, next) {
    const idx = state.transactions.findIndex((t) => t.id === id);
    if (idx > -1) state.transactions[idx] = next;
  }

  function addTx(tx, message) {
    addSuggestions(tx);
    return commit({
      apply: () => state.transactions.push(tx),
      revert: () => (state.transactions = state.transactions.filter((t) => t !== tx)),
      remote: () => API.addTransaction(tx),
      success: message,
    });
  }

  function addRecurring(rec, message = "Recorrente criado.") {
    return commit({
      apply: () => state.recorrentes.push(rec),
      revert: () => (state.recorrentes = state.recorrentes.filter((r) => r !== rec)),
      remote: () => API.addRecorrente(rec),
      success: message,
    });
  }

  function updateRecurring(id, patch) {
    const idx = state.recorrentes.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const before = state.recorrentes[idx];
    return commit({
      apply: () => (state.recorrentes[idx] = { ...before, ...patch }),
      revert: () => (state.recorrentes[idx] = before),
      remote: () => API.updateRecorrente(id, patch),
      success: "Recorrente atualizado.",
    });
  }

  el.formDelete.addEventListener("click", () => {
    if (form.mode === "rec-edit") {
      const rec = form.rec;
      if (!confirm(`Excluir o recorrente “${rec.motivo}”? Os lançamentos já feitos continuam.`)) return;
      closeForm();
      commit({
        apply: () => (state.recorrentes = state.recorrentes.filter((r) => r !== rec)),
        revert: () => state.recorrentes.push(rec),
        remote: () => API.deleteRecorrente(rec.id),
        success: "Recorrente excluído.",
      });
      return;
    }
    const tx = form.tx;
    if (!tx || !confirm("Excluir este lançamento? Não dá para desfazer.")) return;
    closeForm();
    commit({
      apply: () => (state.transactions = state.transactions.filter((t) => t !== tx)),
      revert: () => state.transactions.push(tx),
      remote: () => API.deleteTransaction(tx.id),
      success: "Lançamento excluído.",
    });
  });

  function refreshDadosList() {
    el.dadosList.innerHTML = state.dadosList.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
  }

  function addSuggestions(payload) {
    [payload.motivo, payload.aplicativo].forEach((v) => {
      if (v && !state.dadosList.includes(v)) state.dadosList.push(v);
    });
    refreshDadosList();
  }

  // ---------- Carregamento inicial ----------
  async function fetchAll() {
    try {
      return await API.bootstrap();
    } catch (err) {
      // Apps Script ainda na versão antiga: segue funcionando só com lançamentos
      if (!/Ação inválida/.test(err.message)) throw err;
      state.legacyBackend = true;
      const [transactions, dados] = await Promise.all([API.listTransactions(), API.listDados()]);
      return { transactions, dados, config: state.config, recorrentes: state.recorrentes };
    }
  }

  async function init() {
    setMonth(state.month);
    if (!API.isConfigured()) el.setupBanner.hidden = false;

    const hadCache = loadCache();
    if (hadCache) refreshDadosList();
    else el.app.classList.add("is-loading");
    switchTab("inicio");

    if (!API.isConfigured()) {
      el.app.classList.remove("is-loading");
      return;
    }

    setSync("busy");
    try {
      const data = await fetchAll();
      state.transactions = (data.transactions || []).map(normalizeTx);
      state.dadosList = data.dados || [];
      state.config = { ...CONFIG_DEFAULTS, ...(data.config || {}) };
      state.recorrentes = (data.recorrentes || []).map((r) => ({ ...r, valor: Number(r.valor) || 0, dia: Number(r.dia) || 1 }));
      refreshDadosList();
      saveCache();
      setSync("ok");
      if (state.legacyBackend) {
        showToast("Publique a nova versão do Apps Script para usar teto, rendimento e recorrentes.", { error: true });
      }
    } catch (err) {
      setSync("error");
      showToast(
        hadCache ? "Sem conexão. Mostrando os dados salvos neste aparelho." : "Não foi possível carregar: " + err.message,
        { error: true, action: "Tentar de novo", onAction: init },
      );
    } finally {
      el.app.classList.remove("is-loading");
      renderAll();
    }
  }

  init();
})();
