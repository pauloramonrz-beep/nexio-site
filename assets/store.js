/* NEXIO — camada de dados do protótipo (localStorage, compartilhada entre painel da equipe e portal do cliente) */
(function () {
  var KEY = 'nexio_portal_v1';
  var MAX_FILE = 1.5 * 1024 * 1024;
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function ym(d) { return (d || today()).slice(0, 7); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  function seed() {
    var c1 = uid(), c2 = uid(), c3 = uid(), m = ym();
    var d = function (day) { return m + '-' + String(day).padStart(2, '0'); };
    return {
      staff: [{ id: 'eq1', nome: 'Paulo', email: 'paulo@nexioic.com.br' }, { id: 'eq2', nome: 'Equipe Fiscal', email: 'fiscal@nexioic.com.br' }],
      clients: [
        { id: c1, nome: 'Clínica Exemplo Ltda', doc: '00.000.000/0001-00', plano: 'NEXIO SN PRO', email: 'financeiro@clinicaexemplo.com.br', resp: 'Dra. Ana Souza', tel: '(11) 90000-0001', senha: '1234', criado: today() },
        { id: c2, nome: 'João Silva MEI', doc: '11.111.111/0001-11', plano: 'NEXIO MEI PRO', email: 'joao@email.com', resp: 'João Silva', tel: '(11) 90000-0002', senha: '1234', criado: today() },
        { id: c3, nome: 'Dr. Carlos Lima', doc: '000.000.000-00', plano: 'NEXIO PF PREMIUM', email: 'carlos@email.com', resp: 'Carlos Lima', tel: '(11) 90000-0003', senha: '1234', criado: today() }
      ],
      files: [
        { id: uid(), cliente: c1, tipo: 'Guia', titulo: 'DAS — Simples Nacional', comp: m, venc: d(20), valor: 712.35, status: 'pendente', de: 'equipe', nome: 'DAS_exemplo.pdf', data: null, size: 0, criado: today(), visto: false },
        { id: uid(), cliente: c1, tipo: 'Guia', titulo: 'FGTS Digital', comp: m, venc: d(20), valor: 248.00, status: 'pendente', de: 'equipe', nome: 'FGTS_exemplo.pdf', data: null, size: 0, criado: today(), visto: true },
        { id: uid(), cliente: c1, tipo: 'Relatório', titulo: 'Balancete mensal', comp: m, venc: '', valor: 0, status: 'disponivel', de: 'equipe', nome: 'Balancete_exemplo.pdf', data: null, size: 0, criado: today(), visto: false },
        { id: uid(), cliente: c1, tipo: 'Documento', titulo: 'Extrato bancário', comp: m, venc: '', valor: 0, status: 'recebido', de: 'cliente', nome: 'extrato_itau.ofx', data: null, size: 0, criado: today(), visto: false },
        { id: uid(), cliente: c2, tipo: 'Guia', titulo: 'DAS-MEI', comp: m, venc: d(20), valor: 81.05, status: 'pendente', de: 'equipe', nome: 'DASMEI_exemplo.pdf', data: null, size: 0, criado: today(), visto: false },
        { id: uid(), cliente: c3, tipo: 'Guia', titulo: 'DARF Carnê-Leão', comp: m, venc: addDays(-2), valor: 1320.50, status: 'pendente', de: 'equipe', nome: 'DARF_exemplo.pdf', data: null, size: 0, criado: today(), visto: true }
      ],
      obligations: [
        { id: uid(), cliente: '*', titulo: 'DAS — Simples Nacional', dia: 20, recorrente: true, data: '', desc: 'Pagamento mensal do Simples Nacional' },
        { id: uid(), cliente: '*', titulo: 'FGTS Digital', dia: 20, recorrente: true, data: '', desc: 'Recolhimento do FGTS' },
        { id: uid(), cliente: '*', titulo: 'Envio de extratos e notas', dia: 5, recorrente: true, data: '', desc: 'Envie os extratos bancários e notas do mês anterior' },
        { id: uid(), cliente: c3, titulo: 'Carnê-Leão', dia: 0, recorrente: false, data: addDays(-2), desc: 'DARF do carnê-leão' }
      ],
      messages: [
        { id: uid(), cliente: c1, de: 'cliente', autor: 'Dra. Ana Souza', texto: 'Bom dia! Já enviei o extrato deste mês pelo portal.', em: new Date(Date.now() - 3600e3 * 5).toISOString(), lida: true },
        { id: uid(), cliente: c1, de: 'equipe', autor: 'Paulo', texto: 'Recebido, Dra. Ana! A guia do DAS já está disponível na aba Guias.', em: new Date(Date.now() - 3600e3 * 4).toISOString(), lida: true },
        { id: uid(), cliente: c1, de: 'cliente', autor: 'Dra. Ana Souza', texto: 'Perfeito. Preciso contratar uma secretária, como faço?', em: new Date(Date.now() - 3600e3).toISOString(), lida: false },
        { id: uid(), cliente: c3, de: 'cliente', autor: 'Carlos Lima', texto: 'Quanto vou pagar de carnê-leão este mês?', em: new Date(Date.now() - 3600e3 * 2).toISOString(), lida: false }
      ]
    };
  }

  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.clients) return d; } catch (e) {}
    var s = seed(); save(s); return s;
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { alertBox('Espaço do protótipo cheio. Exclua arquivos grandes ou use “Restaurar dados de exemplo”.'); return false; }
  }
  function alertBox(msg) { if (window.NX && NX.toast) NX.toast(msg); }

  // obrigações do mês para um cliente
  function obligationsFor(db, clienteId, month) {
    var out = [];
    db.obligations.forEach(function (o) {
      if (o.cliente !== '*' && o.cliente !== clienteId) return;
      var date = o.recorrente ? month + '-' + String(Math.min(o.dia, 28)).padStart(2, '0') : o.data;
      if (date && date.slice(0, 7) === month) out.push({ id: o.id, titulo: o.titulo, data: date, desc: o.desc, geral: o.cliente === '*' });
    });
    return out.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  }

  function readFile(file, cb) {
    if (file.size > MAX_FILE) { alertBox('No protótipo, cada arquivo pode ter até 1,5 MB.'); return; }
    var r = new FileReader();
    r.onload = function () { cb({ nome: file.name, data: r.result, size: file.size }); };
    r.readAsDataURL(file);
  }
  function download(f) {
    if (!f.data) { alertBox('Arquivo de exemplo (sem conteúdo real no protótipo).'); return; }
    var a = document.createElement('a'); a.href = f.data; a.download = f.nome; document.body.appendChild(a); a.click(); a.remove();
  }

  var brl = function (n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var fdate = function (iso) { if (!iso) return '—'; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var fcomp = function (m) { if (!m) return '—'; var p = m.split('-'); return p[1] + '/' + p[0]; };
  var ftime = function (iso) { var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fsize = function (b) { return !b ? '' : b < 1024 * 1024 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; };
  function statusOf(f) {
    if (f.tipo === 'Nota fiscal') return { t: 'Nota emitida', c: 'ok' };
    if (f.tipo !== 'Guia') return f.de === 'cliente' ? { t: 'Enviado pelo cliente', c: 'info' } : { t: 'Disponível', c: 'info' };
    if (f.status === 'pago') return { t: 'Pago', c: 'ok' };
    if (f.venc && f.venc < today()) return { t: 'Vencida', c: 'bad' };
    return { t: 'A pagar', c: 'warn' };
  }
  function toast(m) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(function () { t.style.display = 'none'; }, 2800);
  }
  function monthLabel(m) { var p = m.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
  function shiftMonth(m, n) { var p = m.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function calendarHTML(month, events) {
    var p = month.split('-'), first = new Date(+p[0], +p[1] - 1, 1), days = new Date(+p[0], +p[1], 0).getDate(), start = first.getDay(), t = today(), h = '';
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(function (w) { h += '<div class="cal-h">' + w + '</div>'; });
    for (var i = 0; i < start; i++) h += '<div class="cal-d empty"></div>';
    for (var d = 1; d <= days; d++) {
      var iso = month + '-' + String(d).padStart(2, '0');
      var ev = events.filter(function (e) { return e.data === iso; });
      h += '<div class="cal-d' + (iso === t ? ' today' : '') + '"><span>' + d + '</span>' + ev.map(function (e) { return '<i class="ev ' + (e.cls || '') + '" title="' + esc(e.titulo) + '">' + esc(e.titulo) + '</i>'; }).join('') + '</div>';
    }
    return '<div class="cal">' + h + '</div>';
  }

  window.NX = { KEY: KEY, load: load, save: save, seed: seed, uid: uid, today: today, ym: ym, obligationsFor: obligationsFor, readFile: readFile, download: download, brl: brl, fdate: fdate, fcomp: fcomp, ftime: ftime, esc: esc, fsize: fsize, statusOf: statusOf, toast: toast, monthLabel: monthLabel, shiftMonth: shiftMonth, calendarHTML: calendarHTML };
  // sincroniza entre abas (equipe e cliente abertos ao mesmo tempo)
  window.addEventListener('storage', function (e) { if (e.key === KEY && typeof window.NX_onSync === 'function') window.NX_onSync(); });
})();
