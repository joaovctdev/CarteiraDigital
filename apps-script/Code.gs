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
 */

var SHEET_ID = '11TvXn9iX4wDqCR_KM3IrUbIGELfAC_zosZ3MoRMmiJ0';
var SHEET_NAME = 'Carteira';
var DADOS_SHEET_NAME = 'DADOS';

var HEADERS = ['ID', 'Data', 'Tipo', 'Natureza', 'Motivo', 'Local', 'Aplicativo', 'Valor', 'CriadoEm', 'ParcelaGrupo', 'ParcelaAtual', 'ParcelaTotal'];

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'list';
    if (action === 'list') return jsonResponse({ ok: true, data: listTransactions() });
    if (action === 'dados') return jsonResponse({ ok: true, data: listDados() });
    return jsonResponse({ ok: false, error: 'Ação inválida: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'add') return jsonResponse({ ok: true, data: addTransaction(body.data) });
    if (action === 'addMany') return jsonResponse({ ok: true, data: addManyTransactions(body.items) });
    if (action === 'update') return jsonResponse({ ok: true, data: updateTransaction(body.id, body.data) });
    if (action === 'delete') return jsonResponse({ ok: true, data: deleteTransaction(body.id) });
    if (action === 'deleteGroup') return jsonResponse({ ok: true, data: deleteGroup(body.groupId) });

    return jsonResponse({ ok: false, error: 'Ação inválida: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

/** Garante que a aba "Carteira" existe e tem o cabeçalho certo. */
function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listTransactions() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
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
    parcelaTotal: row[11] || ''
  };
}

function formatDate_(value) {
  if (value instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  return value;
}

function addTransaction(data) {
  var sheet = getSheet_();
  var id = Utilities.getUuid();
  sheet.appendRow(rowFromData_(id, data));
  return { id: id };
}

/**
 * Adiciona várias linhas de uma vez — usado para lançamentos parcelados,
 * onde cada parcela vira uma linha própria, datada no seu respectivo mês.
 * body.items: array de objetos no mesmo formato de addTransaction, cada um
 * já trazendo parcelaGrupo/parcelaAtual/parcelaTotal quando for o caso.
 */
function addManyTransactions(items) {
  if (!items || !items.length) return { ids: [] };
  var sheet = getSheet_();
  var ids = [];
  var rows = items.map(function (data) {
    var id = Utilities.getUuid();
    ids.push(id);
    return rowFromData_(id, data);
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  return { ids: ids };
}

function rowFromData_(id, data) {
  return [
    id,
    data.data,
    data.tipo,
    data.natureza,
    data.motivo || '',
    data.local || '',
    data.aplicativo || '',
    Number(data.valor) || 0,
    new Date(),
    data.parcelaGrupo || '',
    data.parcelaAtual || '',
    data.parcelaTotal || ''
  ];
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

function updateTransaction(id, data) {
  var sheet = getSheet_();
  var row = findRowById_(sheet, id);
  if (row === -1) throw new Error('Lançamento não encontrado: ' + id);

  var map = {
    data: 2, tipo: 3, natureza: 4, motivo: 5, local: 6, aplicativo: 7, valor: 8,
    parcelaGrupo: 10, parcelaAtual: 11, parcelaTotal: 12
  };
  Object.keys(map).forEach(function (key) {
    if (data[key] !== undefined) {
      var value = key === 'valor' ? Number(data[key]) || 0 : data[key];
      sheet.getRange(row, map[key]).setValue(value);
    }
  });
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
 * esse dinheiro já foi de fato movimentado).
 */
function deleteGroup(groupId) {
  if (!groupId) throw new Error('groupId não informado');
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { count: 0 };
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var today = formatDate_(new Date());
  var count = 0;
  // de baixo para cima, pra não bagunçar os índices ao deletar
  for (var i = values.length - 1; i >= 0; i--) {
    var rowGroup = values[i][9];
    var rowDate = formatDate_(values[i][1]);
    if (rowGroup === groupId && rowDate > today) {
      sheet.deleteRow(i + 2);
      count++;
    }
  }
  return { count: count };
}

/** Lê a lista de sugestões (bancos/apps/motivos) da aba "DADOS", coluna A. */
function listDados() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(DADOS_SHEET_NAME);
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
