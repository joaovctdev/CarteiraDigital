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

  // ---------- Renda CLT (salário, 13º, férias) ----------
  /**
   * Tabelas de 2026.
   * INSS: Portaria Interministerial MPS/MF nº 13/2026 (progressiva, teto R$ 8.475,55).
   * IRRF: tabela mensal (inalterada desde mai/2025) + redutor da Lei 15.270/2025,
   * que zera o imposto até R$ 5.000 e reduz linearmente até R$ 7.350.
   */
  const TABELAS_2026 = {
    inss: [
      [1621.0, 0.075],
      [2902.84, 0.09],
      [4354.27, 0.12],
      [8475.55, 0.14],
    ],
    irrf: [
      [2428.8, 0, 0],
      [2826.65, 0.075, 182.16],
      [3751.05, 0.15, 394.16],
      [4664.68, 0.225, 675.49],
      [Infinity, 0.275, 908.73],
    ],
    irDependente: 189.59,
    irSimplificado: 607.2,
    redutor: { isentoAte: 5000, maxIsento: 312.89, ate: 7350, a: 978.62, b: 0.133145 },
  };

  const round2 = (v) => Math.round(v * 100) / 100;
  const num = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")) || 0);
  const toBool = (v) => v === true || String(v).toLowerCase() === "true";

  function parseJsonList(v) {
    if (Array.isArray(v)) return v;
    try {
      const parsed = JSON.parse(v || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function addDays(dataStr, days) {
    const d = fromDateStr(dataStr);
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  }

  /** INSS do empregado: cada alíquota incide só sobre a parte do salário dentro da faixa. */
  function inss(base) {
    let total = 0;
    let prev = 0;
    for (const [lim, aliq] of TABELAS_2026.inss) {
      if (base <= prev) break;
      total += (Math.min(base, lim) - prev) * aliq;
      prev = lim;
    }
    return round2(total);
  }

  /**
   * IRRF. `bruto` é o rendimento tributável (é ele que define o redutor); a base de cálculo
   * desconta INSS + dependentes, ou o desconto simplificado, o que for melhor.
   */
  function irrf(bruto, inssValor, dependentes = 0) {
    const t = TABELAS_2026;
    const deducao = Math.max(inssValor + dependentes * t.irDependente, t.irSimplificado);
    const base = Math.max(0, bruto - deducao);
    const [, aliq, parcela] = t.irrf.find(([lim]) => base <= lim);
    let imposto = Math.max(0, base * aliq - parcela);
    const r = t.redutor;
    if (bruto <= r.isentoAte) imposto -= Math.min(imposto, r.maxIsento);
    else if (bruto <= r.ate) imposto -= Math.min(imposto, Math.max(0, r.a - r.b * bruto));
    return round2(Math.max(0, imposto));
  }

  function holerite(bruto, dependentes = 0) {
    const valorInss = inss(bruto);
    const valorIr = irrf(bruto, valorInss, dependentes);
    return { bruto: round2(bruto), inss: valorInss, irrf: valorIr, liquido: round2(bruto - valorInss - valorIr) };
  }

  const rendaAtiva = (config) => num(config.RENDA_BRUTO) > 0;

  /** Campos de renda do Config, já convertidos (a planilha devolve tudo como texto). */
  function rendaConfig(config) {
    return {
      bruto: num(config.RENDA_BRUTO),
      diaPagto: num(config.RENDA_DIA_PAGTO) || 5,
      adiantPct: num(config.RENDA_ADIANT_PCT),
      adiantDia: num(config.RENDA_ADIANT_DIA) || 20,
      dependentes: num(config.RENDA_DEPENDENTES),
      descontos: num(config.RENDA_DESCONTOS),
      ajuste: num(config.RENDA_AJUSTE),
      admissao: normalizeDateStr(config.RENDA_ADMISSAO),
      ferias: parseJsonList(config.FERIAS)
        .map((p) => ({ inicio: normalizeDateStr(p.inicio), dias: num(p.dias) || 30 }))
        .filter((p) => p.inicio)
        .sort((a, b) => (a.inicio < b.inicio ? -1 : 1)),
      abono: toBool(config.FERIAS_ABONO),
      adianta13: toBool(config.FERIAS_ADIANTA_13),
      beneficios: parseJsonList(config.BENEFICIOS).map((b) => ({
        id: String(b.id || b.nome || ""),
        nome: String(b.nome || "Benefício"),
        valor: num(b.valor),
        entrada: toBool(b.entrada),
      })),
    };
  }

  /** Dias pagos como salário na competência (mês comercial de 30 dias, menos férias e antes da admissão). */
  function diasTrabalhados(rc, comp) {
    if (rc.admissao && rc.admissao.slice(0, 7) > comp) return 0;
    let dias = 30;
    if (rc.admissao && rc.admissao.startsWith(comp)) dias = Math.min(dias, 31 - Number(rc.admissao.slice(8, 10)));
    const ini = monthStart(comp);
    const fim = monthEnd(comp);
    rc.ferias.forEach((p) => {
      const pFim = addDays(p.inicio, p.dias - 1);
      const a = p.inicio > ini ? p.inicio : ini;
      const b = pFim < fim ? pFim : fim;
      if (a <= b) dias -= calendarDays(a, b) + 1;
    });
    return Math.max(0, Math.min(30, dias));
  }

  /** Salário da competência: bruto proporcional → INSS → IRRF → descontos fixos → ajuste → adiantamento. */
  function salarioCompetencia(rc, comp) {
    const dias = diasTrabalhados(rc, comp);
    if (dias <= 0) return null;
    const h = holerite((rc.bruto * dias) / 30, rc.dependentes);
    const adiantamento = round2((h.bruto * rc.adiantPct) / 100);
    return {
      ...h,
      dias,
      descontos: rc.descontos,
      ajuste: rc.ajuste,
      adiantamento,
      liquido: round2(h.liquido - rc.descontos + rc.ajuste - adiantamento),
      liquidoCalculado: round2(h.liquido - rc.descontos - adiantamento),
    };
  }

  /** Avos de 13º no ano: mês da admissão conta se trabalhou 15 dias ou mais nele. */
  function avos13(rc, ano) {
    if (!rc.admissao) return 12;
    const [y, m, d] = parseDateParts(rc.admissao);
    if (y > ano) return 0;
    if (y < ano) return 12;
    const contaMes = daysInMonth(rc.admissao.slice(0, 7)) - d + 1 >= 15 ? 1 : 0;
    return 12 - m + contaMes;
  }

  function feriasPeriodo(rc, p, idx) {
    const base = (rc.bruto / 30) * p.dias;
    const brutoF = base + base / 3;
    const h = holerite(brutoF, rc.dependentes);
    const abono = idx === 0 && rc.abono ? round2(((rc.bruto / 30) * 10 * 4) / 3) : 0; // isento de INSS e IR
    return { ...h, abono, liquido: round2(h.liquido + abono), dataPagto: addDays(p.inicio, -2) };
  }

  function decimoTerceiro(rc, ano) {
    const avos = avos13(rc, ano);
    if (!avos) return null;
    const total = (rc.bruto * avos) / 12;
    const primeira = round2(total / 2);
    const comFerias = rc.adianta13 && rc.ferias.find((p) => p.inicio.startsWith(String(ano)) && p.inicio.slice(5, 7) < "12");
    const h = holerite(total, rc.dependentes); // tributação exclusiva, separada do salário
    return {
      avos,
      total: round2(total),
      inss: h.inss,
      irrf: h.irrf,
      primeira: { valor: primeira, data: comFerias ? addDays(comFerias.inicio, -2) : `${ano}-11-30` },
      segunda: { valor: round2(h.liquido - primeira), data: `${ano}-12-20` },
    };
  }

  /**
   * Tudo que a renda cadastrada paga em um mês (datas dentro do mês), com IDs estáveis
   * para casar com o lançamento confirmado (campo recorrenteId).
   */
  function rendaEventos(config, monthStr) {
    if (!rendaAtiva(config)) return [];
    // meses antes de a renda ser cadastrada já foram lançados à mão
    const inicio = String(config.RENDA_INICIO || "").slice(0, 7);
    if (inicio && monthStr < inicio) return [];
    const rc = rendaConfig(config);
    const out = [];
    const push = (ev) => {
      if (ev && ev.valor > 0 && ev.data.startsWith(monthStr)) out.push(ev);
    };

    // Dia de pagamento ≥ 25: paga no próprio mês; senão, paga a competência anterior.
    const comp = rc.diaPagto >= 25 ? monthStr : addMonthsToMonth(monthStr, -1);
    const sal = salarioCompetencia(rc, comp);
    const diaSalario = dayInMonth(monthStr, rc.diaPagto);
    if (sal) {
      push({ id: `renda:salario:${monthStr}`, kind: "salario", motivo: "Salário", valor: sal.liquido, data: diaSalario, detalhe: sal });
    }
    if (rc.adiantPct > 0) {
      const adiant = salarioCompetencia(rc, monthStr);
      if (adiant) {
        push({
          id: `renda:adiant:${monthStr}`,
          kind: "adiantamento",
          motivo: "Adiantamento salarial",
          valor: adiant.adiantamento,
          data: dayInMonth(monthStr, rc.adiantDia),
        });
      }
    }

    const ano = Number(monthStr.slice(0, 4));
    const d13 = decimoTerceiro(rc, ano);
    if (d13) {
      push({ id: `renda:13-1:${ano}`, kind: "13", motivo: "13º salário · 1ª parcela", valor: d13.primeira.valor, data: d13.primeira.data });
      push({ id: `renda:13-2:${ano}`, kind: "13", motivo: "13º salário · 2ª parcela", valor: d13.segunda.valor, data: d13.segunda.data, detalhe: d13 });
    }

    rc.ferias.forEach((p, idx) => {
      const f = feriasPeriodo(rc, p, idx);
      push({ id: `renda:ferias:${p.inicio}`, kind: "ferias", motivo: `Férias (${p.dias} dias)`, valor: f.liquido, data: f.dataPagto, detalhe: f });
    });

    rc.beneficios
      .filter((b) => b.entrada && b.valor > 0)
      .forEach((b) => push({ id: `renda:benef:${b.id}:${monthStr}`, kind: "beneficio", motivo: b.nome, valor: b.valor, data: diaSalario }));

    return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  /** IDs de renda já confirmados (vale para qualquer mês: os IDs carregam a data). */
  function rendaConfirmada(txs) {
    return new Set(txs.map((tx) => tx.recorrenteId).filter((id) => id && String(id).startsWith("renda:")));
  }

  // ---------- Recorrentes ----------
  function recorrenteValidoNoMes(rec, monthStr) {
    if (!rec.ativo) return false;
    if (rec.inicio && normalizeDateStr(rec.inicio).slice(0, 7) > monthStr) return false;
    if (rec.fim && normalizeDateStr(rec.fim).slice(0, 7) < monthStr) return false;
    return true;
  }

  /** Recorrentes (e pagamentos da renda, se `config` vier) que valem no mês e ainda não foram lançados. */
  function pendingRecurring(recorrentes, txs, monthStr, config) {
    const lancados = new Set(
      txs.filter((tx) => tx.recorrenteId && inMonth(tx, monthStr)).map((tx) => tx.recorrenteId),
    );
    const recs = recorrentes
      .filter((rec) => recorrenteValidoNoMes(rec, monthStr) && !lancados.has(rec.id))
      .map((rec) => ({ ...rec, dueDate: dayInMonth(monthStr, rec.dia) }));
    const confirmados = rendaConfirmada(txs);
    const renda = config
      ? rendaEventos(config, monthStr)
          .filter((ev) => !confirmados.has(ev.id))
          .map((ev) => ({
            id: ev.id,
            tipo: "Entrada",
            natureza: "Entrada",
            motivo: ev.motivo,
            local: "",
            aplicativo: "",
            valor: ev.valor,
            dueDate: ev.data,
            renda: ev.kind,
          }))
      : [];
    return [...recs, ...renda].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
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

  function monthsBetween(fromMonth, toMonth) {
    const [ya, ma] = fromMonth.split("-").map(Number);
    const [yb, mb] = toMonth.split("-").map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }

  /**
   * Projeta o resto do mês atual (linha `parcial`) e os próximos `meses` meses.
   * - Entradas: pagamentos da renda cadastrada (salário, 13º, férias, benefícios que entram)
   *   + recorrentes de entrada; sem nada disso, média dos últimos 3 meses.
   * - Saídas: com teto, o plano é gastar o teto (ou mais, se fixos + parcelas já passarem dele).
   *   Sem teto: recorrentes/médias como antes. Parcelas já lançadas entram com o valor exato.
   * - A sobra de cada mês vai para o caixa, que rende % do CDI. Patrimônio = conta de hoje + caixa.
   */
  function projection({ transactions: txs, recorrentes = [], config }, meses = 6, today = todayStr()) {
    const atual = today.slice(0, 7);
    const r = dailyRate(config);
    const teto = num(config.TETO_MENSAL);
    const comRenda = rendaAtiva(config);

    const recEntradas = recorrentes.filter((rec) => rec.ativo && rec.tipo === "Entrada");
    const recSaidas = recorrentes.filter((rec) => rec.ativo && SAIDA_TIPOS.includes(rec.tipo));

    const avulso = (tx) => !tx.parcelaGrupo && !tx.recorrenteId;
    const mediaEntradas = trailingAverage(txs, atual, 3, (l) => sum(l.filter(isEntrada)));
    const mediaFixos = trailingAverage(txs, atual, 3, (l) => sum(l.filter((tx) => tx.tipo === "Fixo" && avulso(tx))));
    const mediaVariaveis = trailingAverage(txs, atual, 3, (l) =>
      sum(l.filter((tx) => (tx.tipo === "Debito" || tx.tipo === "Credito") && avulso(tx))),
    );
    const ritmoAtual = trailingAverage(txs, atual, 3, (l) => sum(l.filter(isSaida)));
    const confirmados = rendaConfirmada(txs);

    const conta = contaBalance(txs, today);
    const caixaHoje = caixaPosition(txs, config, today).bruto;
    let caixa = caixaHoje;
    const rows = [];
    for (let i = 0; i <= meses; i++) {
      const m = addMonthsToMonth(atual, i);
      const parcial = i === 0;
      const doMes = txs.filter((tx) => inMonth(tx, m));
      const jaPassou = (tx) => parcial && tx.data <= today;
      const jaTem = new Set(doMes.map((tx) => tx.recorrenteId).filter(Boolean));
      const validos = (list) => list.filter((rec) => recorrenteValidoNoMes(rec, m) && !jaTem.has(rec.id));

      // Entradas que ainda vão cair (no mês parcial, só o que não aconteceu até hoje)
      const entradasLancadas = sum(doMes.filter((tx) => isEntrada(tx) && !jaPassou(tx)));
      const eventos = rendaEventos(config, m);
      const rendaPrevista = sum(eventos.filter((ev) => !confirmados.has(ev.id)));
      let entradas;
      if (comRenda || recEntradas.length) entradas = entradasLancadas + rendaPrevista + sum(validos(recEntradas));
      else entradas = parcial ? entradasLancadas : Math.max(entradasLancadas, mediaEntradas);

      // Plano de saídas do mês inteiro
      const saidasMes = doMes.filter(isSaida);
      const ehParcela = (tx) => Boolean(tx.parcelaGrupo);
      const ehFixo = (tx) => !tx.parcelaGrupo && tx.tipo === "Fixo";
      const ehOutro = (tx) => !tx.parcelaGrupo && tx.tipo !== "Fixo";
      const parcelasPlano = sum(saidasMes.filter(ehParcela));
      const fixosLancados = sum(saidasMes.filter(ehFixo));
      const fixosPlano = recSaidas.length
        ? fixosLancados + sum(validos(recSaidas))
        : parcial
          ? fixosLancados
          : Math.max(fixosLancados, mediaFixos);
      const outrosLancados = sum(saidasMes.filter(ehOutro));
      let variaveisPlano;
      if (teto > 0) variaveisPlano = Math.max(outrosLancados, teto - fixosPlano - parcelasPlano);
      else variaveisPlano = parcial ? outrosLancados : Math.max(outrosLancados, mediaVariaveis);

      // O que ainda falta sair (no mês parcial, desconta o que já saiu até hoje)
      const jaSaiu = (fn) => sum(saidasMes.filter((tx) => fn(tx) && jaPassou(tx)));
      const parcelas = Math.max(0, parcelasPlano - jaSaiu(ehParcela));
      const fixos = Math.max(0, fixosPlano - jaSaiu(ehFixo));
      const variaveis = Math.max(0, variaveisPlano - jaSaiu(ehOutro));
      const saidas = fixos + parcelas + variaveis;

      const sobra = entradas - saidas;
      const desde = parcial ? today : monthEnd(addMonthsToMonth(m, -1));
      const fator = Math.pow(1 + r, businessDays(desde, monthEnd(m)));
      const rendimento = Math.max(0, caixa) * (fator - 1);
      caixa = caixa + rendimento + sobra;

      rows.push({
        month: m,
        parcial,
        entradas,
        fixos,
        parcelas,
        variaveis,
        saidas,
        sobra,
        rendimento,
        caixa,
        patrimonio: conta + caixa,
        fator,
        eventos,
      });
    }
    return { rows, ritmoAtual, conta, caixaHoje, patrimonioHoje: conta + caixaHoje };
  }

  /** Meses de projeção para alcançar a meta mais distante (mín. 6, máx. 24). */
  function projectionHorizon(metas = [], today = todayStr()) {
    const atual = today.slice(0, 7);
    const ate = metas.reduce((max, m) => Math.max(max, monthsBetween(atual, String(m.mes || "").slice(0, 7))), 0);
    return Math.min(24, Math.max(6, ate || 0));
  }

  /**
   * Situação de uma meta de patrimônio. Se faltar, calcula quanto guardar a mais por mês
   * (aportes no fim de cada mês até a meta, rendendo no caixa até lá).
   */
  function metaStatus(meta, proj, config = {}) {
    const valor = num(meta.valor);
    const mes = String(meta.mes || "").slice(0, 7);
    const rows = proj.rows;
    const idx = rows.findIndex((row) => row.month === mes);
    if (idx === -1) {
      const passada = rows.length && mes < rows[0].month;
      return { foraDoHorizonte: !passada, passada, valor, projetado: passada ? proj.patrimonioHoje : NaN };
    }
    const projetado = rows[idx].patrimonio;
    const falta = valor - projetado;
    let soma = 0;
    for (let j = 0; j <= idx; j++) {
      let g = 1;
      for (let k = j + 1; k <= idx; k++) g *= rows[k].fator;
      soma += g;
    }
    const porMes = falta > 0 ? falta / soma : 0;
    const teto = num(config.TETO_MENSAL);
    return {
      valor,
      projetado,
      falta,
      atingida: falta <= 0,
      porMes,
      meses: idx + 1,
      tetoSugerido: teto > 0 && porMes > 0 ? Math.max(0, teto - porMes) : null,
      pct: valor > 0 ? Math.max(0, Math.min(1, projetado / valor)) : 1,
    };
  }

  const Finance = {
    SAIDA_TIPOS,
    TABELAS_2026,
    todayStr,
    currentMonthStr,
    parseDateParts,
    normalizeDateStr,
    addMonths,
    addMonthsToMonth,
    addDays,
    monthsBetween,
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
    inss,
    irrf,
    holerite,
    rendaAtiva,
    rendaConfig,
    salarioCompetencia,
    decimoTerceiro,
    feriasPeriodo,
    rendaEventos,
    pendingRecurring,
    budget,
    projection,
    projectionHorizon,
    metaStatus,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Finance;
  else root.Finance = Finance;
})(typeof self !== "undefined" ? self : this);
