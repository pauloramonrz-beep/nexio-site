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
/* ---- menu lateral recolhível + visualizador de documentos (compartilhado) ---- */
(function(){
  function isMin(){try{return localStorage.getItem('nx_side_min')==='1';}catch(e){return false;}}
  var IC={'Início':'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z','Painel':'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z','Clientes':'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
   'Documentos':'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','Obrigações':'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4',
   'Notas fiscais':'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6','Controle financeiro':'M4 19V5M4 19h16M8 15l4-4 3 3 5-6','Mensagens':'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
   'Processos':'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M9 13l2 2 4-4','Comunicações':'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12','Agenda da equipe':'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3'};
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
