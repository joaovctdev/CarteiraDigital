/**
 * Carteira Digital — cálculos financeiros (funções puras, sem DOM).
 *
 * Modelo:
 * - Entrada            → dinheiro que chegou (salário, pix recebido…).
 * - Fixo/Debito/Credito → dinheiro que saiu (gasto).
 * - Caixa              → TRANSFERÊNCIA entre a conta e o caixa (Mercado Pago).
 *                        natureza "Entrada" = guardei, "Saida" = resgatei.
 *                        Não é renda nem gasto: só muda onde o dinheiro está.
 *
 * Datas são sempre strings "YYYY-MM-DD"; meses, "YYYY-MM".
 */
(function (root) {
  "use strict";

  const SAIDA_TIPOS = ["Fixo", "Debito", "Credito"];

  // ---------- Datas ----------
  const pad = (n) => String(n).padStart(2, "0");

  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function currentMonthStr() {
    return todayStr().slice(0, 7);
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
    if (!dataStr) return "";
    const parts = parseDateParts(dataStr);
    if (!parts) return String(dataStr);
    const [y, m, d] = parts;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function fromDateStr(dataStr) {
    const [y, m, d] = parseDateParts(dataStr) || [1970, 1, 1];
    return new Date(y, m - 1, d);
  }

  /** Soma N meses a uma data "YYYY-MM-DD", preservando o dia (ajustando se o mês destino for mais curto). */
  function addMonths(dataStr, months) {
    const [y, m, d] = parseDateParts(dataStr) || [];
    const base = new Date(y, (m || 1) - 1 + months, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(d || 1, lastDay));
    return toDateStr(base);
  }

  function addMonthsToMonth(monthStr, months) {
    return addMonths(`${monthStr}-01`, months).slice(0, 7);
  }

  function daysInMonth(monthStr) {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  function monthStart(monthStr) {
    return `${monthStr}-01`;
  }

  function monthEnd(monthStr) {
    return `${monthStr}-${pad(daysInMonth(monthStr))}`;
  }

  /** Data do dia `dia` no mês (ajusta para o último dia em meses curtos). */
  function dayInMonth(monthStr, dia) {
    return `${monthStr}-${pad(Math.min(Math.max(1, dia || 1), daysInMonth(monthStr)))}`;
  }

  function calendarDays(fromStr, toStr) {
    return Math.round((fromDateStr(toStr) - fromDateStr(fromStr)) / 86400000);
  }

  /** Dias úteis (seg–sex) em (from, to]. Feriados são ignorados — é uma estimativa. */
  function businessDays(fromStr, toStr) {
    const total = calendarDays(fromStr, toStr);
    if (total <= 0) return 0;
    const startDow = fromDateStr(fromStr).getDay();
    const weeks = Math.floor(total / 7);
    let count = weeks * 5;
    for (let i = 1; i <= total % 7; i++) {
      const dow = (startDow + i) % 7;
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  }

  // ---------- Classificação ----------
  const valorAbs = (tx) => Math.abs(Number(tx.valor) || 0);
  const isEntrada = (tx) => tx.tipo === "Entrada";
  const isSaida = (tx) => SAIDA_TIPOS.includes(tx.tipo);
  const isGuardar = (tx) => tx.tipo === "Caixa" && tx.natureza !== "Saida";
  const isResgatar = (tx) => tx.tipo === "Caixa" && tx.natureza === "Saida";
  const inMonth = (tx, monthStr) => typeof tx.data === "string" && tx.data.startsWith(monthStr);

  function sum(list, fn = valorAbs) {
    return list.reduce((s, x) => s + fn(x), 0);
  }

  /** Totais de um mês (ou de uma lista já filtrada). */
  function monthTotals(txs, monthStr) {
    const list = monthStr ? txs.filter((tx) => inMonth(tx, monthStr)) : txs;
    const entradas = sum(list.filter(isEntrada));
    const saidas = sum(list.filter(isSaida));
    const guardado = sum(list.filter(isGuardar));
    const resgatado = sum(list.filter(isResgatar));
    const porTipo = {};
    SAIDA_TIPOS.forEach((t) => (porTipo[t] = sum(list.filter((tx) => tx.tipo === t))));
    return {
      entradas,
      saidas,
      guardado,
      resgatado,
      porTipo,
      resultado: entradas - saidas, // quanto sobrou (ou faltou) do que entrou
      ficouNaConta: entradas - saidas - guardado + resgatado,
    };
  }

  // ---------- Rendimento do caixa (CDB % do CDI) ----------
  function dailyRate(config) {
    const cdi = (Number(config.CDI_ANUAL) || 0) / 100;
    const pct = (Number(config.PCT_CDI) || 0) / 100;
    return (Math.pow(1 + cdi, 1 / 252) - 1) * pct;
  }

  function annualRate(config) {
    return Math.pow(1 + dailyRate(config), 252) - 1;
  }

  /** Alíquota regressiva de IR sobre o rendimento, pelo prazo em dias corridos. */
  function irRate(days) {
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.2;
    if (days <= 720) return 0.175;
    return 0.15;
  }

  /**
   * Simula o caixa até a data `ate`, aporte a aporte (FIFO nos resgates).
   * O saldo inicial informado em Config vale na CAIXA_DATA_INICIAL; movimentos
   * de Caixa até essa data já estão "dentro" dele e são ignorados.
   */
  function caixaPosition(txs, config, ate = todayStr()) {
    const r = dailyRate(config);
    const inicioData = normalizeDateStr(config.CAIXA_DATA_INICIAL);
    const lots = [];
    const saldoInicial = Number(config.CAIXA_SALDO_INICIAL) || 0;
    if (saldoInicial > 0 && inicioData && inicioData <= ate) {
      lots.push({ date: inicioData, principal: saldoInicial });
    }

    const valueAt = (lot, date) => lot.principal * Math.pow(1 + r, businessDays(lot.date, date));

    const moves = txs
      .filter((tx) => tx.tipo === "Caixa" && tx.data <= ate && (!inicioData || tx.data > inicioData))
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

    moves.forEach((tx) => {
      if (isGuardar(tx)) {
        lots.push({ date: tx.data, principal: valorAbs(tx) });
        return;
      }
      let resto = valorAbs(tx);
      while (resto > 0.000001 && lots.length) {
        const lot = lots[0];
        const v = valueAt(lot, tx.data);
        if (v <= resto + 0.000001) {
          resto -= v;
          lots.shift();
        } else {
          lot.principal *= 1 - resto / v;
          resto = 0;
        }
      }
    });

    let bruto = 0;
    let principal = 0;
    let ir = 0;
    lots.forEach((lot) => {
      const v = valueAt(lot, ate);
      bruto += v;
      principal += lot.principal;
      ir += (v - lot.principal) * irRate(calendarDays(lot.date, ate));
    });
    return {
      bruto,
      principal,
      rendimentoBruto: bruto - principal,
      ir,
      liquido: bruto - ir,
    };
  }

  /** Rendimento bruto gerado dentro de um mês (até hoje, se for o mês atual). */
  function caixaMonthYield(txs, config, monthStr) {
    const today = todayStr();
    const fim = monthEnd(monthStr) < today ? monthEnd(monthStr) : today;
    const inicio = toDateStr(new Date(fromDateStr(monthStart(monthStr)) - 86400000));
    if (fim < monthStart(monthStr)) return 0;
    const antes = caixaPosition(txs, config, inicio).bruto;
    const depois = caixaPosition(txs, config, fim).bruto;
    const inicioData = normalizeDateStr(config.CAIXA_DATA_INICIAL);
    const fluxo = txs
      .filter((tx) => tx.tipo === "Caixa" && tx.data > inicio && tx.data <= fim && (!inicioData || tx.data > inicioData))
      .reduce((s, tx) => s + (isGuardar(tx) ? 1 : -1) * valorAbs(tx), 0);
    const saldoInicialNoMes =
      inicioData && inicioData > inicio && inicioData <= fim ? Number(config.CAIXA_SALDO_INICIAL) || 0 : 0;
    return Math.max(0, depois - antes - fluxo - saldoInicialNoMes);
  }

  // ---------- Saldos ----------
  /** Saldo da conta: tudo que entrou − saiu − foi guardado + foi resgatado, até hoje. */
  function contaBalance(txs, ate = todayStr()) {
    return monthTotals(txs.filter((tx) => tx.data <= ate)).ficouNaConta;
  }

  // ---------- Recorrentes ----------
  function recorrenteValidoNoMes(rec, monthStr) {
    if (!rec.ativo) return false;
    if (rec.inicio && normalizeDateStr(rec.inicio).slice(0, 7) > monthStr) return false;
    if (rec.fim && normalizeDateStr(rec.fim).slice(0, 7) < monthStr) return false;
    return true;
  }

  /** Recorrentes que valem no mês e ainda não foram lançados nele. */
  function pendingRecurring(recorrentes, txs, monthStr) {
    const lancados = new Set(
      txs.filter((tx) => tx.recorrenteId && inMonth(tx, monthStr)).map((tx) => tx.recorrenteId),
    );
    return recorrentes
      .filter((rec) => recorrenteValidoNoMes(rec, monthStr) && !lancados.has(rec.id))
      .map((rec) => ({ ...rec, dueDate: dayInMonth(monthStr, rec.dia) }))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }

  // ---------- Teto mensal ----------
  function budget(txs, recorrentes, config, monthStr, today = todayStr()) {
    const teto = Number(config.TETO_MENSAL) || 0;
    const gasto = sum(txs.filter((tx) => isSaida(tx) && inMonth(tx, monthStr)));
    const comprometido = sum(
      pendingRecurring(recorrentes, txs, monthStr).filter((rec) => SAIDA_TIPOS.includes(rec.tipo)),
    );
    const usado = gasto + comprometido;
    const restante = teto - usado;
    let diasRestantes = daysInMonth(monthStr);
    if (today.startsWith(monthStr)) diasRestantes = daysInMonth(monthStr) - Number(today.slice(8, 10)) + 1;
    else if (monthStr < today.slice(0, 7)) diasRestantes = 0;
    return {
      teto,
      gasto,
      comprometido,
      usado,
      restante,
      diasRestantes,
      porDia: diasRestantes > 0 ? Math.max(0, restante) / diasRestantes : 0,
      pct: teto > 0 ? usado / teto : 0,
    };
  }

  // ---------- Projeção ----------
  /** Média mensal de `fn` nos últimos `n` meses fechados que tiveram algum lançamento. */
  function trailingAverage(txs, fromMonth, n, fn) {
    const values = [];
    for (let i = 1; i <= n; i++) {
      const m = addMonthsToMonth(fromMonth, -i);
      const list = txs.filter((tx) => inMonth(tx, m));
      if (list.length) values.push(fn(list));
    }
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  /**
   * Projeta os próximos `meses` meses a partir do mês atual.
   * - Entradas: recorrentes de entrada (se houver) ou média dos últimos 3 meses.
   * - Fixos: recorrentes de saída (se houver) ou média dos fixos dos últimos 3 meses.
   * - Parcelas já lançadas em meses futuros entram com o valor exato.
   * - Variáveis (débito/crédito avulsos): média de 3 meses, limitada pelo teto.
   * - A sobra de cada mês vai para o caixa, que rende % do CDI.
   */
  function projection({ transactions: txs, recorrentes = [], config }, meses = 6, today = todayStr()) {
    const atual = today.slice(0, 7);
    const r = dailyRate(config);
    const teto = Number(config.TETO_MENSAL) || 0;

    const recEntradas = recorrentes.filter((rec) => rec.ativo && rec.tipo === "Entrada");
    const recSaidas = recorrentes.filter((rec) => rec.ativo && SAIDA_TIPOS.includes(rec.tipo));

    const avulso = (tx) => !tx.parcelaGrupo && !tx.recorrenteId;
    const mediaEntradas = trailingAverage(txs, atual, 3, (l) => sum(l.filter(isEntrada)));
    const mediaFixos = trailingAverage(txs, atual, 3, (l) => sum(l.filter((tx) => tx.tipo === "Fixo" && avulso(tx))));
    const mediaVariaveis = trailingAverage(txs, atual, 3, (l) =>
      sum(l.filter((tx) => (tx.tipo === "Debito" || tx.tipo === "Credito") && avulso(tx))),
    );

    let caixa = caixaPosition(txs, config, today).bruto;
    const rows = [];
    for (let i = 1; i <= meses; i++) {
      const m = addMonthsToMonth(atual, i);
      const lancados = txs.filter((tx) => inMonth(tx, m));
      const jaTem = new Set(lancados.map((tx) => tx.recorrenteId).filter(Boolean));
      const validos = (list) => list.filter((rec) => recorrenteValidoNoMes(rec, m) && !jaTem.has(rec.id));

      const entradasLancadas = sum(lancados.filter(isEntrada));
      const entradas = recEntradas.length
        ? entradasLancadas + sum(validos(recEntradas))
        : Math.max(entradasLancadas, mediaEntradas);

      const parcelas = sum(lancados.filter((tx) => isSaida(tx) && tx.parcelaGrupo));
      const fixosLancados = sum(lancados.filter((tx) => isSaida(tx) && !tx.parcelaGrupo && tx.tipo === "Fixo"));
      const fixos = recSaidas.length
        ? fixosLancados + sum(validos(recSaidas))
        : Math.max(fixosLancados, mediaFixos);
      const outrosLancados = sum(lancados.filter((tx) => isSaida(tx) && !tx.parcelaGrupo && tx.tipo !== "Fixo"));
      let variaveis = Math.max(outrosLancados, mediaVariaveis);
      if (teto > 0) variaveis = Math.min(variaveis, Math.max(outrosLancados, teto - fixos - parcelas));

      const saidas = fixos + parcelas + variaveis;
      const sobra = entradas - saidas;
      const fator = Math.pow(1 + r, businessDays(monthEnd(addMonthsToMonth(m, -1)), monthEnd(m)));
      const rendimento = caixa * (fator - 1);
      caixa = Math.max(0, caixa + rendimento + sobra);

      rows.push({ month: m, entradas, fixos, parcelas, variaveis, saidas, sobra, rendimento, caixa });
    }
    return rows;
  }

  const Finance = {
    SAIDA_TIPOS,
    todayStr,
    currentMonthStr,
    parseDateParts,
    normalizeDateStr,
    addMonths,
    addMonthsToMonth,
    daysInMonth,
    dayInMonth,
    businessDays,
    calendarDays,
    isEntrada,
    isSaida,
    isGuardar,
    isResgatar,
    monthTotals,
    dailyRate,
    annualRate,
    irRate,
    caixaPosition,
    caixaMonthYield,
    contaBalance,
    pendingRecurring,
    budget,
    projection,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Finance;
  else root.Finance = Finance;
})(typeof self !== "undefined" ? self : this);
