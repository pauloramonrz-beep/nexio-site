/* NEXIO — explorador de documentos (estilo Onvio Documentos), usado no painel da equipe e no portal do cliente */
(function () {
  var e = NX.esc, MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var FOLD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#DCE6FF" stroke="#2344AC" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  var SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F7A4D" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  var LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A5300" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var BUBBLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

  function ext(n) { return (String(n || '').split('.').pop() || '').toLowerCase(); }
  function ftIcon(f) {
    var x = ext(f.nome), c = '#4A5A86';
    if (x === 'pdf') c = '#C5221F'; else if (/^(xml|ofx|ofc)$/.test(x)) c = '#0F7A4D'; else if (/^(png|jpe?g|gif|webp)$/.test(x)) c = '#7B3FE4';
    else if (/^(xlsx?|csv)$/.test(x)) c = '#137333'; else if (/^(docx?)$/.test(x)) c = '#2B579A';
    return '<span class="xp-ft" style="background:' + c + '">' + e((x || 'arq').toUpperCase().slice(0, 4)) + '</span>';
  }
  function key(L) { return [L.setor || '', L.ano || '', L.comp || '', L.fid || ''].join('|'); }

  /* o = {db, cliente, role:'equipe'|'cliente', st, setores, setorOf, visible(f), onOpen(f,path), onUpload(L), onMass(L)?, onNewFolder(L), onDropFiles(files,L)?, me} */
  NX.explorer = function (el, o) {
    var db = o.db, st = o.st;
    st.L = st.L || {}; st.exp = st.exp || { '|||': 1 }; st.vis = st.vis || 'todos'; st.q = st.q || ''; st.sort = st.sort || { k: 'comp', d: -1 }; st.page = st.page || 1;
    st.view = st.view || (function () { try { return localStorage.getItem('nx_xpview') || 'tabela'; } catch (x) { return 'tabela'; } })();
    var L = st.L, re = function () { NX.explorer(el, o); };
    var files = db.files.filter(function (f) { return f.cliente === o.cliente && o.visible(f); });
    db.folders = db.folders || [];
    var folders = db.folders.filter(function (x) { return x.cliente === o.cliente; });
    var fById = function (id) { return folders.filter(function (x) { return x.id === id; })[0]; };
    function chain(fid) { var out = [], f = fById(fid); while (f) { out.unshift(f); f = fById(f.parent.fid); } return out; }
    var isFlat = function (x) { return !!(o.flat && o.flat.indexOf(x) > -1); };
    var setorOf = function (f) { return f.setor === '__custom' ? '__custom' : o.setorOf(f); };
    var compOf = function (f) { return String(f.comp || f.criado || NX.today()).slice(0, 7); };
    function inside(f, l) {
      if (l.fid) return !!f.folder && chain(f.folder).some(function (x) { return x.id === l.fid; });
      if (setorOf(f) === '__custom') return !l.setor && !l.ano && !l.comp;
      return (!l.setor || setorOf(f) === l.setor) && (!l.ano || compOf(f).slice(0, 4) === l.ano) && (!l.comp || compOf(f) === l.comp);
    }
    function pathOf(f) {
      var p = setorOf(f) === '__custom' ? [] : isFlat(setorOf(f)) ? [setorOf(f)] : [setorOf(f), compOf(f).slice(0, 4), MESES[+compOf(f).slice(5) - 1]];
      if (f.folder) chain(f.folder).forEach(function (x) { p.push(x.nome); });
      return p.join(' › ') || 'Meus documentos';
    }
    NX.xpPath = pathOf;
    /* filhos de um nó */
    function children(l) {
      var out = [];
      if (!l.fid) {
        if (!l.setor) {
          o.setores.forEach(function (s) { var n = files.filter(function (f) { return setorOf(f) === s; }).length; if (n || o.role === 'equipe' || o.showAll || s === o.uploadSetor) out.push({ t: 's', label: s, L: { setor: s }, n: n, lock: o.restritos && o.restritos.indexOf(s) > -1 }); });
        } else if (!l.ano && !isFlat(l.setor)) {
          var an = {}; files.forEach(function (f) { if (setorOf(f) === l.setor) an[compOf(f).slice(0, 4)] = 1; });
          Object.keys(an).sort().reverse().forEach(function (a) { out.push({ t: 'a', label: a, L: { setor: l.setor, ano: a }, n: files.filter(function (f) { return inside(f, { setor: l.setor, ano: a }); }).length }); });
        } else if (l.ano && !l.comp) {
          for (var i = 12; i >= 1; i--) { var k = l.ano + '-' + String(i).padStart(2, '0'), n = files.filter(function (f) { return inside(f, { setor: l.setor, comp: k }); }).length; if (n) out.push({ t: 'm', label: MESES[i - 1], L: { setor: l.setor, ano: l.ano, comp: k }, n: n }); }
        }
      }
      folders.filter(function (x) { return key(x.parent) === key(l); }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; })
        .forEach(function (x) { out.push({ t: 'f', label: x.nome, L: { setor: l.setor, ano: l.ano, comp: l.comp, fid: x.id }, n: files.filter(function (f) { return inside(f, { fid: x.id }); }).length, por: x.por }); });
      return out;
    }
    /* árvore */
    function tree(l, depth) {
      return children(l).map(function (c) {
        var k = key(c.L), open = !!st.exp[k], sel = k === key(L), kids = children(c.L);
        return '<li><div class="xp-node' + (sel ? ' sel' : '') + '" style="padding-left:' + (depth * 14 + 4) + 'px">' +
          (kids.length ? '<button class="xp-tg" data-tg="' + e(k) + '" aria-label="' + (open ? 'Recolher' : 'Expandir') + ' ' + e(c.label) + '">' + (open ? '−' : '+') + '</button>' : '<span class="xp-tg"></span>') +
          '<button class="xp-nm" data-nav="' + e(k) + '">' + FOLD + '<span>' + e(c.label) + '</span>' + (c.t === 's' && o.role === 'equipe' ? (c.lock ? LOCK : SHARE) : '') + '<small>' + c.n + '</small></button></div>' +
          (open && kids.length ? '<ul>' + tree(c.L, depth + 1) + '</ul>' : '') + '</li>';
      }).join('');
    }
    /* linhas da tabela */
    var flat = !!(st.q || st.vis !== 'todos');
    var subs = flat ? [] : children(L);
    var list;
    if (flat) list = files.slice();
    else list = files.filter(function (f) { return L.fid ? f.folder === L.fid : (L.setor && !L.ano && isFlat(L.setor)) ? (!f.folder && setorOf(f) === L.setor) : (L.comp && !f.folder && setorOf(f) === L.setor && compOf(f) === L.comp); });
    if (st.vis !== 'todos') list = list.filter(function (f) { return f.de === 'equipe' && (st.vis === 'nao' ? !f.visto : f.visto); });
    if (st.q) { var q = st.q.toLowerCase(); list = list.filter(function (f) { return (f.titulo + ' ' + f.nome).toLowerCase().indexOf(q) > -1; }); }
    function viewsOf(f) { return (f.hist || []).filter(function (h) { return /visualizado pelo cliente|^visualizado$/i.test(h.ev); }); }
    function firstView(f) { return viewsOf(f)[0]; }
    function viewsCell(f) { var vs = viewsOf(f), quem = {}; vs.forEach(function (h) { var k = h.por || 'Cliente'; if (!quem[k]) quem[k] = h.em; }); var ks = Object.keys(quem); if (!ks.length) return '<span class="xp-ok">' + EYE + 'Sim</span>'; var tip = ks.map(function (k) { return k + ' em ' + NX.ftime(quem[k]); }).join('\n'); return '<span class="xp-ok" title="' + e(tip) + '">' + EYE + NX.fdate(quem[ks[0]].slice(0, 10)) + '</span><small style="display:block;color:var(--muted)">' + e(ks[0]) + (ks.length > 1 ? ' +' + (ks.length - 1) : '') + '</small>'; }
    var S = st.sort, val = function (f) {
      switch (S.k) { case 'nome': return f.titulo.toLowerCase(); case 'venc': return f.venc || ''; case 'visto': return f.visto ? 1 : 0; case 'por': return NX.uploader(f, db).toLowerCase(); case 'com': return (f.coments || []).length; default: return compOf(f) + (f.criado || ''); }
    };
    list.sort(function (a, b) { var x = val(a), y = val(b); return x < y ? -S.d : x > y ? S.d : 0; });
    var PER = 25, total = list.length, pages = Math.max(1, Math.ceil(total / PER)); if (st.page > pages) st.page = pages;
    var pageList = list.slice((st.page - 1) * PER, st.page * PER);
    /* trilha */
    var cr = [['root', o.rootLabel || 'Documentos']];
    if (L.setor) cr.push([key({ setor: L.setor }), L.setor]); if (L.ano) cr.push([key({ setor: L.setor, ano: L.ano }), L.ano]); if (L.comp) cr.push([key({ setor: L.setor, ano: L.ano, comp: L.comp }), MESES[+L.comp.slice(5) - 1]]);
    if (L.fid) chain(L.fid).forEach(function (x) { cr.push([key({ setor: L.setor, ano: L.ano, comp: L.comp, fid: x.id }), x.nome]); });
    var crumbs = flat ? '<span class="help">' + total + ' resultado(s) em todas as pastas · <button class="xp-link" data-clr="1">limpar filtros</button></span>' :
      cr.map(function (k, i) { return i === cr.length - 1 ? '<b>' + e(k[1]) + '</b>' : '<button class="xp-link" data-nav="' + e(k[0]) + '">' + e(k[1]) + '</button><span aria-hidden="true">›</span>'; }).join('');
    function th(k, lbl, cls) { var on = S.k === k; return '<th' + (cls ? ' class="' + cls + '"' : '') + '><button class="xp-sort" data-sort="' + k + '">' + lbl + (on ? (S.d > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
    var eq = o.role === 'equipe';
    var body;
    if (st.view === 'icones') {
      body = '<div class="xp-grid">' + subs.map(function (c) { return '<button class="xp-tile" data-nav="' + e(key(c.L)) + '"><span class="xp-bigf">' + FOLD.replace('width="20" height="20"', 'width="40" height="40"') + '</span><b>' + e(c.label) + '</b><small>' + c.n + ' item(ns)</small></button>'; }).join('') +
        pageList.map(function (f) { return '<button class="xp-tile" data-open="' + f.id + '"><span class="xp-bigf">' + ftIcon(f) + '</span><b>' + e(f.titulo) + '</b><small>' + (f.venc ? 'Vence ' + NX.fdate(f.venc) : NX.fcomp(compOf(f))) + (f.de === 'equipe' && !f.visto ? ' · <span style="color:var(--warn)">não visualizado</span>' : '') + '</small></button>'; }).join('') + '</div>' +
        (!subs.length && !pageList.length ? '<p class="empty">Pasta vazia.</p>' : '');
    } else {
      body = '<div class="tbl"><table class="xp-t"><thead><tr><th style="width:52px">Tipo</th>' + th('nome', 'Nome') + (flat ? '<th>Pasta</th>' : '') + th('visto', 'Visualizado') + (eq ? '<th>Compart.</th>' : '') + th('venc', 'Vencimento') + th('com', 'Coment.') + th('por', 'Anexado por') + th('comp', 'Compet.') + '<th>Situação</th>' + (o.onEdit ? '<th><span class="sr">Ações</span></th>' : '') + '</tr></thead><tbody>' +
        subs.map(function (c) { return '<tr class="xp-frow" data-nav="' + e(key(c.L)) + '" tabindex="0"><td>' + FOLD + '</td><td colspan="' + ((eq ? 8 : 7) + (o.onEdit ? 1 : 0)) + '"><b>' + e(c.label) + '</b> <small class="help" style="display:inline">· ' + c.n + ' item(ns)' + (c.por ? ' · criada por ' + e(c.por) : '') + '</small></td></tr>'; }).join('') +
        pageList.map(function (f) {
          var s = NX.statusOf(f), v = firstView(f), nc = (f.coments || []).length, sh = f.shared != null ? f.shared : !(o.restritos && o.restritos.indexOf(setorOf(f)) > -1);
          return '<tr><td>' + ftIcon(f) + '</td><td class="name"><button data-open="' + f.id + '">' + e(f.titulo) + '</button>' + (f.de === 'equipe' && !f.visto ? '<span class="dot" aria-label="não visualizado"></span>' : '') + '<small>' + e(f.nome) + (f.size ? ' · ' + NX.fsize(f.size) : '') + '</small></td>' +
            (flat ? '<td class="sm">' + e(pathOf(f)) + '</td>' : '') +
            '<td class="sm">' + (f.de === 'equipe' ? (f.visto ? viewsCell(f) : '<span class="xp-no">Não</span>') : '—') + '</td>' +
            (eq ? '<td>' + (sh ? '<span title="Compartilhado com o cliente">' + SHARE + '</span>' : '<span title="Restrito à equipe">' + LOCK + '</span>') + '</td>' : '') +
            '<td class="sm">' + NX.fdate(f.venc) + '</td><td class="sm">' + (nc ? '<span class="xp-c">' + BUBBLE + nc + '</span>' : '<span style="color:var(--line)">' + BUBBLE + '</span>') + '</td>' +
            '<td class="sm">' + e(NX.uploader(f, db)) + '</td><td class="sm">' + NX.fcomp(compOf(f)) + '</td><td><span class="tag ' + s.c + '">' + s.t + '</span>' + (o.onGuia && f.tipo === 'Guia' ? '<button class="btn b-text" data-guia="' + f.id + '" style="display:block;padding:2px 0;min-height:0;font-size:12px">' + (f.status === 'pago' ? 'Marcar não paga' : 'Marcar como paga') + '</button>' : '') + '</td>' + (o.onEdit ? '<td class="xp-act" style="white-space:nowrap"><button class="btn b-text" data-ed="' + f.id + '" title="Editar dados e situação">Editar</button>' + (o.onDelete ? '<button class="btn b-text" data-del="' + f.id + '" style="color:var(--bad)" title="Excluir">Excluir</button>' : '') + '</td>' : '') + '</tr>';
        }).join('') +
        (!subs.length && !pageList.length ? '<tr><td colspan="10" class="empty">' + (L.comp || L.fid ? 'Pasta vazia. Use “Upload” ou arraste arquivos para cá.' : 'Selecione uma pasta.') + '</td></tr>' : '') + '</tbody></table></div>';
    }
    var foot = '<div class="xp-foot"><div class="row" style="gap:4px"><button class="btn b-line xp-pg" data-pg="1" ' + (st.page === 1 ? 'disabled' : '') + ' aria-label="Primeira página">«</button><button class="btn b-line xp-pg" data-pg="' + (st.page - 1) + '" ' + (st.page === 1 ? 'disabled' : '') + ' aria-label="Página anterior">‹</button><button class="btn b-line xp-pg" data-pg="' + (st.page + 1) + '" ' + (st.page === pages ? 'disabled' : '') + ' aria-label="Próxima página">›</button><button class="btn b-line xp-pg" data-pg="' + pages + '" ' + (st.page === pages ? 'disabled' : '') + ' aria-label="Última página">»</button></div><span class="help">Página ' + st.page + ' de ' + pages + ' · ' + (total ? ((st.page - 1) * PER + 1) + ' a ' + Math.min(st.page * PER, total) + ' de ' + total : '0') + ' documento(s)</span></div>';
    var seg = function (name, opts, cur) { return '<div class="xp-seg" role="group" aria-label="' + name + '">' + opts.map(function (x) { return '<button data-' + name + '="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>'; };
    el.innerHTML = '<div class="xp">' +
      '<aside class="xp-tree" aria-label="Pastas"><div class="xp-node' + (!L.setor && !L.fid ? ' sel' : '') + '" style="padding-left:4px"><span class="xp-tg"></span><button class="xp-nm" data-nav="root"><b>' + e(o.rootLabel || 'Documentos') + '</b></button></div><ul>' + tree({}, 1) + '</ul></aside>' +
      '<section class="xp-main"><div class="xp-bar"><div class="row" style="align-items:center;gap:8px">' +
      (o.readonly ? '<span class="help">Somente consulta</span>' : (o.onNewFolder ? '<button class="btn b-line" id="xpNew">+ Nova pasta</button>' : '') + (L.fid && o.onFolderOps ? '<button class="btn b-line" id="xpRen">Renomear pasta</button><button class="btn b-line" id="xpDelF" style="color:var(--bad)">Excluir pasta</button>' : '') + '<button class="btn b-blue" id="xpUp">' + (o.role === 'cliente' ? 'Enviar documentos' : 'Upload') + '</button>') + (o.onMass ? '<button class="btn b-line" id="xpMass">Upload em massa</button>' : '') +
      '</div><div class="row" style="align-items:center;gap:8px">' + seg('vis', [['todos', 'Todos'], ['nao', 'Não visualizados'], ['sim', 'Visualizados']], st.vis) +
      '<label class="sr" for="xpq">Pesquisar</label><input id="xpq" class="xp-q" placeholder="Pesquisar…" value="' + e(st.q) + '">' + seg('view', [['tabela', '☰'], ['icones', '▦']], st.view) + '</div></div>' +
      '<div class="xp-crumbs">' + crumbs + '</div><div class="xp-body" id="xpBody">' + body + '</div>' + foot + '</section></div>';
    // ações
    el.querySelector('.xp-view, [aria-label="view"]');
    el.querySelectorAll('[data-view]').forEach(function (b) { b.title = b.getAttribute('data-view') === 'tabela' ? 'Ver em lista' : 'Ver em ícones'; b.setAttribute('aria-label', b.title); });
    el.onclick = function (ev) {
      var t = ev.target.closest('button,tr[data-nav]'); if (!t || !el.contains(t)) return; var a;
      if ((a = t.getAttribute('data-tg'))) { st.exp[a] = !st.exp[a]; re(); return; }
      if ((a = t.getAttribute('data-nav'))) { if (a === 'root') st.L = {}; else { var p = a.split('|'); st.L = { setor: p[0] || null, ano: p[1] || null, comp: p[2] || null, fid: p[3] || null }; st.exp[a] = 1; var pk = [p[0], '', '', ''].join('|'); st.exp[pk] = 1; if (p[1]) st.exp[[p[0], p[1], '', ''].join('|')] = 1; if (p[2]) st.exp[[p[0], p[1], p[2], ''].join('|')] = 1; }
        st.q = ''; st.vis = 'todos'; st.page = 1; re(); return; }
      if ((a = t.getAttribute('data-sort'))) { st.sort = { k: a, d: st.sort.k === a ? -st.sort.d : (a === 'nome' || a === 'por' ? 1 : -1) }; re(); return; }
      if ((a = t.getAttribute('data-vis'))) { st.vis = a; st.page = 1; re(); return; }
      if ((a = t.getAttribute('data-view'))) { st.view = a; try { localStorage.setItem('nx_xpview', a); } catch (x) {} re(); return; }
      if ((a = t.getAttribute('data-pg'))) { st.page = +a; re(); return; }
      if (t.hasAttribute('data-clr')) { st.q = ''; st.vis = 'todos'; re(); return; }
      if ((a = t.getAttribute('data-guia')) && o.onGuia) { var fg = db.files.filter(function (x) { return x.id === a; })[0]; if (fg) o.onGuia(fg, re); return; }
      if ((a = t.getAttribute('data-ed')) && o.onEdit) { var fe = db.files.filter(function (x) { return x.id === a; })[0]; if (fe) o.onEdit(fe, re); return; }
      if ((a = t.getAttribute('data-del')) && o.onDelete) { var fd = db.files.filter(function (x) { return x.id === a; })[0]; if (fd) o.onDelete(fd, re); return; }
      if ((a = t.getAttribute('data-open'))) { var f = db.files.filter(function (x) { return x.id === a; })[0]; if (f) o.onOpen(f, pathOf(f)); }
    };
    el.querySelectorAll('tr[data-nav]').forEach(function (r) { r.onkeydown = function (ev) { if (ev.key === 'Enter') r.click(); }; });
    var q = el.querySelector('#xpq'); q.oninput = function () { st.q = q.value; st.page = 1; clearTimeout(q._t); q._t = setTimeout(function () { re(); var y = el.querySelector('#xpq'); y.focus(); y.setSelectionRange(y.value.length, y.value.length); }, 350); };
    if (!o.readonly && o.onFolderOps && L.fid) { el.querySelector('#xpRen').onclick = function () { o.onFolderOps('rename', L.fid, re); }; el.querySelector('#xpDelF').onclick = function () { o.onFolderOps('delete', L.fid, function () { st.L = { setor: L.setor, ano: L.ano, comp: L.comp, fid: fById(L.fid) && fById(L.fid).parent.fid || null }; if (!st.L.fid) delete st.L.fid; re(); }); }; }
    if (!o.readonly) { if (o.onNewFolder) el.querySelector('#xpNew').onclick = function () { o.onNewFolder(st.L, re); }; el.querySelector('#xpUp').onclick = function () { o.onUpload(st.L, re); }; }
    if (o.onMass) el.querySelector('#xpMass').onclick = function () { o.onMass(st.L, re); };
    var bd = el.querySelector('.xp-main');
    bd.ondragover = function (ev) { ev.preventDefault(); bd.classList.add('over'); }; bd.ondragleave = function (ev) { if (!bd.contains(ev.relatedTarget)) bd.classList.remove('over'); };
    bd.ondrop = function (ev) { ev.preventDefault(); bd.classList.remove('over'); if (ev.dataTransfer.files.length && o.onDropFiles && !o.readonly) o.onDropFiles([].slice.call(ev.dataTransfer.files), st.L, re); };
  };
  /* opções de local para mover arquivos */
  NX.folderPlaces = function (db, cliente, setores, flat) {
    var all = (db.folders || []).filter(function (x) { return x.cliente === cliente; }), by = function (id) { return all.filter(function (x) { return x.id === id; })[0]; };
    var out = setores.map(function (s) { return { v: 's:' + s, t: s + (flat && flat.indexOf(s) > -1 ? '' : ' (pela competência do arquivo)') }; });
    all.forEach(function (x) { var p = [], f = x; while (f) { p.unshift(f.nome); var pr = f.parent; f = pr.fid ? by(pr.fid) : null; if (!f) { if (pr.comp) p.unshift(MESES[+pr.comp.slice(5) - 1] + '/' + pr.comp.slice(0, 4)); else if (pr.ano) p.unshift(pr.ano); if (pr.setor) p.unshift(pr.setor); } } out.push({ v: 'f:' + x.id, t: p.join(' › ') }); });
    return out;
  };
  NX.deleteFolder = function (db, fid) {
    var all = db.folders || [], x = all.filter(function (y) { return y.id === fid; })[0]; if (!x) return;
    var pl = NX.placeFor(db, x.parent, 'Contábil');
    (db.files || []).forEach(function (f) { if (f.folder === fid) { f.folder = x.parent.fid || null; if (!f.folder) { f.setor = pl.setor === '__custom' ? 'Contábil' : pl.setor; if (x.parent.comp) f.comp = x.parent.comp; } } });
    all.forEach(function (y) { if (y.parent && y.parent.fid === fid) y.parent = Object.assign({}, x.parent); });
    db.folders = all.filter(function (y) { return y.id !== fid; });
  };
  NX.newFolder = function (db, cliente, L, por) {
    var n = prompt('Nome da nova pasta:'); if (!n || !n.trim()) return null; db.folders = db.folders || [];
    var x = { id: NX.uid(), cliente: cliente, nome: n.trim().slice(0, 60), parent: { setor: L.setor || null, ano: L.ano || null, comp: L.comp || null, fid: L.fid || null }, por: por, criado: NX.today() };
    db.folders.push(x); return x;
  };
  /* onde gravar um arquivo enviado na pasta L */
  NX.placeFor = function (db, L, fallbackSetor) {
    var setor = L.setor, comp = L.comp;
    if (L.fid) { var all = db.folders || [], f = all.filter(function (x) { return x.id === L.fid; })[0]; while (f && f.parent.fid) f = all.filter(function (x) { return x.id === f.parent.fid; })[0]; if (f) { setor = f.parent.setor; comp = f.parent.comp; } }
    return { setor: setor || (L.fid ? '__custom' : fallbackSetor), comp: comp || NX.ym(), folder: L.fid || null };
  };
})();
