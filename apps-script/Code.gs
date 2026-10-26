/**
 * CARTEIRA DIGITAL — backend (Google Apps Script)
 * ------------------------------------------------
 * Este script vira uma "API" que o site (HTML/CSS/JS) usa para ler e
 * gravar os lançamentos direto na sua planilha do Google Sheets.
 *
 * COMO INSTALAR (faça uma vez só):
 * 1. Abra a planilha:
 *    https://docs.google.com/spreadsheets/d/11TvXn9iX4wDqCR_KM3IrUbIGELfAC_zosZ3MoRMmiJ0/edit
 * 2. Menu Extensões > Apps Script.
 * 3. Apague o conteúdo padrão do arquivo "Code.gs" e cole TODO o conteúdo
 *    deste arquivo no lugar.
 * 4. Clique em "Implantar" (Deploy) > "Nova implantação".
 *    - Tipo: "App da Web" (Web app)
 *    - Executar como: Eu (seu e-mail)
 *    - Quem pode acessar: Qualquer pessoa (Anyone)
 * 5. Autorize o script quando o Google pedir permissão.
 * 6. Copie a URL gerada (termina em /exec) e cole em js/config.js,
 *    na constante API_URL.
 *
 * Sempre que você editar este arquivo, use "Gerenciar implantações" >
 * ícone de lápis > "Nova versão" > Implantar, para que as mudanças valham.
 *
 * ABAS USADAS
 * - Carteira:    um lançamento por linha (entradas, saídas e movimentos do caixa).
 * - Recorrentes: modelos de lançamentos que se repetem todo mês (aluguel, salário…).
 * - Config:      chave | valor (CDI, % do CDI, teto mensal, saldo inicial do caixa).
 * - DADOS:       sugestões de autocompletar (coluna A).
 */

var SHEET_ID = '11TvXn9iX4wDqCR_KM3IrUbIGELfAC_zosZ3MoRMmiJ0';
var SHEET_NAME = 'Carteira';
var DADOS_SHEET_NAME = 'DADOS';
var CONFIG_SHEET_NAME = 'Config';
var REC_SHEET_NAME = 'Recorrentes';

var HEADERS = ['ID', 'Data', 'Tipo', 'Natureza', 'Motivo', 'Local', 'Aplicativo', 'Valor', 'CriadoEm', 'ParcelaGrupo', 'ParcelaAtual', 'ParcelaTotal', 'RecorrenteId'];
var REC_HEADERS = ['ID', 'Tipo', 'Natureza', 'Motivo', 'Local', 'Aplicativo', 'Valor', 'Dia', 'Ativo', 'Inicio', 'Fim'];

/** Valores padrão da aba Config (criados na primeira execução). */
var CONFIG_DEFAULTS = [
  ['CDI_ANUAL', 14.9, 'CDI ao ano, em %. Atualize quando o Copom mudar a Selic.'],
  ['PCT_CDI', 120, 'Quanto do CDI o caixa rende, em %.'],
  ['TETO_MENSAL', 0, 'Quanto você se permite gastar por mês (0 = sem teto).'],
  ['CAIXA_SALDO_INICIAL', 0, 'Saldo do caixa antes do primeiro lançamento de Caixa.'],
  ['CAIXA_DATA_INICIAL', '', 'Data (AAAA-MM-DD) desse saldo inicial.']
];

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'list';
    if (action === 'bootstrap') return jsonResponse({ ok: true, data: bootstrap() });
    if (action === 'list') return jsonResponse({ ok: true, data: listTransactions() });
    if (action === 'dados') return jsonResponse({ ok: true, data: listDados() });
    return jsonResponse({ ok: false, error: 'Ação inválida: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'add') return jsonResponse({ ok: true, data: addTransaction(body.data) });
    if (action === 'addMany') return jsonResponse({ ok: true, data: addManyTransactions(body.items) });
    if (action === 'update') return jsonResponse({ ok: true, data: updateTransaction(body.id, body.data) });
    if (action === 'delete') return jsonResponse({ ok: true, data: deleteTransaction(body.id) });
    if (action === 'deleteGroup') return jsonResponse({ ok: true, data: deleteGroup(body.groupId) });
    if (action === 'setConfig') return jsonResponse({ ok: true, data: setConfig(body.data) });
    if (action === 'addRecorrente') return jsonResponse({ ok: true, data: addRecorrente(body.data) });
    if (action === 'updateRecorrente') return jsonResponse({ ok: true, data: updateRecorrente(body.id, body.data) });
    if (action === 'deleteRecorrente') return jsonResponse({ ok: true, data: deleteRecorrente(body.id) });

    return jsonResponse({ ok: false, error: 'Ação inválida: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Tudo que o site precisa para abrir, numa única chamada. */
function bootstrap() {
  return {
    transactions: listTransactions(),
    dados: listDados(),
    config: getConfig(),
    recorrentes: listRecorrentes()
  };
}

// ---------- Helpers de aba ----------

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

/** Garante que a aba existe e tem o cabeçalho certo (acrescenta colunas novas no fim, se faltarem). */
function ensureSheet_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol < headers.length) {
    sheet.getRange(1, lastCol + 1, 1, headers.length - lastCol)
      .setValues([headers.slice(lastCol)]);
  }
  return sheet;
}

function getSheet_() {
  return ensureSheet_(SHEET_NAME, HEADERS);
}

function readRows_(sheet, width) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // +2: cabeçalho + índice base 1
  }
  return -1;
}

function formatDate_(value) {
  if (value instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  return value;
}

// ---------- Lançamentos ----------

function listTransactions() {
  var values = readRows_(getSheet_(), HEADERS.length);
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue; // ignora linhas vazias
    out.push(rowToObject_(row));
  }
  return out;
}

function rowToObject_(row) {
  return {
    id: row[0],
    data: formatDate_(row[1]),
    tipo: row[2],
    natureza: row[3],
    motivo: row[4],
    local: row[5],
    aplicativo: row[6],
    valor: Number(row[7]) || 0,
    criadoEm: row[8] ? new Date(row[8]).toISOString() : '',
    parcelaGrupo: row[9] || '',
    parcelaAtual: row[10] || '',
    parcelaTotal: row[11] || '',
    recorrenteId: row[12] || ''
  };
}

function rowFromData_(id, data, criadoEm) {
  return [
    id,
    data.data,
    data.tipo,
    data.natureza,
    data.motivo || '',
    data.local || '',
    data.aplicativo || '',
    Number(data.valor) || 0,
    criadoEm || new Date(),
    data.parcelaGrupo || '',
    data.parcelaAtual || '',
    data.parcelaTotal || '',
    data.recorrenteId || ''
  ];
}

/** O site pode mandar o próprio id (atualização otimista); se não mandar, gera um. */
function addTransaction(data) {
  var sheet = getSheet_();
  var id = data.id || Utilities.getUuid();
  sheet.appendRow(rowFromData_(id, data));
  return { id: id };
}

/**
 * Adiciona várias linhas de uma vez — usado para lançamentos parcelados,
 * onde cada parcela vira uma linha própria, datada no seu respectivo mês.
 */
function addManyTransactions(items) {
  if (!items || !items.length) return { ids: [] };
  var sheet = getSheet_();
  var ids = [];
  var rows = items.map(function (data) {
    var id = data.id || Utilities.getUuid();
    ids.push(id);
    return rowFromData_(id, data);
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  return { ids: ids };
}

/** Reescreve a linha inteira de uma vez (uma chamada à planilha em vez de uma por campo). */
function updateTransaction(id, data) {
  var sheet = getSheet_();
  var row = findRowById_(sheet, id);
  if (row === -1) throw new Error('Lançamento não encontrado: ' + id);
  var range = sheet.getRange(row, 1, 1, HEADERS.length);
  var current = rowToObject_(range.getValues()[0]);
  Object.keys(data).forEach(function (key) {
    if (data[key] !== undefined && key !== 'id' && key !== 'criadoEm') current[key] = data[key];
  });
  var existingCreated = range.getValues()[0][8];
  range.setValues([rowFromData_(id, current, existingCreated)]);
  return { id: id };
}

function deleteTransaction(id) {
  var sheet = getSheet_();
  var row = findRowById_(sheet, id);
  if (row === -1) throw new Error('Lançamento não encontrado: ' + id);
  sheet.deleteRow(row);
  return { id: id };
}

/**
 * Cancela as parcelas restantes de um parcelamento: apaga só as linhas com
 * data futura (as parcelas já vencidas ficam registradas normalmente, pois
 * esse dinheiro já foi de fato movimentado). Linhas vizinhas são apagadas
 * em bloco, numa chamada só.
 */
function deleteGroup(groupId) {
  if (!groupId) throw new Error('groupId não informado');
  var sheet = getSheet_();
  var values = readRows_(sheet, HEADERS.length);
  var today = formatDate_(new Date());
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][9] === groupId && formatDate_(values[i][1]) > today) rows.push(i + 2);
  }
  // de baixo para cima, pra não bagunçar os índices ao deletar
  var count = rows.length;
  while (rows.length) {
    var end = rows.pop();
    var start = end;
    while (rows.length && rows[rows.length - 1] === start - 1) start = rows.pop();
    sheet.deleteRows(start, end - start + 1);
  }
  return { count: count };
}

// ---------- Config ----------

function getConfigSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.appendRow(['Chave', 'Valor', 'Descrição']);
    sheet.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getConfig() {
  var values = readRows_(getConfigSheet_(), 2);
  var out = {};
  CONFIG_DEFAULTS.forEach(function (d) { out[d[0]] = d[1]; });
  values.forEach(function (r) {
    var key = String(r[0] || '').trim();
    if (key) out[key] = formatDate_(r[1]);
  });
  return out;
}

/** Grava só as chaves recebidas; chaves novas viram linhas novas. */
function setConfig(data) {
  var sheet = getConfigSheet_();
  var values = readRows_(sheet, 1);
  Object.keys(data || {}).forEach(function (key) {
    var idx = -1;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === key) { idx = i; break; }
    }
    if (idx === -1) {
      sheet.appendRow([key, data[key]]);
      values.push([key]);
    } else {
      sheet.getRange(idx + 2, 2).setValue(data[key]);
    }
  });
  return getConfig();
}

// ---------- Recorrentes ----------

function getRecSheet_() {
  return ensureSheet_(REC_SHEET_NAME, REC_HEADERS);
}

function listRecorrentes() {
  var values = readRows_(getRecSheet_(), REC_HEADERS.length);
  var out = [];
  values.forEach(function (r) {
    if (!r[0]) return;
    out.push({
      id: r[0],
      tipo: r[1],
      natureza: r[2],
      motivo: r[3],
      local: r[4],
      aplicativo: r[5],
      valor: Number(r[6]) || 0,
      dia: Number(r[7]) || 1,
      ativo: r[8] !== false && String(r[8]).toUpperCase() !== 'FALSE',
      inicio: formatDate_(r[9]) || '',
      fim: formatDate_(r[10]) || ''
    });
  });
  return out;
}

function recRowFromData_(id, d) {
  return [
    id,
    d.tipo,
    d.natureza,
    d.motivo || '',
    d.local || '',
    d.aplicativo || '',
    Number(d.valor) || 0,
    Math.min(31, Math.max(1, Number(d.dia) || 1)),
    d.ativo !== false,
    d.inicio || '',
    d.fim || ''
  ];
}

function addRecorrente(data) {
  var id = data.id || Utilities.getUuid();
  getRecSheet_().appendRow(recRowFromData_(id, data));
  return { id: id };
}

function updateRecorrente(id, data) {
  var sheet = getRecSheet_();
  var row = findRowById_(sheet, id);
  if (row === -1) throw new Error('Recorrente não encontrado: ' + id);
  var current = listRecorrentes().filter(function (r) { return r.id === id; })[0] || {};
  Object.keys(data).forEach(function (k) { if (data[k] !== undefined) current[k] = data[k]; });
  sheet.getRange(row, 1, 1, REC_HEADERS.length).setValues([recRowFromData_(id, current)]);
  return { id: id };
}

function deleteRecorrente(id) {
  var sheet = getRecSheet_();
  var row = findRowById_(sheet, id);
  if (row === -1) throw new Error('Recorrente não encontrado: ' + id);
  sheet.deleteRow(row);
  return { id: id };
}

// ---------- DADOS ----------

/** Lê a lista de sugestões (bancos/apps/motivos) da aba "DADOS", coluna A. */
function listDados() {
  var sheet = getSpreadsheet_().getSheetByName(DADOS_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  var out = [];
  values.forEach(function (r) {
    var v = String(r[0] || '').trim();
    if (v) out.push(v);
  });
  return out;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
