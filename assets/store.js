/* NEXIO — camada de dados do protótipo (localStorage, compartilhada entre painel da equipe e portal do cliente) */
(function () {
  var KEY = 'nexio_portal_v1';
  var MAX_FILE = 1.5 * 1024 * 1024;
  function uid() { if (window.NX && NX.realMode && window.crypto && crypto.randomUUID) return crypto.randomUUID(); return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
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
    if (window.NX && NX.realMode) return { staff: [], clients: [], files: [], obligations: [], messages: [] };
    var s = seed(); save(s); return s;
  }
  function save(db) {
    if (window.NX && NX.beforeSave) { try { NX.beforeSave(db); } catch (e) { console.error(e); } }
    try { localStorage.setItem(KEY, JSON.stringify(db, (window.NX && NX.realMode) ? function (k, v) { return k === 'data' && typeof v === 'string' && v.indexOf('data:') === 0 ? undefined : v; } : undefined)); return true; }
    catch (e) { alertBox('Espaço do protótipo cheio. Exclua arquivos grandes ou use “Restaurar dados de exemplo”.'); return false; }
  }
  function alertBox(msg) { if (window.NX && NX.toast) NX.toast(msg); }

  // obrigações do mês para um cliente
  function catalogFor(db, c) {
    if (!db.procT || !c) return [];
    if (c.obrig) return db.procT.filter(function (tp) { return c.obrig.indexOf(tp.id) > -1; });
    var p = (c.plano || '').toUpperCase(), k = /MEI/.test(p) ? 'MEI' : /PF/.test(p) ? 'PF' : 'SN';
    return db.procT.filter(function (tp) { return (tp.planos || []).indexOf(k) > -1; });
  }
  function obligationsFor(db, clienteId, month) {
    var out = [], c = (db.clients || []).filter(function (x) { return x.id === clienteId; })[0], cat = catalogFor(db, c), mm = +month.slice(5);
    cat.forEach(function (tp) {
      var ok = tp.per === 'trimestral' ? (mm % 3 === 1) : tp.per === 'anual' ? (mm === tp.mes) : true; if (!ok) return;
      var last = new Date(+month.slice(0, 4), mm, 0).getDate();
      out.push({ id: tp.id, titulo: tp.titulo, data: month + '-' + String(Math.min(tp.venc, last)).padStart(2, '0'), desc: tp.setor, geral: false });
    });
    var hasCat = cat.length > 0;
    db.obligations.forEach(function (o) {
      if (o.cliente !== '*' && o.cliente !== clienteId) return;
      if (hasCat && o.cliente === '*') return;
      var date = o.recorrente ? month + '-' + String(Math.min(o.dia, 28)).padStart(2, '0') : o.data;
      if (date && date.slice(0, 7) === month) out.push({ id: o.id, titulo: o.titulo, data: date, desc: o.desc, geral: o.cliente === '*' });
    });
    return out.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  }

  function readFile(file, cb) {
    if (file.size > ((window.NX && NX.realMode) ? 25 * 1024 * 1024 : MAX_FILE)) { alertBox((window.NX && NX.realMode) ? 'Cada arquivo pode ter até 25 MB.' : 'No protótipo, cada arquivo pode ter até 1,5 MB.'); return; }
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
    if (f.situacao) return { t: f.situacao, c: ({ 'Concluído': 'ok', 'Pendente': 'warn', 'Em análise': 'info', 'Substituído': 'info', 'Cancelado': 'bad' })[f.situacao] || 'info' };
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

  window.NX = { useKey: function (k) { KEY = k; }, catalogFor: catalogFor, KEY: KEY, load: load, save: save, seed: seed, uid: uid, today: today, ym: ym, obligationsFor: obligationsFor, readFile: readFile, download: download, brl: brl, fdate: fdate, fcomp: fcomp, ftime: ftime, esc: esc, fsize: fsize, statusOf: statusOf, toast: toast, monthLabel: monthLabel, shiftMonth: shiftMonth, calendarHTML: calendarHTML };
  // sincroniza entre abas (equipe e cliente abertos ao mesmo tempo)
  window.addEventListener('storage', function (e) { if (e.key === KEY && typeof window.NX_onSync === 'function') window.NX_onSync(); });
})();
/* ---- menu lateral recolhível + visualizador de documentos (compartilhado) ---- */
(function(){
  function isMin(){try{return localStorage.getItem('nx_side_min')==='1';}catch(e){return false;}}
  var IC={'Conteúdos':'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5','Blog':'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5','Financeiro dos clientes':'M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M2 10l10-6 10 6','Contratos e honorários':'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 17c1-2 2-2 3 0s2 2 3 0','Contrato e faturas':'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 17c1-2 2-2 3 0s2 2 3 0','Reuniões e atas':'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6','Início':'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z','Painel':'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z','Clientes':'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
   'Documentos':'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','Obrigações':'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4',
   'Notas fiscais':'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6','Controle financeiro':'M4 19V5M4 19h16M8 15l4-4 3 3 5-6','Mensagens':'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
   'Processos':'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M9 13l2 2 4-4','Configurações':'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z','Usuários':'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6','Controle contábil':'M4 4h16v16H4zM4 9h16M9 9v11M14 9v11','Guias em lote':'M4 4h10l6 6v10H4zM14 4v6h6M8 14h8M8 17h5','Notificações':'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0','Privacidade (LGPD)':'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4','Clientes (sistema real)':'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1','Comunicações':'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12','Agenda da equipe':'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3'};
  function svg(d,sz){return '<svg width="'+(sz||20)+'" height="'+(sz||20)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';}
  var TOG='M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 5v14';
  NX.sideToggleHTML=function(){return '<button class="side-toggle" id="sideT" title="'+(isMin()?'Expandir menu':'Recolher menu')+'" aria-label="'+(isMin()?'Expandir menu':'Recolher menu')+'" aria-expanded="'+(!isMin())+'">'+svg(TOG,18)+'</button>';};
  NX.applySide=function(){var app=document.querySelector('.app');if(!app)return;app.classList.toggle('min',isMin());
    app.querySelectorAll('.side a.nav').forEach(function(a){if(a.querySelector('.lbl'))return;var cnt=a.querySelector('.cnt');var txt=[].slice.call(a.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.textContent;}).join('').trim();
      [].slice.call(a.childNodes).forEach(function(n){if(n.nodeType===3)a.removeChild(n);});
      var w=document.createElement('span');w.className='ni';w.innerHTML=svg(IC[txt]||IC['Documentos']);a.insertBefore(w,a.firstChild);
      var s=document.createElement('span');s.className='lbl';s.textContent=txt;a.insertBefore(s,cnt||null);a.title=txt;});
    var b=document.getElementById('sideT');if(b)b.onclick=function(){try{localStorage.setItem('nx_side_min',isMin()?'0':'1');}catch(e){}NX.applySide();var m=isMin();b.title=b.ariaLabel=m?'Expandir menu':'Recolher menu';b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(!m));};};
  NX.blobUrl=function(d){try{var p=d.split(','),mime=(p[0].match(/:(.*?);/)||[])[1]||'application/octet-stream',bin=atob(p[1]),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([u],{type:mime}));}catch(e){return null;}};
  NX.uploader=function(f,db){if(f.por)return f.por;if(f.de==='cliente'){var c=(db.clients||[]).filter(function(x){return x.id===f.cliente;})[0];return c?(c.resp||c.nome):'Cliente';}return 'Equipe NEXIO';};
  /* ctx: {db, path, actions:[{label,cls,fn}], onClose} */
  NX.viewer=function(f,ctx){var e=NX.esc,dlg=document.getElementById('nxv');if(!dlg){dlg=document.createElement('dialog');dlg.id='nxv';dlg.className='nxv';document.body.appendChild(dlg);}
    var prev,url=null,ext=(f.nome.split('.').pop()||'').toLowerCase();
    if(!f.data)prev='<div class="empty" style="max-width:340px"><p style="font-size:40px;margin:0">📄</p><p>Arquivo de exemplo, sem conteúdo real no protótipo.</p></div>';
    else{url=NX.blobUrl(f.data);if(/^(png|jpe?g|gif|webp)$/.test(ext))prev='<img src="'+url+'" alt="'+e(f.titulo)+'">';else if(/^(pdf|txt|xml|csv|html?)$/.test(ext))prev='<iframe src="'+url+'" title="Pré-visualização de '+e(f.titulo)+'"></iframe>';else prev='<div class="empty"><p>Pré-visualização não disponível para arquivos .'+e(ext)+'.</p><p class="help">Use o botão Baixar.</p></div>';}
    var h=(f.hist||[]),views=h.filter(function(x){return /visualiz/i.test(x.ev);}),dls=h.filter(function(x){return /baixad/i.test(x.ev);});
    var st=NX.statusOf(f),anexo=(h.filter(function(x){return /enviad|recebid/i.test(x.ev);})[0]||{}).em;
    dlg.innerHTML='<div class="nxv-wrap"><div class="nxv-prev">'+prev+'</div><div class="nxv-side"><div class="row between" style="align-items:flex-start"><h2>'+e(f.titulo)+'</h2><button class="btn b-text" id="nxvx" aria-label="Fechar">✕</button></div>'+
      '<div class="row">'+(ctx.actions||[]).map(function(a,i){return '<button class="btn '+(a.cls||'b-line')+'" data-a="'+i+'">'+e(a.label)+'</button>';}).join('')+'</div>'+
      '<dl class="kv"><dt>Situação</dt><dd><span class="tag '+st.c+'">'+st.t+'</span></dd><dt>Pasta</dt><dd>'+e(ctx.path||'—')+'</dd><dt>Competência</dt><dd>'+NX.fcomp(f.comp)+'</dd><dt>Vencimento</dt><dd>'+NX.fdate(f.venc)+'</dd>'+(f.valor?'<dt>Valor</dt><dd>'+NX.brl(f.valor)+'</dd>':'')+
      '<dt>Anexado por</dt><dd>'+e(NX.uploader(f,ctx.db))+'</dd><dt>Anexado em</dt><dd>'+(anexo?NX.ftime(anexo):NX.fdate(f.criado))+'</dd><dt>Arquivo</dt><dd>'+e(f.nome)+(f.size?' · '+NX.fsize(f.size):'')+'</dd>'+
      '<dt>Visualizado</dt><dd>'+(views.length?views.map(function(v){return e(v.por||'—')+' em '+NX.ftime(v.em);}).join('<br>'):(f.visto&&f.de==='equipe'?'Sim':'Ainda não'))+'</dd><dt>Downloads</dt><dd>'+(dls.length?dls.length+' (último: '+e(dls[dls.length-1].por||'')+', '+NX.ftime(dls[dls.length-1].em)+')':'Nenhum')+'</dd></dl>'+
      '<div><h3 style="font-size:15px;margin-bottom:6px">Comentários</h3><div class="chat" style="max-height:200px">'+((f.coments||[]).length?f.coments.map(function(m){var mine=m.de===ctx.me;return '<div class="msg '+(mine?'me':'them')+'">'+e(m.texto)+'<small>'+e(m.autor)+' · '+NX.ftime(m.em)+'</small></div>';}).join(''):'<p class="help">Nenhum comentário.</p>')+'</div>'+
      (ctx.onComment?'<form id="nxvc" class="chat-form"><label class="sr" for="nxvt">Comentário</label><input id="nxvt" placeholder="Escreva um comentário…"><button class="btn b-blue">Enviar</button></form>':'')+'</div>'+
      '<details><summary style="font-size:14px">Histórico completo ('+h.length+')</summary>'+h.slice().reverse().map(function(x){return '<div class="list-item" style="font-size:13px"><span>'+e(x.ev)+(x.por?' · '+e(x.por):'')+'</span><small>'+NX.ftime(x.em)+'</small></div>';}).join('')+'</details></div></div>';
    function close(){dlg.close();}
    dlg.onclose=function(){if(url)URL.revokeObjectURL(url);if(ctx.onClose)ctx.onClose();};
    dlg.querySelector('#nxvx').onclick=close;
    dlg.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){var a=ctx.actions[+b.getAttribute('data-a')];if(a.fn(f)!==false&&a.close!==false)close();};});
    var cf=dlg.querySelector('#nxvc');if(cf)cf.onsubmit=function(ev){ev.preventDefault();var t=dlg.querySelector('#nxvt').value.trim();if(!t)return;ctx.onComment(f,t);dlg.onclose=null;if(url)URL.revokeObjectURL(url);NX.viewer(f,ctx);};
    if(!dlg.open)dlg.showModal();
  };
})();
/* ---- níveis de usuário + registro de acessos ---- */
(function(){
  NX.NIV_EQ={admin:{nome:'Administrador',desc:'Acesso total, usuários, indicadores de toda a equipe, catálogo'},
    gestor:{nome:'Gestor de setor',desc:'Tudo do seu setor: demandas, responsáveis, indicadores e documentos do setor'},
    analista:{nome:'Analista',desc:'Clientes da sua carteira, envia documentos, atualiza as próprias demandas'},
    atendimento:{nome:'Atendimento / Comercial',desc:'Cadastra clientes, mensagens e comunicações; sem documentos restritos'},
    assistente:{nome:'Assistente / Estagiário',desc:'Consulta e envia documentos; não dá baixa, não exclui, não muda status'}};
  NX.NIV_CLI={titular:{nome:'Titular',desc:'Acesso total ao portal e gestão dos usuários da empresa'},
    financeiro:{nome:'Financeiro',desc:'Guias, pagamentos, controle financeiro, notas e documentos fiscais/contábeis (sem DP)'},
    rh:{nome:'RH / Pessoal',desc:'Somente documentos do Departamento Pessoal e mensagens'},
    notas:{nome:'Emissor de notas',desc:'Somente emissão e consulta de notas fiscais'},
    consulta:{nome:'Consulta',desc:'Somente visualizar e baixar'}};
  NX.log=function(db,o){db.acessos=db.acessos||[];o.em=new Date().toISOString();db.acessos.push(o);if(db.acessos.length>3000)db.acessos.splice(0,db.acessos.length-3000);};
  NX.ensureUsers=function(db){var ch=false;
    (db.staff||[]).forEach(function(s,i){if(!s.nivel){s.nivel=i===0?'admin':(s.id==='eq2'?'analista':(s.id==='eq3'?'gestor':'analista'));if(s.id==='eq2')s.setor='Fiscal';if(s.id==='eq3')s.setor='Contábil';s.carteira=s.carteira||[];ch=true;}});
    if(!db.usersV){db.usersV=1;ch=true;
      if(!db.staff.some(function(s){return s.id==='eq4';}))db.staff.push({id:'eq4',nome:'Atendimento',email:'atendimento@nexioic.com.br',cargo:'Atendimento',nivel:'atendimento',cor:'#0E7490',carteira:[],diretor:false,gcal:''});
      if(!db.staff.some(function(s){return s.id==='eq5';}))db.staff.push({id:'eq5',nome:'Estagiário DP',email:'estagio@nexioic.com.br',cargo:'Estagiário',nivel:'assistente',setor:'Departamento Pessoal',cor:'#B45309',carteira:[],diretor:false,gcal:''});
      db.cusers=db.cusers||[];var cs=db.clients||[];
      cs.forEach(function(c){if(c.email&&!db.cusers.some(function(u){return u.email===c.email;}))db.cusers.push({id:NX.uid(),nome:c.resp||c.nome,email:c.email,senha:c.senha||'1234',nivel:'titular',empresas:[c.id]});});
      if(cs[0]){db.cusers.push({id:NX.uid(),nome:'Financeiro da Clínica',email:'fin@clinicaexemplo.com.br',senha:'1234',nivel:'financeiro',empresas:[cs[0].id]});
        db.cusers.push({id:NX.uid(),nome:'RH da Clínica',email:'rh@clinicaexemplo.com.br',senha:'1234',nivel:'rh',empresas:[cs[0].id]});}
      if(cs[0]&&cs[2])db.cusers.push({id:NX.uid(),nome:'Grupo Saúde (multiempresas)',email:'grupo@exemplo.com',senha:'1234',nivel:'titular',empresas:[cs[0].id,cs[2].id]});
    }
    return ch;};
})();
/* cadastro de vários usuários de uma vez (painel e portal) */
NX.multiUserForm=function(){var row=function(i){return '<div class="mu-row" style="display:grid;grid-template-columns:1.2fr 1.4fr .8fr 1fr auto;gap:8px;align-items:end"><label>Nome<input name="n'+i+'"></label><label>E-mail<input name="m'+i+'" type="email"></label><label>Senha<input name="s'+i+'" value="1234"></label><label>Nível<select name="l'+i+'">'+Object.keys(NX.NIV_CLI).map(function(k){return '<option value="'+k+'"'+(k==='consulta'?' selected':'')+'>'+NX.NIV_CLI[k].nome+'</option>';}).join('')+'</select></label><button type="button" class="btn b-text mu-rm" aria-label="Remover linha" style="color:var(--bad)">✕</button></div>';};
  return {html:'<div id="mu" style="display:flex;flex-direction:column;gap:8px">'+row(0)+row(1)+'</div><button type="button" class="btn b-line" id="muAdd" style="align-self:flex-start">+ Adicionar outra pessoa</button>',
    bind:function(root){var n=2,box=root.querySelector('#mu');root.querySelector('#muAdd').onclick=function(){box.insertAdjacentHTML('beforeend',row(n++));};box.onclick=function(ev){if(ev.target.classList.contains('mu-rm')&&box.children.length>1)ev.target.closest('.mu-row').remove();};},
    read:function(fd){var out=[];for(var i=0;i<100;i++){var nm=String(fd.get('n'+i)||'').trim(),em=String(fd.get('m'+i)||'').trim();if(!nm&&!em)continue;if(!nm||!/^\S+@\S+\.\S+$/.test(em))return {erro:'Preencha nome e um e-mail válido em todas as linhas usadas.'};out.push({nome:nm,email:em,senha:String(fd.get('s'+i)||'1234'),nivel:fd.get('l'+i)});}return out.length?{lista:out}:{erro:'Informe pelo menos uma pessoa.'};},
    save:function(db,lista,cid){var novos=0,vinc=0;lista.forEach(function(p){var ex=(db.cusers||[]).filter(function(x){return x.email.toLowerCase()===p.email.toLowerCase();})[0];
      if(ex){if(ex.empresas.indexOf(cid)<0){ex.empresas.push(cid);vinc++;}}else{db.cusers.push({id:NX.uid(),nome:p.nome,email:p.email,senha:p.senha,nivel:p.nivel,empresas:[cid]});novos++;}});return {novos:novos,vinc:vinc};}};
};
/* ---- tributação (Simples Nacional: anexos e fator R), licenças e notificações ---- */
(function(){
  // [limite superior da faixa RBT12, alíquota nominal %, parcela a deduzir R$] — LC 123/2006
  NX.ANEXOS={
    'I':[[180000,4,0],[360000,7.3,5940],[720000,9.5,13860],[1800000,10.7,22500],[3600000,14.3,87300],[4800000,19,378000]],
    'II':[[180000,4.5,0],[360000,7.8,5940],[720000,10,13860],[1800000,11.2,22500],[3600000,14.7,85500],[4800000,30,720000]],
    'III':[[180000,6,0],[360000,11.2,9360],[720000,13.5,17640],[1800000,16,35640],[3600000,21,125640],[4800000,33,648000]],
    'IV':[[180000,4.5,0],[360000,9,8100],[720000,10.2,12420],[1800000,14,39780],[3600000,22,183780],[4800000,33,828000]],
    'V':[[180000,15.5,0],[360000,18,4500],[720000,19.5,9900],[1800000,20.5,17100],[3600000,23,62100],[4800000,30.5,540000]]};
  NX.REGIMES={MEI:'MEI',SN:'Simples Nacional',LP:'Lucro Presumido',LR:'Lucro Real',PF:'Pessoa Física (carnê-leão)'};
  /* t = {regime, anexo, fatorR:bool, rbt12, folha12} -> {anexo, fatorR, aliqEfetiva, faixa} */
  NX.calcSimples=function(t){if(!t||t.regime!=='SN'||!(t.rbt12>0))return null;var anexo=t.anexo||'III',fr=null;
    if(t.fatorR){fr=(t.folha12||0)/t.rbt12;anexo=fr>=0.28?'III':'V';}
    var tab=NX.ANEXOS[anexo];if(!tab)return null;var i=0;while(i<tab.length-1&&t.rbt12>tab[i][0])i++;var f=tab[i];
    var ef=((t.rbt12*f[1]/100)-f[2])/t.rbt12*100;return {anexo:anexo,fatorR:fr,aliq:Math.max(ef,0),faixa:i+1,nominal:f[1],deduzir:f[2]};};
  NX.LICENCAS=['Alvará de funcionamento','Alvará sanitário (Vigilância Sanitária)','Registro no conselho de classe (CRM/CRO/CREFITO)','Certificado do Corpo de Bombeiros','Licença ambiental','Certificado digital (e-CNPJ A1)','Outro'];
  NX.licStatus=function(v){if(!v)return {t:'Sem validade',c:'info'};var d=Math.round((new Date(v+'T12:00:00')-new Date())/864e5);if(d<0)return {t:'Vencida há '+(-d)+' dia(s)',c:'bad'};if(d<=30)return {t:'Vence em '+d+' dia(s)',c:'warn'};return {t:'Vigente',c:'ok'};};
  /* notificações: grava no portal + simula e-mail conforme preferências do cliente */
  NX.EVENTOS={doc:'Novo documento ou guia',venc:'Lembrete de vencimento',vencida:'Guia vencida',comunicado:'Comunicado do escritório',msg:'Nova mensagem',licenca:'Licença ou certificado vencendo',nota:'Nota fiscal emitida'};
  NX.notify=function(db,cid,ev,titulo,texto,link){db.notifs=db.notifs||[];db.notifCfg=db.notifCfg||{regras:{doc:1,venc:1,vencida:1,comunicado:1,msg:1,licenca:1,nota:1},dias:3};
    if(!db.notifCfg.regras[ev])return null;var c=(db.clients||[]).filter(function(x){return x.id===cid;})[0];if(!c)return null;
    var pref=c.notifPref||{portal:true,email:true,whats:false},canais=['portal'].concat(pref.email?['email']:[]);
    var n={id:NX.uid(),cliente:cid,ev:ev,titulo:titulo,texto:texto||'',link:link||'',em:new Date().toISOString(),lida:false,canais:canais,status:'enviado (simulação)'};
    db.notifs.push(n);if(db.notifs.length>3000)db.notifs.splice(0,db.notifs.length-3000);return n;};
  /* lembretes automáticos de vencimento (rodar ao abrir o painel/portal) */
  NX.runReminders=function(db){db.notifCfg=db.notifCfg||{regras:{doc:1,venc:1,vencida:1,comunicado:1,msg:1,licenca:1,nota:1},dias:3};var t=NX.today(),lim=new Date();lim.setDate(lim.getDate()+(db.notifCfg.dias||3));lim=lim.toISOString().slice(0,10);var n=0;
    (db.files||[]).forEach(function(f){if(f.deleted||f.tipo!=='Guia'||f.status==='pago'||!f.venc)return;f.lemb=f.lemb||{};
      if(f.venc>=t&&f.venc<=lim&&!f.lemb.venc){if(NX.notify(db,f.cliente,'venc','Guia vence em '+NX.fdate(f.venc),f.titulo+(f.valor?' — '+NX.brl(f.valor):''),'#/arquivos'))n++;f.lemb.venc=1;}
      if(f.venc<t&&!f.lemb.vencida){if(NX.notify(db,f.cliente,'vencida','Guia vencida',f.titulo+' venceu em '+NX.fdate(f.venc)+'. Fale com a NEXIO para emitir uma nova.','#/arquivos'))n++;f.lemb.vencida=1;}});
    (db.clients||[]).forEach(function(c){(c.licencas||[]).forEach(function(l){var s=NX.licStatus(l.validade);l.lemb=l.lemb||{};if((s.c==='warn'||s.c==='bad')&&!l.lemb[s.c]){if(NX.notify(db,c.id,'licenca',l.tipo+': '+s.t,'Providencie a renovação. Validade: '+NX.fdate(l.validade),'#/config'))n++;l.lemb[s.c]=1;}});});
    return n;};
})();
