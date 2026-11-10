/* Relatórios em Excel (.xlsx) prontos para impressão em A4.
   Usa a biblioteca ExcelJS, carregada só quando o usuário pede um relatório. */
(function () {
'use strict';

var URLS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js'
];
var TIPO = { veiculo: { nome: 'Veículo', placa: 'Placa' }, maquina: { nome: 'Máquina', placa: 'Prefixo ou placa' } };
var GNOME = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
var GFILL = { baixa: 'FFE0EEF8', media: 'FFFBF0D5', alta: 'FFFDE8DC', critica: 'FFFCE4E1' };
var GFONT = { baixa: 'FF1F5C8A', media: 'FF7A5200', alta: 'FF9A3412', critica: 'FF9B1C13' };
var VERDE = 'FF0E6B5A', CLARO = 'FFE6EEEB', CINZA = 'FF56655E', TINTA = 'FF17211E';
var FONTE = 'Calibri';
var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function carregarScript(u) {
  return new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = u; s.onload = res;
    s.onerror = function () { s.remove(); rej(new Error('falha')); };
    document.head.appendChild(s);
  });
}
async function exceljs() {
  if (window.ExcelJS) return window.ExcelJS;
  for (var i = 0; i < URLS.length; i++) {
    try { await carregarScript(URLS[i]); if (window.ExcelJS) return window.ExcelJS; } catch (e) {}
  }
  throw new Error('Não foi possível carregar o gerador de Excel. Verifique a internet.');
}

function fmtData(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }
function dataArq() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function agoraTxt() { return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function moeda(n) { return (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function nomeAba(s) { return String(s).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Relatório'; }
function nomeArq(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, ''); }

/* altura de linha para texto que quebra em várias linhas */
function linhas(txt, cpl) {
  return String(txt == null ? '' : txt).split(/\r?\n/).reduce(function (n, l) { return n + Math.max(1, Math.ceil(l.length / cpl)); }, 0);
}
function altura(n, min) { return Math.max(min || 20, n * 15 + 6); }

function borda() {
  var b = { style: 'thin', color: { argb: 'FF7A8A84' } };
  return { top: b, left: b, bottom: b, right: b };
}
function celula(c, o) {
  o = o || {};
  c.font = { name: o.mono ? 'Consolas' : FONTE, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || TINTA } };
  c.alignment = { vertical: o.v || 'middle', horizontal: o.h || 'left', wrapText: true, indent: o.h === 'center' ? 0 : 1 };
  if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  if (o.border !== false) c.border = borda();
}
function nCols(ws) { return ws.columns.length; }

function linhaMesclada(ws, txt, o) {
  var row = ws.addRow([txt]);
  ws.mergeCells(row.number, 1, row.number, nCols(ws));
  var c = row.getCell(1);
  c.font = { name: FONTE, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || TINTA } };
  c.alignment = { horizontal: o.align || 'left', vertical: 'middle', wrapText: true };
  row.height = o.h || 20;
  return row;
}
function espaco(ws, h) { var row = ws.addRow([]); row.height = h || 8; return row; }
function secao(ws, txt) {
  var row = ws.addRow([txt]);
  ws.mergeCells(row.number, 1, row.number, nCols(ws));
  var c = row.getCell(1);
  c.font = { name: FONTE, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  c.alignment = { vertical: 'middle', indent: 1 };
  row.height = 22;
}
function par(ws, l1, v1, l2, v2) {
  var row = ws.addRow([l1, v1, l2, v2]);
  celula(row.getCell(1), { bold: true, fill: CLARO }); celula(row.getCell(3), { bold: true, fill: CLARO });
  celula(row.getCell(2)); celula(row.getCell(4));
  row.height = altura(Math.max(linhas(v1, 28), linhas(v2, 28)), 22);
}
function cheia(ws, l, v, o) {
  var row = ws.addRow([l, v]);
  ws.mergeCells(row.number, 2, row.number, 4);
  celula(row.getCell(1), { bold: true, fill: CLARO });
  celula(row.getCell(2), { mono: o && o.mono });
  [3, 4].forEach(function (i) { row.getCell(i).border = borda(); });
  row.height = altura(linhas(v, 78), 22);
}

async function baixar(wb, nome) {
  var buf = await wb.xlsx.writeBuffer();
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
}

function dimensoes(blob) {
  return new Promise(function (res) {
    var u = URL.createObjectURL(blob), i = new Image();
    i.onload = function () { URL.revokeObjectURL(u); res({ w: i.naturalWidth || 4, h: i.naturalHeight || 3 }); };
    i.onerror = function () { URL.revokeObjectURL(u); res({ w: 4, h: 3 }); };
    i.src = u;
  });
}
async function baixarFoto(ctx, path) {
  var r = await ctx.sb.storage.from(ctx.bucket).download(path);
  if (r.error || !r.data) throw new Error('foto');
  var d = await dimensoes(r.data);
  return { buf: await r.data.arrayBuffer(), w: d.w, h: d.h };
}

/* ---------- ficha de um veículo ou máquina ---------- */
async function ficha(r, ctx) {
  if (ctx.progresso) ctx.progresso('Preparando…');
  var X = await exceljs();
  var wb = new X.Workbook(); wb.creator = 'Vistoria de Leilão'; wb.created = new Date();
  var t = TIPO[r.tipo] || TIPO.veiculo;
  var ws = wb.addWorksheet(nomeAba('Ficha ' + r.placa));
  ws.columns = [{ width: 18 }, { width: 32 }, { width: 18 }, { width: 32 }];

  linhaMesclada(ws, 'VISTORIA PARA LEILÃO', { size: 20, bold: true, align: 'center', h: 36 });
  linhaMesclada(ws, t.nome + ' · ' + r.placa, { size: 15, bold: true, align: 'center', h: 26 });
  linhaMesclada(ws, 'Vistoria realizada em ' + fmtData(r.data) + (r.vistoriador ? ' por ' + r.vistoriador : ''), { size: 10, italic: true, color: CINZA, align: 'center', h: 18 });
  espaco(ws, 8);

  secao(ws, 'IDENTIFICAÇÃO');
  par(ws, 'Lote', r.lote || '—', 'Tipo', t.nome);
  par(ws, t.placa, r.placa, 'Ano', r.ano);
  cheia(ws, 'Marca e modelo', r.modelo);
  cheia(ws, 'Chassi ou série', r.chassi, { mono: true });
  par(ws, 'Cor', r.cor || '—', 'Motor', r.motor || '—');
  par(ws, 'Situação', r.situacao || '—', 'UF', r.uf || '—');
  cheia(ws, 'Valor inicial para conserto', moeda(r.valor_conserto));
  par(ws, 'Vistoriador', r.vistoriador || '—', 'Data da vistoria', fmtData(r.data));
  espaco(ws, 8);

  var ds = r.defeitos || [];
  secao(ws, 'DEFEITOS ENCONTRADOS (' + ds.length + ')');
  if (!ds.length) {
    var vz = ws.addRow(['Nenhum defeito aparente registrado.']);
    ws.mergeCells(vz.number, 1, vz.number, 4);
    celula(vz.getCell(1), { italic: true, color: CINZA, h: 'center' });
    [2, 3, 4].forEach(function (i) { vz.getCell(i).border = borda(); });
    vz.height = 24;
  } else {
    var hd = ws.addRow(['Gravidade', 'Onde está', 'Descrição']);
    ws.mergeCells(hd.number, 3, hd.number, 4);
    [1, 2, 3].forEach(function (i) { celula(hd.getCell(i), { bold: true, fill: CLARO }); });
    hd.getCell(4).border = borda(); hd.height = 22;
    ds.forEach(function (d) {
      var row = ws.addRow([GNOME[d.gravidade] || '', d.item, d.descricao]);
      ws.mergeCells(row.number, 3, row.number, 4);
      celula(row.getCell(1), { bold: true, h: 'center', fill: GFILL[d.gravidade], color: GFONT[d.gravidade] });
      celula(row.getCell(2), { v: 'top' }); celula(row.getCell(3), { v: 'top' });
      row.getCell(4).border = borda();
      row.height = altura(Math.max(linhas(d.item, 30), linhas(d.descricao, 46)), 24);
    });
  }
  espaco(ws, 8);

  if (r.obs) {
    secao(ws, 'OBSERVAÇÕES');
    var ob = ws.addRow([r.obs]);
    ws.mergeCells(ob.number, 1, ob.number, 4);
    celula(ob.getCell(1), { v: 'top' });
    [2, 3, 4].forEach(function (i) { ob.getCell(i).border = borda(); });
    ob.height = altura(linhas(r.obs, 92), 30);
    espaco(ws, 8);
  }

  /* assinatura */
  espaco(ws, 18);
  var sg = ws.addRow(['', '', '', '']); sg.height = 30;
  ws.mergeCells(sg.number, 1, sg.number, 2); ws.mergeCells(sg.number, 3, sg.number, 4);
  var linha = { bottom: { style: 'thin', color: { argb: 'FF17211E' } } };
  [1, 2, 3, 4].forEach(function (i) { sg.getCell(i).border = linha; });
  var sl = ws.addRow(['Assinatura do vistoriador', '', 'Data', '']);
  ws.mergeCells(sl.number, 1, sl.number, 2); ws.mergeCells(sl.number, 3, sl.number, 4);
  [1, 3].forEach(function (i) { var c = sl.getCell(i); c.font = { name: FONTE, size: 9, color: { argb: CINZA } }; c.alignment = { horizontal: 'center', vertical: 'top' }; });
  sl.height = 16;

  /* fotos (a partir de uma nova página) */
  var fotos = r.fotos || [];
  if (fotos.length) {
    ws.getRow(ws.rowCount).addPageBreak();
    secao(ws, 'FOTOS (' + fotos.length + ')');
    var imgs = [];
    for (var i = 0; i < fotos.length; i++) {
      if (ctx.progresso) ctx.progresso('Fotos ' + (i + 1) + ' de ' + fotos.length + '…');
      try { imgs.push(await baixarFoto(ctx, fotos[i])); } catch (e) { imgs.push(null); }
    }
    var BW = 350, BH = 256;
    for (var k = 0; k < imgs.length; k += 2) {
      var fr = ws.addRow(['', '', '', '']); fr.height = 196;
      var dois = k + 1 < imgs.length;
      ws.mergeCells(fr.number, 1, fr.number, 2);
      if (dois) ws.mergeCells(fr.number, 3, fr.number, 4);
      [1, 2].concat(dois ? [3, 4] : []).forEach(function (i) { fr.getCell(i).border = borda(); });
      [[k, 0], [k + 1, 2]].forEach(function (par) {
        var im = imgs[par[0]]; if (!im || par[0] >= imgs.length) return;
        var s = Math.min(BW / im.w, BH / im.h);
        var id = wb.addImage({ buffer: im.buf, extension: 'jpeg' });
        ws.addImage(id, { tl: { col: par[1], row: fr.number - 1 }, ext: { width: Math.round(im.w * s), height: Math.round(im.h * s) }, editAs: 'oneCell' });
      });
      if ((k / 2) % 3 === 2 && k + 2 < imgs.length) ws.getRow(fr.number).addPageBreak();
    }
  }

  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true, printArea: 'A1:D' + ws.rowCount,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 }
  };
  ws.headerFooter = { oddFooter: '&L&9Vistoria de Leilão&C&9Página &P de &N&R&9Impresso em &D' };
  if (ctx.progresso) ctx.progresso('Gerando arquivo…');
  await baixar(wb, 'Vistoria-' + (nomeArq(r.placa) || 'cadastro') + '-' + dataArq() + '.xlsx');
}

/* ---------- relatório geral (lista) ---------- */
function ordemLote(a, b) {
  var la = String(a.lote || '').trim(), lb = String(b.lote || '').trim();
  if (la && !lb) return -1; if (!la && lb) return 1;
  if (la && lb) { var c = la.localeCompare(lb, 'pt-BR', { numeric: true }); if (c) return c; }
  return String(a.criado_em || '').localeCompare(String(b.criado_em || ''));
}
async function geral(lista, ctx, filtro) {
  if (ctx.progresso) ctx.progresso('Preparando…');
  var X = await exceljs();
  var wb = new X.Workbook(); wb.creator = 'Vistoria de Leilão'; wb.created = new Date();
  var ws = wb.addWorksheet('Relação de lotes');
  var COLS = [
    ['LOTE', 7], ['MARCA E MODELO', 26], ['PLACA', 12], ['CHASSI / SÉRIE', 22], ['ANO', 10], ['COR', 11],
    ['MOTOR', 16], ['SITUAÇÃO', 15], ['UF', 5], ['VALOR INICIAL PARA CONSERTO (R$)', 17], ['DEFEITOS', 44]
  ];
  ws.columns = COLS.map(function (c) { return { width: c[1] }; });
  var NC = COLS.length;
  lista = lista.slice().sort(ordemLote);

  linhaMesclada(ws, 'RELATÓRIO GERAL DE VISTORIA PARA LEILÃO', { size: 18, bold: true, align: 'center', h: 32 });
  var totalDef = lista.reduce(function (n, r) { return n + (r.defeitos || []).length; }, 0);
  var comDef = lista.filter(function (r) { return (r.defeitos || []).length; }).length;
  var somaConserto = lista.reduce(function (n, r) { return n + (Number(r.valor_conserto) || 0); }, 0);
  linhaMesclada(ws, 'Gerado em ' + agoraTxt() + ' · ' + lista.length + ' ' + (lista.length === 1 ? 'item' : 'itens') + (filtro ? ' (' + filtro + ')' : ''), { size: 10, italic: true, color: CINZA, align: 'center', h: 18 });
  espaco(ws, 8);

  var hd = ws.addRow(COLS.map(function (c) { return c[0]; }));
  for (var c = 1; c <= NC; c++) {
    var cell = hd.getCell(c);
    cell.font = { name: FONTE, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = borda();
  }
  hd.height = 44;
  var topo = hd.number;
  var CENTRO = { 1: 1, 3: 1, 5: 1, 6: 1, 8: 1, 9: 1 };

  lista.forEach(function (r, i) {
    var ds = r.defeitos || [];
    var txt = ds.length ? ds.map(function (d) { return '• ' + d.item + ' (' + (GNOME[d.gravidade] || '') + '): ' + d.descricao; }).join('\n') : 'Sem defeitos aparentes';
    var row = ws.addRow([r.lote || '', r.modelo, r.placa, r.chassi, r.ano, r.cor || '', r.motor || '', r.situacao || '',
      r.uf || '', r.valor_conserto == null ? '' : Number(r.valor_conserto), txt]);
    var fill = i % 2 ? 'FFF4F6F5' : null;
    for (var c2 = 1; c2 <= NC; c2++) {
      var ce = row.getCell(c2);
      var num = c2 === 10;
      celula(ce, { v: 'middle', h: num ? 'right' : (CENTRO[c2] ? 'center' : 'left'), fill: fill, mono: c2 === 4 || c2 === 7,
        size: (c2 === 4 || c2 === 7 || c2 === 11) ? 10 : 11, color: (c2 === 11 && !ds.length) ? CINZA : TINTA, italic: c2 === 11 && !ds.length, bold: c2 === 10 });
      if (num) ce.numFmt = '#,##0.00';
      if (c2 === 1) ce.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    row.height = altura(Math.max(linhas(txt, 48), linhas(r.modelo, 27), linhas(r.chassi, 22), linhas(r.motor || '', 16), linhas(r.situacao || '', 15), linhas(r.cor || '', 11)), 30);
  });

  espaco(ws, 8);
  var tot = ws.addRow(['Total: ' + lista.length + ' cadastros · ' + comDef + ' com defeitos · ' + totalDef + ' defeitos registrados · valor inicial para conserto somado: ' + moeda(somaConserto)]);
  ws.mergeCells(tot.number, 1, tot.number, NC);
  tot.getCell(1).font = { name: FONTE, size: 11, bold: true, color: { argb: TINTA } };
  tot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  tot.height = 22;

  ws.views = [{ state: 'frozen', ySplit: topo }];
  ws.autoFilter = { from: { row: topo, column: 1 }, to: { row: topo, column: NC } };
  ws.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true, printArea: 'A1:K' + ws.rowCount, printTitlesRow: topo + ':' + topo,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 }
  };
  ws.headerFooter = { oddFooter: '&L&9Vistoria de Leilão&C&9Página &P de &N&R&9Impresso em &D' };
  if (ctx.progresso) ctx.progresso('Gerando arquivo…');
  await baixar(wb, 'Relatorio-geral-' + dataArq() + '.xlsx');
}

window.Relatorio = { ficha: ficha, geral: geral };
})();
