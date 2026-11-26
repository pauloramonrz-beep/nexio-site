/* NEXIO — relatórios: PDF timbrado (retrato ou paisagem), planilha Excel e CSV */
(function () {
  var R = window.NXR = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  R.esc = esc;
  /* o = {titulo, sub, orient:'retrato'|'paisagem', cols:[{t, r:bool, w}], rows:[[...]], resumo:[[rotulo, valor]], filtros, por, total:[...]} */
  R.pdf = function (o) {
    var land = o.orient === 'paisagem', logo = location.origin + '/assets/logo-nexio.png';
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(o.titulo) + '</title><style>' +
      '@page{size:A4 ' + (land ? 'landscape' : 'portrait') + ';margin:12mm 11mm 15mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Calibri,Arial,sans-serif;color:#555}}' +
      '*{box-sizing:border-box}body{font:' + (land ? '9pt' : '9.5pt') + '/1.4 Calibri,Arial,sans-serif;color:#000;margin:0}' +
      '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2344AC;padding-bottom:8px}.hd img{height:44px;display:block}' +
      '.ti{text-align:right}.ti h1{margin:0;font-size:15pt;color:#2344AC}.ti span{color:#555;font-size:8.5pt;display:block}' +
      '.meta{display:flex;flex-wrap:wrap;gap:4px 18px;margin:10px 0;font-size:8.5pt;color:#333}.meta b{color:#000}' +
      '.sum{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}.sum div{flex:1 1 120px;border-radius:6px;padding:7px 10px;background:#F3EFEC}.sum div:first-child{background:#2344AC;color:#fff}.sum small{display:block;font-size:7.5pt;text-transform:uppercase;opacity:.85}.sum b{font-size:12pt}' +
      'table{width:100%;border-collapse:collapse;table-layout:auto}th{background:#2344AC;color:#fff;text-align:left;padding:5px 6px;font-weight:600;font-size:8.5pt}td{padding:4px 6px;border-bottom:1px solid #e3e3e3;vertical-align:top;word-break:break-word}' +
      'tr:nth-child(even) td{background:#f6f7fc}thead{display:table-header-group}tr{page-break-inside:avoid}.r{text-align:right;white-space:nowrap}tfoot td{font-weight:700;background:#eef2ff!important;border-top:1.5px solid #2344AC}' +
      '.bad{color:#b3261e;font-weight:600}.warn{color:#8a5a00;font-weight:600}.ok{color:#0a7a4f}.vazio{padding:20px;text-align:center;color:#555}' +
      '.ft{margin-top:16px;border-top:1px solid #2344AC;padding-top:5px;font-size:7.5pt;color:#555}</style></head><body>' +
      '<div class="hd"><img src="' + logo + '" alt="NEXIO Inteligência Contábil"><div class="ti"><h1>' + esc(o.titulo) + '</h1>' + (o.sub ? '<span>' + esc(o.sub) + '</span>' : '') + '</div></div>' +
      '<div class="meta"><span>Emitido em <b>' + new Date().toLocaleString('pt-BR') + '</b></span>' + (o.por ? '<span>Por <b>' + esc(o.por) + '</b></span>' : '') + '<span>Registros: <b>' + o.rows.length + '</b></span>' + (o.filtros ? '<span>Filtros: <b>' + esc(o.filtros) + '</b></span>' : '') + '</div>' +
      (o.resumo && o.resumo.length ? '<div class="sum">' + o.resumo.map(function (x) { return '<div><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' : '') +
      '<table><thead><tr>' + o.cols.map(function (c) { return '<th' + (c.r ? ' class="r"' : '') + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (o.rows.length ? o.rows.map(function (r) { return '<tr>' + r.map(function (v, i) { var cl = (o.cols[i] && o.cols[i].r ? 'r ' : '') + (o.cls && o.cls(i, v, r) || ''); return '<td' + (cl.trim() ? ' class="' + cl.trim() + '"' : '') + '>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + o.cols.length + '" class="vazio">Nenhum registro para os filtros escolhidos.</td></tr>') +
      '</tbody>' + (o.total ? '<tfoot><tr>' + o.total.map(function (v, i) { return '<td' + (o.cols[i] && o.cols[i].r ? ' class="r"' : '') + '>' + esc(v) + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table>' +
      '<div class="ft">Nexio Inteligência Contábil Ltda • CNPJ 67.828.768/0001-29 • Av. Brig. Faria Lima, 1811 - CXPST ESC1119 - Jardim Paulistano, São Paulo - SP, 01452-001<br>(11) 93079-0457 • contato@nexioic.com.br • Contabilidade que impulsiona o futuro.</div>' +
      '<script>window.onload=function(){setTimeout(function(){print()},350)}<\/script></body></html>';
    var w = window.open('', '_blank'); if (!w) { alert('Libere as janelas pop-up deste site para gerar o PDF.'); return; }
    w.document.write(h); w.document.close();
  };
  function baixar(nome, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  R.baixar = baixar;
  R.csv = function (nome, cols, rows) {
    var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var t = '﻿' + [cols.map(function (c) { return q(c.t || c); }).join(';')].concat(rows.map(function (r) { return r.map(q).join(';'); })).join('\r\n');
    baixar(nome + '.csv', new Blob([t], { type: 'text/csv;charset=utf-8' }));
  };
  R.lib = function () {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = function () { ok(window.XLSX); }; s.onerror = function () { no(new Error('Leitor de Excel indisponível')); }; document.head.appendChild(s); });
  };
  /* planilha .xlsx; se o componente não carregar, entrega CSV */
  R.xlsx = function (nome, cols, rows, aba) {
    return R.lib().then(function (X) {
      var data = [cols.map(function (c) { return c.t || c; })].concat(rows);
      var ws = X.utils.aoa_to_sheet(data); ws['!cols'] = cols.map(function (c, i) { var m = String(c.t || c).length; rows.forEach(function (r) { m = Math.max(m, String(r[i] == null ? '' : r[i]).length); }); return { wch: Math.min(60, m + 2) }; });
      var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, (aba || 'Relatório').slice(0, 31)); X.writeFile(wb, nome + '.xlsx');
    }).catch(function () { R.csv(nome, cols, rows); });
  };
  /* lê .xlsx/.xls/.csv e devolve linhas como objetos {cabeçalho: valor} */
  R.ler = function (file) {
    var csv = /\.csv$/i.test(file.name);
    return (csv ? file.arrayBuffer().then(function (b) { var t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (x) { t = new TextDecoder('windows-1252').decode(b); } return R.lib().then(function (X) { return X.read(t, { type: 'string', raw: true }); }).catch(function () { return { _csv: t }; }); })
      : R.lib().then(function (X) { return file.arrayBuffer().then(function (b) { return X.read(b, { type: 'array', cellDates: true }); }); }))
      .then(function (wb) {
        if (wb._csv) { var L = wb._csv.replace(/\r/g, '').split('\n').filter(Boolean), sep = (L[0].split(';').length >= L[0].split(',').length) ? ';' : ','; var hd = L[0].split(sep); return L.slice(1).map(function (l) { var v = l.split(sep), o = {}; hd.forEach(function (h, i) { o[h.trim()] = (v[i] || '').trim(); }); return o; }); }
        var X = window.XLSX, ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      });
  };
})();
