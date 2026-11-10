(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

var BUCKET = 'fotos';
var MAX_FOTOS = 12;
var GRAV = [
  { k: 'baixa', n: 'Baixa', d: 'Detalhe estético ou desgaste normal.' },
  { k: 'media', n: 'Média', d: 'Precisa de reparo, mas funciona.' },
  { k: 'alta', n: 'Alta', d: 'Compromete o uso ou o valor.' },
  { k: 'critica', n: 'Crítica', d: 'Não funciona ou é perigoso.' }
];
var GNOME = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
var TIPO = {
  veiculo: { nome: 'Veículo', placa: 'Placa', ph: 'ABC-1D23', modelo: 'Ex.: Toyota Hilux CD 4x4' },
  maquina: { nome: 'Máquina', placa: 'Prefixo ou placa', ph: 'ESC-04', modelo: 'Ex.: Caterpillar 320 escavadeira' }
};

function hoje() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtData(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }
function loadPrefs() { try { return JSON.parse(localStorage.getItem('vl:prefs') || '{}') || {}; } catch (e) { return {}; } }
function savePrefs(p) { try { localStorage.setItem('vl:prefs', JSON.stringify(p)); } catch (e) {} }
var SITUACOES = ['Conservado', 'Regular', 'Sucata aproveitável', 'Sucata inservível'];
var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
function fmtMoeda(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMoeda(t) {
  t = String(t == null ? '' : t).replace(/R\$|\s/g, '');
  if (!t) return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}
function novo() {
  var p = loadPrefs();
  return { id: uuid(), tipo: 'veiculo', placa: '', chassi: '', modelo: '', ano: '', cor: '', motor: '', lote: '', situacao: '', uf: p.uf || 'AC', valor: '',
    fotos: [], novas: [], defeitos: [], obs: '', vistoriador: p.vistoriador || '' };
}

var S = {
  view: 'novo', reports: [], userId: undefined, user: null, urls: {}, exp: {},
  ft: 'todos', busca: '', openIds: {}, confirmDel: null, editId: null, editBase: null,
  uploading: false, draft: novo()
};

/* ---------- Supabase ---------- */
var cfg = window.APP_CONFIG || {};
var sb = null;
function mostrar(estado) {
  $('#setup').hidden = estado !== 'setup';
  $('#login').hidden = estado !== 'login';
  $('#app').hidden = estado !== 'app';
  $('#userbar').hidden = estado !== 'app';
}

var toastT = null;
function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4200); }

async function garantirUrls(paths) {
  var agora = Date.now();
  var falta = (paths || []).filter(function (p) { return p && (!S.urls[p] || S.exp[p] < agora); });
  for (var i = 0; i < falta.length; i += 50) {
    var res = await sb.storage.from(BUCKET).createSignedUrls(falta.slice(i, i + 50), 3600);
    if (res.error || !res.data) continue;
    res.data.forEach(function (x) { if (x.signedUrl) { S.urls[x.path] = x.signedUrl; S.exp[x.path] = Date.now() + 3300000; } });
  }
}
function urlFoto(p) { return S.urls[p] || ''; }
function descartar(paths) {
  paths = (paths || []).filter(Boolean);
  if (paths.length) sb.storage.from(BUCKET).remove(paths).then(function () {}, function () {});
}

async function carregar() {
  var r = await sb.from('veiculos').select('*').order('criado_em', { ascending: false });
  if (r.error) { toast('Não foi possível carregar a lista. Verifique a conexão.'); return; }
  S.reports = r.data || [];
  render();
  await garantirUrls(S.reports.map(function (x) { return x.fotos && x.fotos[0]; }));
  renderLista();
}

function aplicarSessao(session) {
  var id = session && session.user ? session.user.id : null;
  if (id === S.userId) return;
  S.userId = id; S.user = session ? session.user : null;
  if (!id) { S.reports = []; S.urls = {}; S.exp = {}; mostrar('login'); return; }
  $('#quem').textContent = S.user.email || '';
  mostrar('app'); preencher(); carregar();
}

function iniciar() {
  var semConfig = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY;
  if (semConfig || !window.supabase) {
    $('#setup-msg').innerHTML = semConfig
      ? 'O arquivo <strong>config.js</strong> publicado neste site está vazio. Abra o <strong>config.js</strong> no seu repositório do GitHub, confira se tem o endereço e a chave do Supabase, salve e aguarde um ou dois minutos. Depois atualize esta página com Ctrl+F5.'
      : 'A biblioteca do Supabase não carregou. Verifique a conexão com a internet e atualize a página com Ctrl+F5.';
    mostrar('setup'); return;
  }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange(function (ev, session) { setTimeout(function () { aplicarSessao(session); }, 0); });
  sb.auth.getSession().then(function (r) { aplicarSessao(r.data && r.data.session); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.userId) carregar(); });
}

$('#login').addEventListener('submit', async function (e) {
  e.preventDefault();
  var box = $('#l-erro'), btn = $('#l-btn');
  var email = $('#l-email').value.trim(), senha = $('#l-senha').value;
  if (!email || !senha) { box.textContent = 'Informe o e-mail e a senha.'; box.hidden = false; return; }
  box.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
  var r = await sb.auth.signInWithPassword({ email: email, password: senha });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (r.error) {
    box.textContent = /confirm/i.test(r.error.message) ? 'Este e-mail ainda não foi confirmado. Peça ao administrador para confirmar o usuário.' : 'E-mail ou senha incorretos.';
    box.hidden = false;
  } else { $('#l-senha').value = ''; }
});
$('#btn-sair').addEventListener('click', function () { sb.auth.signOut(); });

/* ---------- lista ---------- */
function render() {
  $('#c-rel').textContent = S.reports.length;
  $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-v') === S.view ? 'true' : 'false'); });
  $('#p-novo').hidden = S.view !== 'novo';
  $('#p-lista').hidden = S.view !== 'lista';
  $('#export').hidden = !S.reports.length;
  renderLista();
}

function card(r) {
  var t = TIPO[r.tipo] || TIPO.veiculo, fs = r.fotos || [], ds = r.defeitos || [];
  var open = S.openIds[r.id] ? ' open' : '';
  var capa = fs.length && urlFoto(fs[0]);
  var h = '<details class="rep" data-id="' + esc(r.id) + '"' + open + '><summary>' +
    '<div class="thumb">' + (capa ? '<img src="' + esc(capa) + '" alt="Foto de ' + esc(r.placa) + '" loading="lazy">' : (fs.length ? '…' : 'Sem foto')) + '</div>' +
    '<div class="rep-main"><div class="rep-line"><span class="plate-tag">' + esc(r.placa) + '</span><span class="pill t">' + t.nome + '</span>' + (r.lote ? '<span class="pill ok">Lote ' + esc(r.lote) + '</span>' : '') + '</div>' +
    '<div class="rep-desc">' + esc(r.modelo) + ' · ' + esc(r.ano) + '</div>' +
    '<div class="rep-meta num">' + (ds.length ? ds.length + ' defeito' + (ds.length > 1 ? 's' : '') : 'Sem defeitos aparentes') + ' · ' + fs.length + ' foto' + (fs.length === 1 ? '' : 's') + '</div></div></summary>';
  h += '<div class="rep-body"><dl class="kv"><div><dt>Chassi</dt><dd style="font-family:var(--font-mono);letter-spacing:.06em">' + esc(r.chassi) + '</dd></div>' +
    '<div><dt>Ano</dt><dd>' + esc(r.ano) + '</dd></div><div><dt>Cor</dt><dd>' + esc(r.cor || '—') + '</dd></div>' +
    '<div><dt>Motor</dt><dd style="font-family:var(--font-mono);letter-spacing:.06em">' + esc(r.motor || '—') + '</dd></div>' +
    '<div><dt>Situação</dt><dd>' + esc(r.situacao || '—') + '</dd></div><div><dt>UF</dt><dd>' + esc(r.uf || '—') + '</dd></div>' +
    '<div><dt>Valor inicial para conserto</dt><dd class="num">' + (r.valor_conserto == null ? '—' : 'R$ ' + fmtMoeda(r.valor_conserto)) + '</dd></div>' +
    '<div><dt>Vistoria</dt><dd>' + fmtData(r.data) + (r.vistoriador ? ' por ' + esc(r.vistoriador) : '') + '</dd></div></dl>';
  if (fs.length) h += '<div><h3 class="sub">Fotos</h3><div class="fotos">' + fs.map(function (p, i) {
    var u = urlFoto(p);
    return '<div class="foto">' + (u ? '<img src="' + esc(u) + '" alt="Foto ' + (i + 1) + ' de ' + esc(r.placa) + '" loading="lazy" data-zoom="' + esc(p) + '">' : '') + '</div>';
  }).join('') + '</div></div>';
  if (ds.length) h += '<div><h3 class="sub">Defeitos</h3><div class="defs">' + ds.map(function (d) {
    return '<div class="d-item"><div class="rep-line"><strong>' + esc(d.item) + '</strong><span class="pill g-' + esc(d.gravidade) + '">' + esc(GNOME[d.gravidade] || '') + '</span></div><p>' + esc(d.descricao) + '</p></div>';
  }).join('') + '</div></div>';
  if (r.obs) h += '<div><h3 class="sub">Observações</h3><p style="margin:0;overflow-wrap:anywhere;white-space:pre-wrap">' + esc(r.obs) + '</p></div>';
  h += '<div class="actions"><button type="button" class="btn sm primary" data-act="ficha" data-r="' + esc(r.id) + '">Gerar relatório (Excel)</button><button type="button" class="btn sm" data-act="editar" data-r="' + esc(r.id) + '">Editar</button>';
  if (r.criado_por === S.userId) {
    if (S.confirmDel === r.id) h += '<span>Excluir este cadastro?</span><button type="button" class="btn sm danger" data-act="del-ok" data-r="' + esc(r.id) + '">Sim, excluir</button><button type="button" class="btn sm ghost" data-act="del-no">Cancelar</button>';
    else h += '<button type="button" class="btn sm danger ghost" data-act="del" data-r="' + esc(r.id) + '">Excluir</button>';
  }
  return h + '</div></div></details>';
}

function filtrados() {
  var q = S.busca.trim().toLowerCase().replace(/[\s-]/g, '');
  return S.reports.filter(function (r) {
    if (S.ft !== 'todos' && r.tipo !== S.ft) return false;
    if (q) { var hay = ((r.placa || '') + (r.chassi || '') + (r.modelo || '') + (r.lote ? 'lote' + r.lote : '')).toLowerCase().replace(/[\s-]/g, ''); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
}
function descricaoFiltro() {
  var p = [];
  if (S.ft !== 'todos') p.push(S.ft === 'veiculo' ? 'somente veículos' : 'somente máquinas');
  if (S.busca.trim()) p.push('busca: "' + S.busca.trim() + '"');
  return p.join(' · ');
}
var gerando = false;
async function gerar(tipo, rid, btn) {
  if (gerando) return;
  if (!window.Relatorio) { toast('O gerador de relatório não carregou. Atualize a página com Ctrl+F5.'); return; }
  gerando = true;
  var rot = btn.textContent; btn.disabled = true;
  var ctx = { sb: sb, bucket: BUCKET, progresso: function (t) { btn.textContent = t; } };
  try {
    if (tipo === 'ficha') {
      var r = S.reports.find(function (x) { return x.id === rid; });
      if (!r) return;
      await window.Relatorio.ficha(r, ctx);
    } else {
      var lista = filtrados();
      if (!lista.length) { toast('Não há cadastros para o relatório.'); return; }
      await window.Relatorio.geral(lista, ctx, descricaoFiltro());
    }
    toast('Relatório gerado. Confira a pasta de downloads.');
  } catch (err) {
    toast('Não foi possível gerar o relatório. ' + (err && err.message ? err.message : ''));
  } finally { gerando = false; btn.disabled = false; btn.textContent = rot; }
}
function renderLista() {
  var q = S.busca.trim().toLowerCase().replace(/[\s-]/g, '');
  var rs = S.reports.filter(function (r) {
    if (S.ft !== 'todos' && r.tipo !== S.ft) return false;
    if (q) { var hay = ((r.placa || '') + (r.chassi || '') + (r.modelo || '')).toLowerCase().replace(/[\s-]/g, ''); if (hay.indexOf(q) < 0) return false; }
    return true;
  });
  var el = $('#lista');
  if (!S.reports.length) { el.innerHTML = '<div class="empty"><strong>Nada cadastrado ainda</strong>Os veículos e máquinas salvos aparecem aqui, do mais recente para o mais antigo.</div>'; return; }
  if (!rs.length) { el.innerHTML = '<div class="empty"><strong>Nada encontrado</strong>Ajuste a busca ou o filtro.</div>'; return; }
  el.innerHTML = rs.map(card).join('');
}

/* ---------- formulário ---------- */
function syncTipo() {
  var t = TIPO[S.draft.tipo];
  $$('#seg-tipo button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-t') === S.draft.tipo ? 'true' : 'false'); });
  $('#l-placa').textContent = t.placa; $('#f-placa').placeholder = t.ph; $('#f-modelo').placeholder = t.modelo;
  $('#hint-chassi').textContent = S.draft.tipo === 'veiculo' ? 'O chassi do veículo tem 17 letras e números, sem I, O e Q.' : 'Use o número de série gravado na máquina.';
}
function preencher() {
  var d = S.draft;
  $('#f-placa').value = d.placa; $('#f-chassi').value = d.chassi; $('#f-modelo').value = d.modelo; $('#f-ano').value = d.ano;
  $('#f-vistoriador').value = d.vistoriador; $('#f-obs').value = d.obs;
  $('#f-cor').value = d.cor; $('#f-motor').value = d.motor; $('#f-lote').value = d.lote;
  $('#f-situacao').value = d.situacao; $('#f-uf').value = d.uf; $('#f-valor').value = d.valor;
  syncTipo(); renderFotos(); renderDefeitos();
  var ae = $('#aviso-edit');
  if (S.editId) { ae.hidden = false; ae.textContent = 'Editando o cadastro de ' + ((S.editBase && S.editBase.placa) || '') + '. As alterações substituem o cadastro salvo.'; } else ae.hidden = true;
  $('#btn-enviar').textContent = S.editId ? 'Salvar alterações' : 'Salvar cadastro';
  $('#btn-limpar').textContent = S.editId ? 'Cancelar edição' : 'Limpar formulário';
}
$('#f-situacao').innerHTML = '<option value="">Selecione</option>' + SITUACOES.map(function (x) { return '<option>' + x + '</option>'; }).join('');
$('#f-uf').innerHTML = UFS.map(function (x) { return '<option>' + x + '</option>'; }).join('');
['f-valor'].forEach(function (id) {
  document.getElementById(id).addEventListener('blur', function (e) {
    var v = parseMoeda(e.target.value);
    if (v !== null && !isNaN(v)) { e.target.value = fmtMoeda(v); S.draft[CAMPOS[id]] = e.target.value; }
  });
});
var CAMPOS = { 'f-placa': 'placa', 'f-chassi': 'chassi', 'f-modelo': 'modelo', 'f-ano': 'ano', 'f-vistoriador': 'vistoriador', 'f-obs': 'obs',
  'f-cor': 'cor', 'f-motor': 'motor', 'f-lote': 'lote', 'f-situacao': 'situacao', 'f-uf': 'uf', 'f-valor': 'valor' };
Object.keys(CAMPOS).forEach(function (id) {
  var el = document.getElementById(id);
  var ev = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(ev, function () { S.draft[CAMPOS[id]] = el.value; el.removeAttribute('aria-invalid'); });
});
$('#seg-tipo').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-t]'); if (!b) return;
  S.draft.tipo = b.getAttribute('data-t'); syncTipo();
});

/* fotos */
function renderFotos() {
  var h = S.draft.fotos.map(function (p, i) {
    var u = urlFoto(p);
    return '<div class="foto">' + (u ? '<img src="' + esc(u) + '" alt="Foto ' + (i + 1) + '" data-zoom="' + esc(p) + '">' : '') +
      '<button type="button" class="rm" data-rmf="' + esc(p) + '" aria-label="Remover foto ' + (i + 1) + '">×</button></div>';
  }).join('');
  if (S.draft.fotos.length < MAX_FOTOS) h += '<label class="add-foto" for="f-camera"><strong>◉</strong>Tirar foto</label><label class="add-foto" for="f-fotos"><strong>+</strong>Escolher da galeria</label>';
  $('#fotos').innerHTML = h;
}
function redimensionar(file) {
  return new Promise(function (res, rej) {
    var u = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
async function enviarFotos(files) {
  if (!files.length) return;
  var vaga = MAX_FOTOS - S.draft.fotos.length;
  if (files.length > vaga) { files = files.slice(0, vaga); toast('Limite de ' + MAX_FOTOS + ' fotos por cadastro.'); }
  S.uploading = true; var falhas = 0, st = $('#foto-status');
  for (var i = 0; i < files.length; i++) {
    st.textContent = 'Enviando foto ' + (i + 1) + ' de ' + files.length + '…';
    try {
      var blob = await redimensionar(files[i]);
      var path = S.draft.id + '/' + uid() + '.jpg';
      var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      await garantirUrls([path]);
      S.draft.fotos.push(path); S.draft.novas.push(path); renderFotos();
    } catch (err) { falhas++; }
  }
  S.uploading = false;
  st.textContent = falhas ? (falhas + ' foto' + (falhas > 1 ? 's não foram enviadas' : ' não foi enviada') + '. Tente de novo.') : '';
}
['f-fotos', 'f-camera'].forEach(function (id) {
  document.getElementById(id).addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
    enviarFotos(files);
  });
});
$('#fotos').addEventListener('click', function (e) {
  var rm = e.target.closest('[data-rmf]');
  if (rm) { var p = rm.getAttribute('data-rmf'); S.draft.fotos = S.draft.fotos.filter(function (x) { return x !== p; }); renderFotos(); return; }
  var z = e.target.closest('[data-zoom]'); if (z) zoom(z.getAttribute('data-zoom'));
});
$('#lista').addEventListener('click', function (e) { var z = e.target.closest('[data-zoom]'); if (z) zoom(z.getAttribute('data-zoom')); });
function zoom(p) {
  var u = urlFoto(p); if (!u) return;
  var lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Foto ampliada');
  lb.innerHTML = '<img src="' + esc(u) + '" alt="Foto ampliada"><button type="button">Fechar</button>';
  function fechar() { document.removeEventListener('keydown', tecla); lb.remove(); }
  function tecla(ev) { if (ev.key === 'Escape') fechar(); }
  lb.addEventListener('click', fechar); document.addEventListener('keydown', tecla);
  document.body.appendChild(lb); lb.querySelector('button').focus();
}

/* defeitos */
function renderDefeitos() {
  var el = $('#defs'), ds = S.draft.defeitos;
  if (!ds.length) { el.innerHTML = ''; return; }
  el.innerHTML = ds.map(function (d, n) {
    var g = GRAV.find(function (x) { return x.k === d.gravidade; });
    return '<div class="def" data-id="' + d.id + '"><div class="def-head"><span class="tag">Defeito ' + (n + 1) + '</span><button type="button" class="btn sm ghost" data-rm="' + d.id + '">Remover</button></div>' +
      '<div class="field"><label for="di-' + d.id + '">Onde está</label><input type="text" id="di-' + d.id + '" data-f="item" value="' + esc(d.item) + '" placeholder="Ex.: Para-choque dianteiro" maxlength="80"></div>' +
      '<div class="field"><span class="lbl" id="dg-' + d.id + '">Gravidade</span><div class="seg" role="group" aria-labelledby="dg-' + d.id + '">' +
      GRAV.map(function (x) { return '<button type="button" data-g="' + x.k + '" aria-pressed="' + (d.gravidade === x.k ? 'true' : 'false') + '">' + x.n + '</button>'; }).join('') + '</div><p class="hint">' + esc(g ? g.d : '') + '</p></div>' +
      '<div class="field"><label for="dd-' + d.id + '">O que foi observado</label><textarea id="dd-' + d.id + '" data-f="descricao" placeholder="Descreva o problema com detalhes.">' + esc(d.descricao) + '</textarea></div></div>';
  }).join('');
}
$('#defs').addEventListener('input', function (e) {
  var f = e.target.getAttribute('data-f'); if (!f) return;
  var id = e.target.closest('.def').getAttribute('data-id');
  var d = S.draft.defeitos.find(function (x) { return x.id === id; }); if (d) { d[f] = e.target.value; e.target.removeAttribute('aria-invalid'); }
});
$('#defs').addEventListener('click', function (e) {
  var c = e.target.closest('.def'); if (!c) return; var id = c.getAttribute('data-id');
  if (e.target.closest('[data-rm]')) { S.draft.defeitos = S.draft.defeitos.filter(function (x) { return x.id !== id; }); renderDefeitos(); return; }
  var g = e.target.closest('[data-g]');
  if (g) {
    var d = S.draft.defeitos.find(function (x) { return x.id === id; }); d.gravidade = g.getAttribute('data-g'); renderDefeitos();
    var a = $('.def[data-id="' + id + '"] [data-g="' + d.gravidade + '"]'); if (a) a.focus();
  }
});
$('#btn-add-def').addEventListener('click', function () {
  var d = { id: uid(), item: '', gravidade: 'media', descricao: '' }; S.draft.defeitos.push(d); renderDefeitos();
  var el = document.getElementById('di-' + d.id); if (el) el.focus();
});

/* validação e envio */
function limpo(s) { return String(s).toUpperCase().replace(/[\s-]/g, ''); }
function validar() {
  var d = S.draft, erros = [];
  function bad(id, msg) { erros.push(msg); var el = document.getElementById(id); if (el) el.setAttribute('aria-invalid', 'true'); }
  var ch = limpo(d.chassi);
  if (!d.placa.trim()) bad('f-placa', 'Informe ' + (d.tipo === 'veiculo' ? 'a placa' : 'o prefixo ou a placa') + '.');
  if (!ch) bad('f-chassi', 'Informe o chassi.');
  else if (d.tipo === 'veiculo' && !/^[A-HJ-NPR-Z0-9]{17}$/.test(ch)) bad('f-chassi', 'O chassi do veículo deve ter 17 letras e números, sem I, O e Q.');
  else if (d.tipo === 'maquina' && !/^[A-Z0-9]{4,25}$/.test(ch)) bad('f-chassi', 'O número de série deve ter de 4 a 25 letras e números.');
  else if (S.reports.some(function (r) { return limpo(r.chassi) === ch && r.id !== S.editId; })) bad('f-chassi', 'Já existe um cadastro com este chassi. Abra-o na lista e use Editar.');
  if (!d.modelo.trim()) bad('f-modelo', 'Informe a marca e o modelo.');
  if (!/^(19|20)\d{2}(\s*\/\s*(19|20)\d{2})?$/.test(d.ano.trim())) bad('f-ano', 'Informe o ano com 4 dígitos, como 2021 ou 2020/2021.');
  if (!d.cor.trim()) bad('f-cor', 'Informe a cor.');
  if (!d.motor.trim()) bad('f-motor', 'Informe o número do motor.');
  if (!d.situacao) bad('f-situacao', 'Escolha a situação.');
  if (!d.uf) bad('f-uf', 'Escolha a UF.');
  var vc = parseMoeda(d.valor);
  if (vc === null) bad('f-valor', 'Informe o valor inicial para conserto.');
  else if (isNaN(vc) || vc < 0) bad('f-valor', 'Informe o valor inicial para conserto em reais, como 7.000,00.');
  if (!d.fotos.length) erros.push('Adicione ao menos uma foto.');
  if (!d.vistoriador.trim()) bad('f-vistoriador', 'Informe quem fez a vistoria.');
  d.defeitos.forEach(function (x) {
    if (!x.item.trim()) bad('di-' + x.id, 'Diga onde está o defeito.');
    if (!x.descricao.trim()) bad('dd-' + x.id, 'Descreva o defeito' + (x.item.trim() ? ' em ' + x.item.trim() : '') + '.');
  });
  if (S.uploading) erros.push('Aguarde o envio das fotos terminar.');
  return erros;
}

$('#p-novo').addEventListener('submit', async function (e) {
  e.preventDefault();
  var es = validar(), box = $('#erros');
  if (es.length) { box.innerHTML = '<strong>Revise antes de salvar:</strong><ul>' + es.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; box.hidden = false; box.scrollIntoView({ block: 'center' }); return; }
  box.hidden = true;
  var d = S.draft, base = S.editBase;
  var row = {
    tipo: d.tipo, placa: d.placa.trim().toUpperCase(), chassi: limpo(d.chassi), modelo: d.modelo.trim(), ano: d.ano.trim().replace(/\s/g, ''),
    cor: d.cor.trim(), motor: d.motor.trim().toUpperCase(), lote: d.lote.trim(), situacao: d.situacao, uf: d.uf,
    valor_conserto: parseMoeda(d.valor),
    fotos: d.fotos.slice(),
    defeitos: d.defeitos.map(function (x) { return { id: x.id, item: x.item.trim(), gravidade: x.gravidade, descricao: x.descricao.trim() }; }),
    obs: d.obs.trim(), vistoriador: d.vistoriador.trim(), atualizado_em: new Date().toISOString()
  };
  var btn = $('#btn-enviar'), rot = btn.textContent; btn.disabled = true; btn.textContent = 'Salvando…';
  var r;
  if (S.editId) r = await sb.from('veiculos').update(row).eq('id', S.editId).select('id');
  else { row.id = d.id; row.data = hoje(); r = await sb.from('veiculos').insert(row).select('id'); }
  btn.disabled = false; btn.textContent = rot;
  if (r.error) {
    toast(r.error.code === '23505' ? 'Já existe um cadastro com este chassi.' : 'Não foi possível salvar. Verifique a conexão e tente de novo.');
    return;
  }
  if (!r.data || !r.data.length) { toast('Seu usuário não tem permissão para alterar este cadastro.'); return; }
  var editou = !!S.editId;
  var antigas = base ? (base.fotos || []) : [];
  descartar(antigas.filter(function (p) { return d.fotos.indexOf(p) < 0; }));
  descartar(d.novas.filter(function (p) { return d.fotos.indexOf(p) < 0; }));
  savePrefs({ vistoriador: row.vistoriador, uf: row.uf });
  S.openIds[editou ? S.editId : d.id] = true;
  S.editId = null; S.editBase = null; S.draft = novo(); preencher();
  S.view = 'lista'; await carregar(); render();
  toast(editou ? 'Cadastro de ' + row.placa + ' atualizado.' : 'Cadastro de ' + row.placa + ' salvo.'); window.scrollTo(0, 0);
});
$('#btn-limpar').addEventListener('click', function () {
  descartar(S.draft.novas);
  S.editId = null; S.editBase = null; S.draft = novo(); preencher(); $('#erros').hidden = true;
  $$('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
});

/* abas, filtros, ações */
$('.tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; S.view = b.getAttribute('data-v'); render(); });
$('#busca').addEventListener('input', function (e) { S.busca = e.target.value; renderLista(); });
$('#chips-tipo').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-ft]'); if (!b) return; S.ft = b.getAttribute('data-ft');
  $$('#chips-tipo button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); renderLista();
});
async function acoes(e) {
  var b = e.target.closest('[data-act]'); if (!b) return;
  var act = b.getAttribute('data-act'), rid = b.getAttribute('data-r');
  if (act === 'editar') {
    var r = S.reports.find(function (x) { return x.id === rid; }); if (!r) return;
    await garantirUrls(r.fotos);
    S.editId = r.id; S.editBase = r;
    S.draft = { id: r.id, tipo: r.tipo, placa: r.placa, chassi: r.chassi, modelo: r.modelo, ano: r.ano,
      cor: r.cor || '', motor: r.motor || '', lote: r.lote || '', situacao: r.situacao || '', uf: r.uf || 'AC',
      valor: r.valor_conserto == null ? '' : fmtMoeda(r.valor_conserto), fotos: (r.fotos || []).slice(), novas: [],
      defeitos: (r.defeitos || []).map(function (x) { return { id: x.id, item: x.item, gravidade: x.gravidade, descricao: x.descricao }; }), obs: r.obs || '', vistoriador: r.vistoriador || '' };
    S.view = 'novo'; preencher(); render(); window.scrollTo(0, 0);
  } else if (act === 'del') { S.confirmDel = rid; renderLista(); }
  else if (act === 'del-no') { S.confirmDel = null; renderLista(); }
  else if (act === 'del-ok') {
    S.confirmDel = null;
    var rr = S.reports.find(function (x) { return x.id === rid; });
    var res = await sb.from('veiculos').delete().eq('id', rid).select('id');
    if (res.error) toast('Não foi possível excluir. Verifique a conexão.');
    else if (!res.data || !res.data.length) toast('Só quem fez o cadastro pode excluí-lo.');
    else { descartar(rr ? rr.fotos : []); toast('Cadastro excluído.'); await carregar(); }
    renderLista();
  } else if (act === 'ficha' || act === 'geral') { await gerar(act, rid, b);
  } else if (act === 'exportar') exportar();
  else if (act === 'atualizar') { await carregar(); toast('Lista atualizada.'); }
}
$('#p-lista').addEventListener('click', acoes);
$('#lista').addEventListener('toggle', function (e) {
  var d = e.target; if (d.tagName !== 'DETAILS') return; var id = d.getAttribute('data-id');
  if (d.open) {
    S.openIds = {}; S.openIds[id] = true;
    $$('details.rep[open]', $('#lista')).forEach(function (o) { if (o !== d) o.open = false; });
    var r = S.reports.find(function (x) { return x.id === id; });
    if (r) {
      var agora = Date.now();
      var falta = (r.fotos || []).some(function (p) { return !S.urls[p] || S.exp[p] < agora; });
      /* só redesenha quando faltava alguma foto; evita redesenhar em ciclo */
      if (falta) garantirUrls(r.fotos).then(function () { if (S.openIds[id]) renderLista(); });
    }
  } else if (S.openIds[id]) delete S.openIds[id];
}, true);

/* exportação */
function csv(rows) { return '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[";\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n'); }
function exportar() {
  if (!S.reports.length) return;
  var rows = [['Tipo', 'Placa', 'Chassi', 'Marca e modelo', 'Ano', 'Fotos', 'Defeitos', 'Observações', 'Vistoriador', 'Data da vistoria']];
  S.reports.forEach(function (r) {
    rows.push([(TIPO[r.tipo] || {}).nome, r.placa, r.chassi, r.modelo, r.ano, (r.fotos || []).length,
      (r.defeitos || []).map(function (d) { return d.item + ' (' + (GNOME[d.gravidade] || '') + '): ' + d.descricao; }).join(' | '), r.obs, r.vistoriador, fmtData(r.data)]);
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
  a.download = 'vistoria-leilao-' + hoje() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
}

iniciar();
})();
