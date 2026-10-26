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
    RENDA_BRUTO: 0,
    RENDA_DIA_PAGTO: 5,
    RENDA_ADIANT_PCT: 0,
    RENDA_ADIANT_DIA: 20,
    RENDA_DEPENDENTES: 0,
    RENDA_DESCONTOS: 0,
    RENDA_AJUSTE: 0,
    RENDA_ADMISSAO: "",
    RENDA_INICIO: "",
    FERIAS: "[]",
    FERIAS_ABONO: false,
    FERIAS_ADIANTA_13: false,
    BENEFICIOS: "[]",
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
    metas: [],
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
    // renda
    rLiquido: $("r-liquido"),
    rNote: $("r-note"),
    rendaForm: $("renda-form"),
    rBruto: $("r-bruto"),
    rDia: $("r-dia"),
    rDescontos: $("r-descontos"),
    rDependentes: $("r-dependentes"),
    rAdiantPct: $("r-adiant-pct"),
    rAdiantDia: $("r-adiant-dia"),
    rAdmissao: $("r-admissao"),
    rPayslip: $("r-payslip"),
    rFerias: $("r-ferias"),
    rFeriasAdd: $("r-ferias-add"),
    rAbono: $("r-abono"),
    rAdianta13: $("r-adianta13"),
    r13: $("r-13"),
    r13Avos: $("r-13-avos"),
    rBeneficios: $("r-beneficios"),
    rBenefAdd: $("r-benef-add"),
    rDirty: $("r-dirty"),
    rCalendar: document.querySelector("#r-calendar tbody"),
    // projeção
    pWarn: $("p-warn"),
    metaAdd: $("meta-add"),
    metaForm: $("meta-form"),
    mNome: $("m-nome"),
    mValor: $("m-valor"),
    mMes: $("m-mes"),
    mError: $("m-error"),
    mDelete: $("m-delete"),
    mCancel: $("m-cancel"),
    metasList: $("metas-list"),
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
  const isRendaId = (id) => String(id || "").startsWith("renda:");
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
          metas: state.metas,
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
      state.metas = parsed.metas || [];
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
    showToast("Publique a nova versão do Apps Script para salvar ajustes, renda, metas e recorrentes.", { error: true });
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
      tx.recorrenteId ? `<span class="tag">${isRendaId(tx.recorrenteId) ? "renda" : "mensal"}</span>` : "",
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
    const pending =
      state.month <= current ? F.pendingRecurring(state.recorrentes, state.transactions, state.month, state.config) : [];
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
            <span class="row__icon" style="--c:var(${cat.color})">${icon(rec.renda ? "i-wallet" : cat.icon)}</span>
            <span class="row__body">
              <span class="row__title"><span>${escapeHtml(rec.motivo || cat.label)}</span></span>
              <span class="row__meta">${rec.tipo === "Entrada" ? "cai" : "vence"} ${formatDateShort(rec.dueDate)}</span>
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

  // ---------- Render: Renda ----------
  let rendaDirty = false;
  const rendaDraft = { ferias: [], beneficios: [] };
  const toBool = (v) => v === true || String(v).toLowerCase() === "true";

  function parseList(v) {
    try {
      const list = typeof v === "string" ? JSON.parse(v || "[]") : v;
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function loadRendaDraft() {
    const c = state.config;
    el.rBruto.value = fmtInput(c.RENDA_BRUTO);
    el.rDia.value = Number(c.RENDA_DIA_PAGTO) || "";
    el.rDescontos.value = fmtInput(c.RENDA_DESCONTOS);
    el.rDependentes.value = Number(c.RENDA_DEPENDENTES) || "";
    el.rAdiantPct.value = Number(c.RENDA_ADIANT_PCT) ? String(c.RENDA_ADIANT_PCT).replace(".", ",") : "";
    el.rAdiantDia.value = Number(c.RENDA_ADIANT_DIA) || "";
    el.rAdmissao.value = F.normalizeDateStr(c.RENDA_ADMISSAO);
    el.rAbono.checked = toBool(c.FERIAS_ABONO);
    el.rAdianta13.checked = toBool(c.FERIAS_ADIANTA_13);
    rendaDraft.ferias = parseList(c.FERIAS).map((p) => ({ inicio: F.normalizeDateStr(p.inicio), dias: Number(p.dias) || 30 }));
    rendaDraft.beneficios = parseList(c.BENEFICIOS).map((b) => ({
      id: b.id || makeId(),
      nome: b.nome || "",
      valor: Number(b.valor) || 0,
      entrada: toBool(b.entrada),
    }));
    renderRendaLists();
  }

  /** Lê o formulário da renda. Campos inválidos ficam marcados e fora do patch. */
  function readRendaForm() {
    const money = (input, max = Infinity) => {
      const raw = input.value.trim();
      if (!raw) return 0;
      const v = parseMoney(raw);
      return Number.isFinite(v) && v >= 0 && v <= max ? v : NaN;
    };
    const int = (input, min, max, fallback) => {
      const raw = input.value.trim();
      if (!raw) return fallback;
      const v = Number(raw);
      return Number.isInteger(v) && v >= min && v <= max ? v : NaN;
    };
    const fields = [
      ["RENDA_BRUTO", el.rBruto, money(el.rBruto)],
      ["RENDA_DIA_PAGTO", el.rDia, int(el.rDia, 1, 31, 5)],
      ["RENDA_DESCONTOS", el.rDescontos, money(el.rDescontos)],
      ["RENDA_DEPENDENTES", el.rDependentes, int(el.rDependentes, 0, 20, 0)],
      ["RENDA_ADIANT_PCT", el.rAdiantPct, money(el.rAdiantPct, 100)],
      ["RENDA_ADIANT_DIA", el.rAdiantDia, int(el.rAdiantDia, 1, 31, 20)],
    ];
    const patch = {};
    let invalid = null;
    fields.forEach(([key, input, v]) => {
      if (Number.isFinite(v)) {
        patch[key] = v;
        input.removeAttribute("aria-invalid");
      } else {
        input.setAttribute("aria-invalid", "true");
        invalid = invalid || input;
      }
    });
    patch.RENDA_ADMISSAO = el.rAdmissao.value || "";
    patch.FERIAS_ABONO = el.rAbono.checked;
    patch.FERIAS_ADIANTA_13 = el.rAdianta13.checked;
    patch.FERIAS = JSON.stringify(rendaDraft.ferias.filter((p) => p.inicio && p.dias > 0));
    patch.BENEFICIOS = JSON.stringify(
      rendaDraft.beneficios
        .filter((b) => b.nome.trim() || b.valor > 0)
        .map((b) => ({ ...b, nome: b.nome.trim() || "Benefício" })),
    );
    return { patch, invalid };
  }

  function renderRendaLists() {
    el.rFerias.innerHTML = rendaDraft.ferias
      .map(
        (p, i) => `
        <li class="period" data-idx="${i}">
          <label class="field"><span>Começa em</span><input type="date" data-f="inicio" value="${escapeHtml(p.inicio)}" /></label>
          <label class="field"><span>Dias</span><input type="number" min="5" max="30" step="1" inputmode="numeric" data-f="dias" value="${p.dias}" /></label>
          <button type="button" class="icon-btn icon-btn--danger" data-remove aria-label="Remover período">${icon("i-trash")}</button>
          <p class="period__info" data-info></p>
        </li>`,
      )
      .join("");
    el.rFeriasAdd.hidden = rendaDraft.ferias.length >= 3;
    el.rBeneficios.innerHTML = rendaDraft.beneficios
      .map(
        (b, i) => `
        <li class="period period--benef" data-idx="${i}">
          <label class="field"><span>Nome</span><input type="text" data-f="nome" value="${escapeHtml(b.nome)}" placeholder="Vale-transporte" autocomplete="off" /></label>
          <label class="field"><span>Valor por mês</span><input type="text" inputmode="decimal" data-f="valor" value="${fmtInput(b.valor)}" placeholder="0,00" autocomplete="off" /></label>
          <button type="button" class="icon-btn icon-btn--danger" data-remove aria-label="Remover benefício">${icon("i-trash")}</button>
          <label class="switch"><input type="checkbox" data-f="entrada" ${b.entrada ? "checked" : ""} /><span class="switch__track" aria-hidden="true"></span><span>Entra na conta</span></label>
        </li>`,
      )
      .join("");
  }

  function nextRendaEvent(cfg) {
    const today = F.todayStr();
    const confirmados = new Set(state.transactions.map((tx) => tx.recorrenteId).filter(Boolean));
    for (let i = 0; i < 3; i++) {
      const ev = F.rendaEventos(cfg, F.addMonthsToMonth(F.currentMonthStr(), i)).find(
        (e) => e.data >= today && !confirmados.has(e.id),
      );
      if (ev) return ev;
    }
    return null;
  }

  function updateRendaPreview() {
    const { patch } = readRendaForm();
    const cfg = { ...state.config, ...patch };
    const rc = F.rendaConfig(cfg);
    const current = F.currentMonthStr();

    if (!(rc.bruto > 0)) {
      el.rLiquido.textContent = currency.format(0);
      el.rNote.textContent = "Informe o salário bruto para calcular o líquido, o 13º e as férias.";
      el.rPayslip.hidden = true;
      el.r13Avos.textContent = "";
      el.r13.innerHTML = `<li class="empty-state">Aparece quando você informar o salário.</li>`;
      el.rCalendar.innerHTML = `<tr><td colspan="5" class="empty-cell">Sem salário cadastrado.</td></tr>`;
      el.rFerias.querySelectorAll("[data-info]").forEach((n) => (n.textContent = ""));
      return;
    }

    // Mês "cheio": sem férias nem admissão no meio
    const cheio = F.salarioCompetencia({ ...rc, ferias: [], admissao: "" }, current);
    el.rLiquido.textContent = currency.format(cheio.liquido + cheio.adiantamento);
    const prox = nextRendaEvent(cfg);
    el.rNote.textContent =
      `Bruto ${currency.format(rc.bruto)}` + (prox ? ` · próximo: ${prox.motivo.toLowerCase()} em ${formatDateShort(prox.data)}` : "");

    const linhas = [
      ["Salário bruto", currency.format(rc.bruto)],
      ["INSS", "− " + currency.format(cheio.inss), "is-minus"],
      ["Imposto de renda", cheio.irrf ? "− " + currency.format(cheio.irrf) : "isento", "is-minus"],
    ];
    if (rc.descontos) linhas.push(["Outros descontos", "− " + currency.format(rc.descontos), "is-minus"]);
    if (rc.ajuste) {
      linhas.push([
        `Ajuste do contracheque<button type="button" class="link-btn" data-zero-ajuste>zerar</button>`,
        (rc.ajuste > 0 ? "+ " : "− ") + currency.format(Math.abs(rc.ajuste)),
      ]);
    }
    if (cheio.adiantamento) {
      linhas.push([`Adiantamento no dia ${rc.adiantDia}`, "− " + currency.format(cheio.adiantamento), "is-minus"]);
    }
    el.rPayslip.hidden = false;
    el.rPayslip.innerHTML =
      linhas.map(([dt, dd, cls = ""]) => `<dt>${dt}</dt><dd class="money ${cls}">${dd}</dd>`).join("") +
      `<dt class="payslip__total">${cheio.adiantamento ? `Líquido no dia ${rc.diaPagto}` : "Líquido"}</dt>` +
      `<dd class="payslip__total money">${currency.format(cheio.liquido)}</dd>`;

    // Férias
    el.rFerias.querySelectorAll(".period").forEach((li) => {
      const p = rendaDraft.ferias[Number(li.dataset.idx)];
      const info = li.querySelector("[data-info]");
      if (!p || !p.inicio) {
        info.textContent = "Escolha a data de início.";
        return;
      }
      const idx = rc.ferias.findIndex((x) => x.inicio === p.inicio);
      const f = F.feriasPeriodo(rc, { inicio: p.inicio, dias: p.dias || 30 }, idx);
      info.innerHTML =
        `Recebe <b class="money">${currency.format(f.liquido)}</b> em ${formatDateShort(f.dataPagto)}` +
        (f.abono ? ` · inclui ${currency.format(f.abono)} do abono` : "") +
        ` · INSS ${currency.format(f.inss)}${f.irrf ? ` · IR ${currency.format(f.irrf)}` : ""}`;
    });

    // 13º (deste ano até 20/dez; depois, do próximo)
    const today = F.todayStr();
    const ano = Number(today.slice(0, 4)) + (today > `${today.slice(0, 4)}-12-20` ? 1 : 0);
    const d13 = F.decimoTerceiro(rc, ano);
    if (!d13) {
      el.r13Avos.textContent = "";
      el.r13.innerHTML = `<li class="empty-state">Sem 13º em ${ano}: a admissão é depois disso.</li>`;
    } else {
      el.r13Avos.textContent = d13.avos === 12 ? `integral · ${ano}` : `${d13.avos}/12 avos · ${ano}`;
      const item = (titulo, meta, valor) => `
        <li>
          <div class="row row--static">
            <span class="row__icon" style="--c:var(--cat-entrada)">${icon("i-wallet")}</span>
            <span class="row__body">
              <span class="row__title"><span>${titulo}</span></span>
              <span class="row__meta">${meta}</span>
            </span>
            <span class="row__right"><span class="row__value money is-positive">+ ${currency.format(valor)}</span></span>
          </div>
        </li>`;
      el.r13.innerHTML =
        item("1ª parcela", `${formatDateShort(d13.primeira.data)} · sem descontos`, d13.primeira.valor) +
        item(
          "2ª parcela",
          `${formatDateShort(d13.segunda.data)} · descontos ${currency.format(d13.inss + d13.irrf)}`,
          d13.segunda.valor,
        );
    }

    // Calendário de recebimentos
    const fmt = (v) => (v ? numberFmt.format(v) : "—");
    const cal = [];
    for (let i = 0; i < 12; i++) {
      const m = F.addMonthsToMonth(current, i);
      const evs = F.rendaEventos(cfg, m);
      const soma = (kinds) => evs.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.valor, 0);
      const sal = soma(["salario", "adiantamento"]);
      const extra = soma(["13", "ferias"]);
      const ben = soma(["beneficio"]);
      cal.push(`
        <tr class="${extra ? "is-extra" : ""}">
          <td>${monthLabel(m, true)}${m.slice(5) === "01" || i === 0 ? ` ${m.slice(2, 4)}` : ""}</td>
          <td>${fmt(sal)}</td>
          <td>${fmt(extra)}</td>
          <td>${fmt(ben)}</td>
          <td class="is-strong">${fmt(sal + extra + ben)}</td>
        </tr>`);
    }
    el.rCalendar.innerHTML = cal.join("");
  }

  function renderRenda() {
    if (!rendaDirty) loadRendaDraft();
    updateRendaPreview();
  }

  function markRendaDirty() {
    rendaDirty = true;
    el.rDirty.hidden = false;
    updateRendaPreview();
  }

  function syncDraftFrom(target, list) {
    const li = target.closest(".period");
    if (!li || !target.dataset.f) return;
    const item = list[Number(li.dataset.idx)];
    if (!item) return;
    const f = target.dataset.f;
    if (target.type === "checkbox") item[f] = target.checked;
    else if (f === "dias") item[f] = parseInt(target.value, 10) || 0;
    else if (f === "valor") item[f] = parseMoney(target.value) || 0;
    else item[f] = target.value;
  }

  el.rendaForm.addEventListener("input", (e) => {
    if (el.rFerias.contains(e.target)) syncDraftFrom(e.target, rendaDraft.ferias);
    if (el.rBeneficios.contains(e.target)) syncDraftFrom(e.target, rendaDraft.beneficios);
    markRendaDirty();
  });
  el.rendaForm.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove]");
    if (remove) {
      const li = remove.closest(".period");
      const list = el.rFerias.contains(li) ? rendaDraft.ferias : rendaDraft.beneficios;
      list.splice(Number(li.dataset.idx), 1);
      renderRendaLists();
      markRendaDirty();
      return;
    }
    if (e.target.closest("[data-zero-ajuste]")) {
      if (!requireNewBackend()) return;
      saveConfig({ RENDA_AJUSTE: 0 }, "Ajuste zerado.");
    }
  });
  el.rFeriasAdd.addEventListener("click", () => {
    rendaDraft.ferias.push({ inicio: F.addMonths(F.todayStr().slice(0, 8) + "01", 1), dias: el.rAbono.checked ? 20 : 30 });
    renderRendaLists();
    markRendaDirty();
    el.rFerias.querySelector(".period:last-child input").focus();
  });
  el.rBenefAdd.addEventListener("click", () => {
    rendaDraft.beneficios.push({ id: makeId(), nome: "", valor: 0, entrada: false });
    renderRendaLists();
    markRendaDirty();
    el.rBeneficios.querySelector(".period:last-child input").focus();
  });

  el.rendaForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { patch, invalid } = readRendaForm();
    if (invalid) {
      invalid.focus();
      showToast("Confira os campos marcados.", { error: true });
      return;
    }
    if (!requireNewBackend()) return;
    const ativando = !(Number(state.config.RENDA_BRUTO) > 0) && patch.RENDA_BRUTO > 0;
    if (ativando && !state.config.RENDA_INICIO) {
      // se o salário deste mês já foi lançado à mão, a renda começa no mês que vem
      const current = F.currentMonthStr();
      const jaLancado = state.transactions.some(
        (tx) => F.isEntrada(tx) && tx.data.startsWith(current) && /sal[aá]rio/i.test(tx.motivo || ""),
      );
      patch.RENDA_INICIO = jaLancado ? F.addMonthsToMonth(current, 1) : current;
    }
    rendaDirty = false;
    el.rDirty.hidden = true;
    saveConfig(patch, "Renda salva.");
    if (ativando) {
      const salRecs = state.recorrentes.filter((r) => r.ativo && r.tipo === "Entrada" && /sal[aá]rio/i.test(r.motivo || ""));
      if (salRecs.length) {
        showToast(`Pausar o recorrente “${salRecs[0].motivo}”? A renda já lança o salário todo mês.`, {
          action: "Pausar",
          onAction: () => salRecs.forEach((r) => updateRecurring(r.id, { ativo: false })),
        });
      }
    }
  });

  // ---------- Render: Projeção ----------
  function renderProjecao() {
    const meses = F.projectionHorizon(state.metas);
    const proj = F.projection(state, meses);
    const rows = proj.rows;
    const last = rows[rows.length - 1];
    const totalRende = rows.reduce((s, r) => s + r.rendimento, 0);
    el.pLabel.textContent = `Patrimônio projetado em ${monthLabel(last.month).toLowerCase()}`;
    el.pFinal.textContent = currency.format(last.patrimonio);
    el.pFinal.classList.toggle("is-negative", last.patrimonio < 0);
    el.pNote.textContent = `Hoje ${currency.format(proj.patrimonioHoje)} · ${currency.format(totalRende)} de rendimento no caminho`;

    const teto = Number(state.config.TETO_MENSAL) || 0;
    if (teto > 0 && proj.ritmoAtual > teto * 1.02) {
      const noRitmo = F.projection({ ...state, config: { ...state.config, TETO_MENSAL: proj.ritmoAtual } }, meses).rows;
      el.pWarn.hidden = false;
      el.pWarn.textContent =
        `Nos últimos 3 meses você gastou em média ${currency.format(proj.ritmoAtual)}, acima do teto de ${currency.format(teto)}. ` +
        `A projeção supõe que você vai seguir o teto; no ritmo atual, chegaria a ${monthLabel(last.month, true)} com ${currency.format(noRitmo[noRitmo.length - 1].patrimonio)}.`;
    } else if (!teto) {
      el.pWarn.hidden = false;
      el.pWarn.textContent = "Sem teto definido, a projeção usa a média dos seus gastos. Defina um teto em Ajustes para projetar pelo seu plano.";
    } else {
      el.pWarn.hidden = true;
    }

    renderMetas(proj);
    el.pChart.innerHTML = chartSvg(rows, proj.patrimonioHoje);

    const n0 = (v) => intFmt.format(Math.round(v));
    el.pTable.innerHTML = rows
      .map((r) => {
        const extras = r.eventos.filter((e) => e.kind === "13" || e.kind === "ferias").length;
        return `
        <tr class="${extras ? "is-extra" : ""}">
          <td>${monthLabel(r.month, true)}${r.parcial ? " (resto)" : r.month.endsWith("-01") ? ` ${r.month.slice(2, 4)}` : ""}</td>
          <td>${n0(r.entradas)}</td>
          <td>${r.fixos ? n0(r.fixos) : "—"}</td>
          <td>${r.parcelas ? n0(r.parcelas) : "—"}</td>
          <td>${n0(r.variaveis)}</td>
          <td class="${r.sobra < 0 ? "is-negative" : "is-positive"}">${r.sobra < 0 ? "−" : ""}${n0(Math.abs(r.sobra))}</td>
          <td>${n0(r.rendimento)}</td>
          <td class="is-strong">${n0(r.patrimonio)}</td>
        </tr>`;
      })
      .join("");

    const recIn = state.recorrentes.filter((r) => r.ativo && r.tipo === "Entrada");
    const recOut = state.recorrentes.filter((r) => r.ativo && F.SAIDA_TIPOS.includes(r.tipo));
    const comRenda = F.rendaAtiva(state.config);
    const entradas = comRenda
      ? `Entradas: salário líquido calculado na aba Renda, com 13º, férias e benefícios que entram na conta${recIn.length ? `, mais ${recIn.length} recorrente${recIn.length > 1 ? "s" : ""} de entrada` : ""}.`
      : recIn.length
        ? `Entradas: ${recIn.length === 1 ? "o recorrente de entrada cadastrado" : `os ${recIn.length} recorrentes de entrada cadastrados`}. Cadastre o salário na aba Renda para incluir 13º e férias.`
        : "Entradas: média dos últimos 3 meses. Cadastre o salário na aba Renda para ficar exato.";
    el.pAssumptions.innerHTML = [
      entradas,
      teto
        ? `Saídas: o seu teto de ${currency.format(teto)} por mês, como se você seguisse o plano. Se fixos e parcelas passarem dele, vale o valor maior.`
        : `Saídas: ${recOut.length ? "recorrentes de saída" : "média dos fixos"} + média de débito e crédito dos últimos 3 meses.`,
      "Parcelas já lançadas entram com o valor exato de cada mês.",
      `O mês atual conta só o que ainda falta entrar e sair até o fim do mês.`,
      `A sobra de cada mês vai para o caixa, que rende ${rateDescription()}. Patrimônio = conta + caixa.`,
      "Rendimento bruto, sem IR, IOF nem feriados. Meses com 13º ou férias aparecem destacados na tabela.",
    ]
      .map((s) => `<li>${s}</li>`)
      .join("");
  }

  // ---------- Metas ----------
  function renderMetas(proj) {
    const metas = [...state.metas].sort((a, b) => (a.mes < b.mes ? -1 : 1));
    if (!metas.length) {
      el.metasList.innerHTML = el.metaForm.hidden
        ? `<li class="empty-state">Diga quanto quer ter e em que mês. O app mostra se você chega lá e quanto guardar por mês.</li>`
        : "";
      return;
    }
    const last = proj.rows[proj.rows.length - 1];
    el.metasList.innerHTML = metas
      .map((meta) => {
        const st = F.metaStatus(meta, proj, state.config);
        let status;
        let ok = false;
        if (st.passada) {
          status = `${icon("i-flag")}<span>O prazo passou. Hoje você tem <b>${currency.format(st.projetado)}</b>.</span>`;
        } else if (st.foraDoHorizonte) {
          status = `${icon("i-flag")}<span>A projeção vai até ${monthLabel(last.month, true)}/${last.month.slice(2, 4)}. Escolha um mês até lá.</span>`;
        } else if (st.atingida) {
          ok = true;
          status = `${icon("i-check")}<span>No caminho: sobram <b>${currency.format(-st.falta)}</b> além da meta.</span>`;
        } else {
          status =
            `${icon("i-flag")}<span>Faltam <b>${currency.format(st.falta)}</b>. Guarde mais <b>${currency.format(st.porMes)}</b> por mês até lá` +
            (st.tetoSugerido !== null ? `, ou baixe o teto para <b>${currency.format(st.tetoSugerido)}</b>.` : ".") +
            `</span>`;
        }
        const pct = Number.isFinite(st.projetado) && st.valor > 0 ? Math.max(0, Math.min(1, st.projetado / st.valor)) : 0;
        return `
        <li>
          <button type="button" class="meta" data-meta="${escapeHtml(meta.id)}">
            <span class="meta__top">
              <span class="meta__name">${escapeHtml(meta.nome || "Meta")}</span>
              <span class="meta__when">${monthLabel(meta.mes).toLowerCase()}</span>
            </span>
            <span class="meta__nums">${
              Number.isFinite(st.projetado)
                ? `<b class="money">${currency.format(st.projetado)}</b> previstos de ${currency.format(st.valor)}`
                : `Meta de ${currency.format(st.valor)}`
            }</span>
            <span class="meter ${ok ? "is-ok" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" aria-label="Progresso previsto">
              <span class="meter__fill" style="width:${pct * 100}%"></span>
            </span>
            <span class="meta__status ${ok ? "is-ok" : ""}">${status}</span>
          </button>
        </li>`;
      })
      .join("");
    el.metasList.querySelectorAll("[data-meta]").forEach((btn) =>
      btn.addEventListener("click", () => openMetaForm(state.metas.find((m) => m.id === btn.dataset.meta))),
    );
  }

  let metaEditing = null;
  function openMetaForm(meta) {
    metaEditing = meta || null;
    el.metaForm.hidden = false;
    el.mError.hidden = true;
    el.mNome.value = meta ? meta.nome : "";
    el.mValor.value = meta ? fmtInput(meta.valor) : "";
    el.mMes.value = meta ? meta.mes : F.addMonthsToMonth(F.currentMonthStr(), 6);
    el.mMes.min = F.currentMonthStr();
    el.mDelete.hidden = !meta;
    [el.mValor, el.mMes].forEach((i) => i.removeAttribute("aria-invalid"));
    el.metaAdd.hidden = true;
    (meta ? el.mValor : el.mNome).focus();
  }

  function closeMetaForm() {
    el.metaForm.hidden = true;
    el.metaAdd.hidden = false;
    metaEditing = null;
    renderProjecao();
  }

  function metaError(msg, input) {
    el.mError.hidden = false;
    el.mError.textContent = msg;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }

  el.metaAdd.addEventListener("click", () => {
    openMetaForm(null);
    renderProjecao();
  });
  el.mCancel.addEventListener("click", closeMetaForm);
  el.metaForm.addEventListener("submit", (e) => {
    e.preventDefault();
    [el.mValor, el.mMes].forEach((i) => i.removeAttribute("aria-invalid"));
    const valor = parseMoney(el.mValor.value);
    if (!(valor > 0)) return metaError("Informe quanto quer ter.", el.mValor);
    const mes = el.mMes.value;
    if (!/^\d{4}-\d{2}$/.test(mes)) return metaError("Escolha o mês.", el.mMes);
    if (mes < F.currentMonthStr()) return metaError("Escolha este mês ou um mês futuro.", el.mMes);
    if (!requireNewBackend()) return;
    const data = { nome: el.mNome.value.trim() || "Meta", valor, mes };
    const editing = metaEditing;
    el.metaForm.hidden = true;
    el.metaAdd.hidden = false;
    metaEditing = null;
    if (editing) {
      const idx = state.metas.findIndex((m) => m.id === editing.id);
      commit({
        apply: () => (state.metas[idx] = { ...editing, ...data }),
        revert: () => (state.metas[idx] = editing),
        remote: () => API.updateMeta(editing.id, data),
        success: "Meta atualizada.",
      });
    } else {
      const meta = { id: makeId(), ...data };
      commit({
        apply: () => state.metas.push(meta),
        revert: () => (state.metas = state.metas.filter((m) => m !== meta)),
        remote: () => API.addMeta(meta),
        success: "Meta criada.",
      });
    }
  });
  el.mDelete.addEventListener("click", () => {
    const meta = metaEditing;
    if (!meta || !confirm(`Excluir a meta “${meta.nome}”?`)) return;
    if (!requireNewBackend()) return;
    el.metaForm.hidden = true;
    el.metaAdd.hidden = false;
    metaEditing = null;
    commit({
      apply: () => (state.metas = state.metas.filter((m) => m !== meta)),
      revert: () => state.metas.push(meta),
      remote: () => API.deleteMeta(meta.id),
      success: "Meta excluída.",
    });
  });

  function chartSvg(rows, patrimonioHoje) {
    const W = Math.max(300, Math.round(el.pChart.clientWidth || 640));
    const H = W < 480 ? 232 : 272;
    const padL = 8;
    const padR = 8;
    const barTop = H * 0.46;
    const barBottom = H - 44;
    const lineTop = 24;
    const lineBottom = 96;
    const colW = (W - padL - padR) / rows.length;
    const metas = state.metas.filter((m) => rows.some((r) => r.month === m.mes));
    const maxFlow = Math.max(1, ...rows.map((r) => Math.max(r.entradas, r.saidas)));
    const valores = [patrimonioHoje, ...rows.map((r) => r.patrimonio), ...metas.map((m) => m.valor)];
    const minC = Math.min(...valores);
    const maxC = Math.max(...valores);
    const spanC = maxC - minC || 1;
    const yLine = (v) => lineBottom - ((v - minC) / spanC) * (lineBottom - lineTop);
    const barH = (v) => (v / maxFlow) * (barBottom - barTop);
    const bw = Math.max(2, Math.min(22, colW * 0.28));
    const labelEvery = Math.ceil(rows.length / Math.max(4, Math.floor((W - padL - padR) / 46)));
    const cxOf = (i) => padL + colW * i + colW / 2;

    let bars = "";
    let labels = "";
    const pts = [];
    rows.forEach((r, i) => {
      const cx = cxOf(i);
      const hIn = barH(r.entradas);
      const hOut = barH(r.saidas);
      bars += `<rect class="bar-in" x="${cx - bw - 1}" y="${barBottom - hIn}" width="${bw}" height="${Math.max(hIn, 1)}" rx="${Math.min(3, bw / 2)}"><title>${monthLabel(r.month, true)} · entradas ${currency.format(r.entradas)}</title></rect>`;
      bars += `<rect class="bar-out" x="${cx + 1}" y="${barBottom - hOut}" width="${bw}" height="${Math.max(hOut, 1)}" rx="${Math.min(3, bw / 2)}"><title>${monthLabel(r.month, true)} · saídas ${currency.format(r.saidas)}</title></rect>`;
      if (i % labelEvery === 0) {
        labels += `<text x="${cx}" y="${H - 24}" text-anchor="middle">${monthLabel(r.month, true)}</text>`;
      }
      const kinds = new Set(r.eventos.map((e) => e.kind));
      const ev = [kinds.has("13") ? "13º" : "", kinds.has("ferias") ? "férias" : ""].filter(Boolean);
      if (ev.length) {
        labels +=
          colW >= 28
            ? `<text class="ev-label" x="${cx}" y="${H - 8}" text-anchor="middle">${colW >= 48 ? ev.join("+") : ev.map((t) => t.slice(0, 3)).join("+")}</text>`
            : `<circle class="dot" cx="${cx}" cy="${H - 11}" r="3"><title>${ev.join(" e ")}</title></circle>`;
      }
      pts.push([cx, yLine(r.patrimonio), r.patrimonio]);
    });
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const dots = pts
      .map(
        (p, i) =>
          `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="${rows.length > 12 ? 2.5 : 4}"><title>Patrimônio ${currency.format(p[2])}</title></circle>` +
          (i === 0 || i === pts.length - 1
            ? `<text class="dot-label" x="${p[0] + (i === 0 ? -4 : 0)}" y="${i === 0 ? p[1] + 20 : p[1] - 10}" text-anchor="${i === 0 ? "start" : "end"}">${compactFmt.format(p[2])}</text>`
            : ""),
      )
      .join("");
    const goals = metas
      .map((m) => {
        const i = rows.findIndex((r) => r.month === m.mes);
        const cx = cxOf(i);
        const y = yLine(m.valor);
        return `<line class="goal" x1="${cx}" x2="${cx}" y1="${y}" y2="${barBottom}" /><circle class="dot" cx="${cx}" cy="${y}" r="5" style="stroke:var(--text-secondary)"><title>${escapeHtml(m.nome)}: ${currency.format(m.valor)}</title></circle>`;
      })
      .join("");
    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projeção de entradas, saídas e patrimônio nos próximos ${rows.length} meses">
        <line class="grid" x1="${padL}" x2="${W - padR}" y1="${barBottom + 0.5}" y2="${barBottom + 0.5}" />
        <line class="grid" x1="${padL}" x2="${W - padR}" y1="${barTop - 6}" y2="${barTop - 6}" stroke-dasharray="2 4" />
        ${bars}
        ${goals}
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
    el.fabAdd.hidden = tab === "ajustes" || tab === "renda";
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
    renda: renderRenda,
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
      confirm: rec && rec.renda ? "Confirmar recebimento" : "Lançar recorrente",
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
        el.parcelaBadgeText.textContent = isRendaId(tx.recorrenteId) ? "Pagamento da renda" : "Lançamento de um recorrente";
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
      const rec = form.rec;
      closeForm();
      addTx(txFromRecurring(rec, { ...base, data: d.data, valor: d.valor }), `${d.motivo} lançado.`);
      const diff = Math.round((d.valor - rec.valor) * 100) / 100;
      if (rec.renda === "salario" && diff !== 0 && !state.legacyBackend) {
        const ajuste = (Number(state.config.RENDA_AJUSTE) || 0) + diff;
        showToast(`Veio ${currency.format(Math.abs(diff))} ${diff > 0 ? "a mais" : "a menos"} que o calculado.`, {
          action: "Usar nos próximos",
          onAction: () => saveConfig({ RENDA_AJUSTE: Math.round(ajuste * 100) / 100 }, "Ajuste salvo. Os próximos salários já vêm corrigidos."),
        });
      }
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
      return { transactions, dados, config: state.config, recorrentes: state.recorrentes, metas: state.metas };
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
      state.metas = (data.metas || []).map((m) => ({ ...m, valor: Number(m.valor) || 0, mes: String(m.mes || "").slice(0, 7) }));
      refreshDadosList();
      saveCache();
      setSync("ok");
      if (state.legacyBackend) {
        showToast("Publique a nova versão do Apps Script para usar teto, renda, metas e recorrentes.", { error: true });
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
