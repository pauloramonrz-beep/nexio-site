/* NEXIO — ponte do portal com o serviço de emissão de NFS-e (API nacional) hospedado em PHP */
(function () {
  var N = window.NXN = {
    /* endereço do serviço publicado na hospedagem (api.php). Vazio = emissão real desligada */
    URL: 'https://api.nexioic.com.br/nfse/api.php',
    AMBIENTES: { simulacao: 'Simulação (sem validade)', restrita: 'Testes na Receita (produção restrita)', producao: 'Produção (nota real)' }
  };
  N.ativo = function () { return !!N.URL; };
  function token() {
    if (!(window.NXA && NXA.sb)) return Promise.reject(new Error('Faça login novamente.'));
    return NXA.sb.auth.getSession().then(function (r) { var t = r.data && r.data.session && r.data.session.access_token; if (!t) throw new Error('Sessão expirada. Faça login novamente.'); return t; });
  }
  function chamar(acao, opt) {
    opt = opt || {};
    return token().then(function (t) {
      var h = { Authorization: 'Bearer ' + t }, corpo = opt.form || null;
      if (opt.json) { h['Content-Type'] = 'application/json'; corpo = JSON.stringify(opt.json); }
      return fetch(N.URL + '?acao=' + acao + (opt.qs ? '&' + opt.qs : ''), { method: corpo ? 'POST' : 'GET', headers: h, body: corpo });
    }).then(function (r) {
      if (opt.binario) return r.ok ? r.blob() : r.json().then(function (j) { var e = new Error(j.erro || 'Falha'); e.dados = j; throw e; });
      return r.json().catch(function () { return { ok: false, erro: 'Resposta inválida do serviço de notas (' + r.status + ').' }; }).then(function (j) { if (!j.ok) { var e = new Error(j.erro || 'Falha'); e.dados = j; throw e; } return j; });
    }, function (x) { if (x && x.dados) throw x; throw new Error(x && x.message && /Failed to fetch|NetworkError/.test(x.message) ? 'Não consegui falar com o serviço de notas. Tente de novo em instantes.' : (x && x.message) || 'Falha de conexão.'); });
  }
  N.status = function () { return fetch(N.URL + '?acao=status').then(function (r) { return r.json(); }); };
  N.certStatus = function (empresa) { return chamar('cert_status', { qs: 'empresa=' + encodeURIComponent(empresa) }); };
  N.enviarCert = function (empresa, arquivo, senha) { var f = new FormData(); f.append('empresa', empresa); f.append('arquivo', arquivo); f.append('senha', senha); return chamar('cert', { form: f }); };
  N.removerCert = function (empresa) { return chamar('cert_remover', { json: { empresa: empresa } }); };
  N.emitir = function (empresa, ambiente, dps, reusar) { return chamar('emitir', { json: { empresa: empresa, ambiente: ambiente, dps: dps, reusar: !!reusar } }); };
  N.consultarDps = function (empresa, ambiente, idDPS) { return chamar('consultar_dps', { json: { empresa: empresa, ambiente: ambiente, idDPS: idDPS } }); };
  N.cancelar = function (empresa, ambiente, chave, motivo, codigo) { return chamar('cancelar', { json: { empresa: empresa, ambiente: ambiente, chave: chave, motivo: motivo, codigo: codigo || 1 } }); };
  N.danfse = function (empresa, ambiente, chave) { return chamar('danfse', { qs: 'empresa=' + encodeURIComponent(empresa) + '&ambiente=' + ambiente + '&chave=' + chave, binario: true }); };
  N.consultarNfse = function (empresa, ambiente, chave) { return chamar('consultar_nfse', { json: { empresa: empresa, ambiente: ambiente, chave: chave } }); };
  /* lê os dados principais do XML oficial da NFS-e */
  N.lerXml = function (xml) {
    var o = {}; try {
      var d = new DOMParser().parseFromString(xml, 'application/xml'), g = function (sel, el) { var x = (el || d).getElementsByTagName(sel)[0]; return x ? x.textContent : ''; };
      var t = d.getElementsByTagName('toma')[0];
      o = { nNFSe: g('nNFSe'), dhProc: g('dhProc'), dCompet: g('dCompet'), vServ: parseFloat(g('vServ')) || 0, desc: g('xDescServ'), cTrib: g('cTribNac'), nDPS: g('nDPS'), serie: g('serie'),
        tom: t ? { doc: g('CNPJ', t) || g('CPF', t), nome: g('xNome', t), email: g('email', t) } : { doc: '', nome: '' } };
    } catch (e) {} return o;
  };
  N.dias = function (n) { var t = Date.parse(n.dhEmi || n.emissao); return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 864e5); };
  /* prazo (dias após a emissão) definido pela NEXIO conforme a regra da prefeitura; 0/vazio = a Receita decide */
  N.noPrazo = function (n, prazo) { prazo = +prazo || 0; return !prazo || N.dias(n) <= prazo; };
  N.MOTIVOS_SUBST = { 99: 'Outros (descrever)', 5: 'Rejeição pelo tomador', 1: 'Desenquadramento do Simples Nacional', 2: 'Enquadramento no Simples Nacional', 3: 'Inclusão retroativa de imunidade/isenção', 4: 'Exclusão retroativa de imunidade/isenção' };
  /* ---------- tentativas de emissão (recusadas / sem confirmação) ---------- */
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* classifica a falha: 'rejeitada' (a Receita analisou e recusou; nada foi gerado) ou 'pendente' (sem confirmação: Receita fora do ar ou conexão caiu) */
  N.falha = function (x) {
    var d = (x && x.dados) || {}, sem = !x || !x.dados || d.pendente === true;
    return { tipo: sem ? 'pendente' : 'rejeitada', msg: (x && x.message) || 'Falha', erros: d.erros || [], http: d.http || 0, nDPS: d.nDPS || null, idDPS: d.idDPS || null, em: new Date().toISOString() };
  };
  N.SIT = {
    autorizada: ['ok', 'Autorizada'], cancelada: ['bad', 'Cancelada'], substituida: ['bad', 'Substituída'],
    rejeitada: ['bad', 'Recusada pela Receita'], pendente: ['warn', 'Envio não confirmado'], processando: ['warn', 'Envio não confirmado'], corrigida: ['', 'Recusada · corrigida'], descartada: ['', 'Tentativa descartada']
  };
  N.tag = function (n) {
    var s = N.SIT[n.status] || ['', n.status], t = s[1];
    if (n.status === 'autorizada') t = n.real ? (n.amb === 'producao' ? 'Autorizada' : 'Autorizada (teste)') : 'Autorizada (simulação)';
    var l = n.tent || [], u = l[l.length - 1];
    var extra = (n.solic && n.solic.status === 'aberta' ? '<small style="display:block;color:var(--warn);font-size:12px;font-weight:600">' + (n.solic.tipo === 'substituir' ? 'Substituição' : 'Cancelamento') + ' fora do prazo pedido à NEXIO</small>' : '') +
      (n.status === 'cancelada' && n.canceladaFora ? '<small style="display:block;color:var(--muted);font-size:12px">cancelada fora do portal</small>' : '') +
      (n.substituidaPor || n.status === 'substituida' ? '<small style="display:block;color:var(--muted);font-size:12px">substituída por outra nota</small>' : '');
    return '<span class="tag ' + s[0] + '">' + t + '</span>' + extra + (n.status === 'rejeitada' || n.status === 'pendente' || n.status === 'processando' ? '<small style="display:block;color:var(--muted);font-size:12px">' + l.length + ' tentativa(s)' + (u ? ' · última ' + new Date(u.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '') + '</small>' : '');
  };
  N.acoes = function (n, attr) {
    attr = attr || 'data-nt';
    if (n.status === 'rejeitada') return '<button class="btn b-text" ' + attr + '="ver|' + n.id + '">Ver erros</button><button class="btn b-text" ' + attr + '="corrigir|' + n.id + '">Corrigir</button><button class="btn b-text" ' + attr + '="reenviar|' + n.id + '">Tentar de novo</button><button class="btn b-text" ' + attr + '="descartar|' + n.id + '" style="color:var(--muted)">Descartar</button>';
    if (n.status === 'pendente' || n.status === 'processando') return '<button class="btn b-text" ' + attr + '="ver|' + n.id + '">Detalhes</button><button class="btn b-text" ' + attr + '="consultar|' + n.id + '">Consultar na Receita</button><button class="btn b-text" ' + attr + '="reenviar|' + n.id + '">Reenviar</button>';
    if (n.status === 'descartada' || n.status === 'corrigida') return '<button class="btn b-text" ' + attr + '="ver|' + n.id + '">Ver tentativas</button>';
    return '';
  };
  function dlg() {
    var d = document.getElementById('nxn-dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'nxn-dlg'; d.style.cssText = 'border:0;border-radius:18px;padding:0;max-width:680px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.25)'; document.body.appendChild(d); }
    return d;
  }
  /* janela com explicação + botões. botoes: [{t, cls, fn}] (fn devolve false para manter aberta) */
  N.janela = function (titulo, corpo, botoes, cor) {
    var d = dlg();
    d.innerHTML = '<div style="padding:24px;display:flex;flex-direction:column;gap:12px"><h2 style="margin:0;font-size:20px;color:' + (cor || 'var(--ink)') + '">' + esc(titulo) + '</h2>' + corpo +
      '<div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px">' + (botoes || []).map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || 'b-line') + '" data-i="' + i + '">' + esc(b.t) + '</button>'; }).join('') + '<button type="button" class="btn b-blue" data-x="1">Fechar</button></div></div>';
    d.querySelector('[data-x]').onclick = function () { d.close(); };
    Array.prototype.forEach.call(d.querySelectorAll('[data-i]'), function (b) { b.onclick = function () { if (botoes[+b.getAttribute('data-i')].fn() !== false) d.close(); }; });
    if (!d.open) d.showModal();
  };
  N.explicar = function (f) {
    if (f.tipo === 'pendente') return '<p><b>A Receita não confirmou o recebimento.</b> ' + esc(f.msg) + '</p><p class="help">O Sistema Nacional da NFS-e não tem emissão em contingência: enquanto a Receita estiver fora do ar, a nota fica registrada aqui como <b>envio não confirmado</b>. Use <b>Consultar na Receita</b> para saber se ela chegou a ser gerada, ou <b>Reenviar</b> — o reenvio usa o mesmo número de DPS, então não há risco de nota em duplicidade.</p>' + (f.erros.length ? '<ul style="margin:0;padding-left:18px">' + f.erros.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '');
    return '<p>' + esc(f.msg) + ' Nenhuma nota foi gerada — a tentativa ficou registrada para você corrigir ou tentar de novo.</p>' + (f.erros.length ? '<ul style="margin:0;padding-left:18px">' + f.erros.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '');
  };
  N.historico = function (n) {
    return '<div style="max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:10px 14px"><b>Tentativas de envio</b><ol style="margin:6px 0 0;padding-left:20px;font-size:14px">' + (n.tent || []).map(function (t) {
      return '<li style="margin-bottom:8px">' + new Date(t.em).toLocaleString('pt-BR') + (t.por ? ' · ' + esc(t.por) : '') + ' — <b>' + (t.tipo === 'pendente' ? 'sem confirmação' : t.tipo === 'ok' ? 'autorizada' : 'recusada') + '</b>' + (t.msg && t.tipo !== 'ok' ? '<br><span style="color:var(--muted)">' + esc(t.msg) + '</span>' : '') + (t.erros && t.erros.length ? '<ul style="padding-left:16px;margin:2px 0">' + t.erros.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '') + '</li>';
    }).join('') + '</ol></div>';
  };
  /* DANFSe oficial do Portal Nacional; se indisponível, oferece a Consulta Pública oficial e o espelho NEXIO */
  N.abrirOficial = function (empresa, n, espelho, logo) {
    var w = window.open('about:blank', '_blank');
    /* com logomarca do cliente: monta direto do XML oficial, no layout nacional, com a logo */
    if (logo) { N.abrirDanfseXml(empresa, n, w, logo).catch(function () { N.abrirOficial(empresa, n, espelho); if (w) w.close(); }); return; }
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px">Carregando o DANFSe da NFS-e…</p>');
    N.danfse(empresa, n.amb, n.chave).then(function (b) { var u = URL.createObjectURL(new Blob([b], { type: 'application/pdf' })); if (w) w.location = u; else location.href = u; })
      .catch(function () {
        N.abrirDanfseXml(empresa, n, w, logo).catch(function () {
        if (w) w.close();
        N.janela('DANFSe oficial indisponível agora', '<p>O Portal Nacional não entregou o PDF oficial desta nota neste momento' + (n.amb === 'producao' ? '' : ' (no ambiente de testes da Receita o DANFSe oficial costuma ficar indisponível)') + '.</p><p class="help">Você pode baixar o DANFSe oficial direto na Consulta Pública do Portal Nacional informando a chave de acesso abaixo, ou abrir o espelho gerado pela NEXIO a partir do XML oficial.</p><p style="font-family:monospace;word-break:break-all;background:var(--bg,#f5f7fb);padding:8px 10px;border-radius:8px">' + esc(n.chave) + '</p>',
          [{ t: 'Copiar chave', fn: function () { try { navigator.clipboard.writeText(n.chave); } catch (e) {} return false; } },
           { t: 'Abrir Consulta Pública (gov.br)', fn: function () { window.open(N.consultaPublica(n.chave), '_blank'); return false; } },
           { t: 'Ver espelho NEXIO', fn: function () { if (espelho) espelho(n); } }]);
        });
      });
  };
  /* ---------- DANFSe no padrão do Portal Nacional, gerado a partir do XML OFICIAL autorizado ---------- */
  function carregarQR() { return new Promise(function (ok) { if (window.qrcode) return ok(); var sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'; sc.onload = function () { ok(); }; sc.onerror = function () { ok(); }; document.head.appendChild(sc); }); }
  N.lerXmlCompleto = function (xml) {
    var d = new DOMParser().parseFromString(xml, 'application/xml'), inf = d.getElementsByTagName('infNFSe')[0] || d, dps = d.getElementsByTagName('infDPS')[0] || d;
    var kid = function (el, tag) { if (!el) return null; for (var i = 0; i < el.children.length; i++) if (el.children[i].localName === tag) return el.children[i]; return null; };
    var g = function (el, path) { var x = el; path.split('/').forEach(function (t) { x = x && (kid(x, t) || (x.getElementsByTagName ? x.getElementsByTagName(t)[0] : null)); }); return x ? x.textContent : ''; };
    var pes = function (el) { if (!el) return {}; var en = kid(el, 'enderNac') || kid(el, 'end'); return { doc: g(el, 'CNPJ') || g(el, 'CPF'), im: g(el, 'IM'), nome: g(el, 'xNome'), fone: g(el, 'fone'), email: g(el, 'email'), lgr: en ? [g(en, 'xLgr'), g(en, 'nro'), g(en, 'xCpl')].filter(Boolean).join(', ') : '', bairro: en ? g(en, 'xBairro') : '', cep: en ? g(en, 'CEP') : '', cMun: en ? (g(en, 'cMun')) : '', uf: en ? g(en, 'UF') : '' }; };
    var emit = pes(kid(inf, 'emit')); var pr = kid(dps, 'prest'); if (pr) { emit.im = emit.im || g(pr, 'IM'); emit.fone = emit.fone || g(pr, 'fone'); emit.email = emit.email || g(pr, 'email'); } var toma = pes(kid(dps, 'toma')), interm = kid(dps, 'interm') ? pes(kid(dps, 'interm')) : null;
    var vInf = kid(inf, 'valores'), vD = kid(dps, 'valores'), tm = vD ? vD.getElementsByTagName('tribMun')[0] : null, tf = vD ? vD.getElementsByTagName('tribFed')[0] : null, tt = vD ? vD.getElementsByTagName('totTrib')[0] : null;
    var num = function (x) { var v = parseFloat(x); return isNaN(v) ? null : v; };
    return { chave: (inf.getAttribute && (inf.getAttribute('Id') || '').replace(/\D/g, '')) || '', nNFSe: g(inf, 'nNFSe'), dhProc: g(inf, 'dhProc'), xLocEmi: g(inf, 'xLocEmi'), xLocPrest: g(inf, 'xLocPrestacao'), xLocIncid: g(inf, 'xLocIncid'), xTribNac: g(inf, 'xTribNac'), xTribMun: g(inf, 'xTribMun'), xNBS: g(inf, 'xNBS'), cStat: g(inf, 'cStat'),
      dhEmi: g(dps, 'dhEmi'), dCompet: g(dps, 'dCompet'), serie: g(dps, 'serie'), nDPS: g(dps, 'nDPS'), tpAmb: g(dps, 'tpAmb'), emit: emit, toma: toma, interm: interm,
      opSimpNac: g(dps, 'prest/regTrib/opSimpNac') || g(dps, 'opSimpNac'), regEsp: g(dps, 'regEspTrib'),
      cTribNac: g(dps, 'cTribNac'), cTribMun: g(dps, 'cTribMun'), cNBS: g(dps, 'cNBS'), desc: g(dps, 'xDescServ'),
      vServ: num(g(vD, 'vServ')), vDesc: num(g(vD, 'vDescIncond')) || 0, tribISSQN: tm ? g(tm, 'tribISSQN') : '', tpRet: tm ? g(tm, 'tpRetISSQN') : '', pAliq: num(tm ? g(tm, 'pAliq') : ''),
      vBC: num(g(vInf, 'vBC')), pAliqAplic: num(g(vInf, 'pAliqAplic')), vISSQN: num(g(vInf, 'vISSQN')), vTotRet: num(g(vInf, 'vTotalRet')) || 0, vLiq: num(g(vInf, 'vLiq')),
      vRetIRRF: tf ? num(g(tf, 'vRetIRRF')) : null, vRetCP: tf ? num(g(tf, 'vRetCP')) : null, vRetCSLL: tf ? num(g(tf, 'vRetCSLL')) : null, vPis: tf ? num(g(tf, 'vPis')) : null, vCofins: tf ? num(g(tf, 'vCofins')) : null,
      pTotTribSN: tt ? num(g(tt, 'pTotTribSN')) : null, xInfComp: g(dps, 'xInfComp'),
      ibs: (function () { var gi = kid(dps, 'IBSCBS'); if (!gi) return null; var ni = kid(inf, 'IBSCBS');
        return { cIndOp: g(gi, 'cIndOp'), CST: g(gi, 'CST'), cClassTrib: g(gi, 'cClassTrib'), indFinal: g(gi, 'indFinal'), cNBS: g(dps, 'cNBS'),
          vBC: ni ? num(g(ni, 'vBC')) : null, vIBS: ni ? num(g(ni, 'vIBSTot') || g(ni, 'vIBS')) : null, vCBS: ni ? num(g(ni, 'vCBS')) : null,
          pIBSUF: ni ? num(g(ni, 'pIBSUF')) : null, pIBSMun: ni ? num(g(ni, 'pIBSMun')) : null, pCBS: ni ? num(g(ni, 'pCBS')) : null }; })() };
  };
  var brl = function (v) { return v == null ? '-' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var fdoc = function (d) { d = String(d || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (d || '-'); };
  var fdt = function (x, h) { if (!x) return '-'; if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x.split('-').reverse().join('/'); var t = new Date(x); if (isNaN(t)) return x; return t.toLocaleDateString('pt-BR') + (h ? ' ' + t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''); };
  var fct = function (c) { c = String(c || ''); return c.length === 6 ? c.slice(0, 2) + '.' + c.slice(2, 4) + '.' + c.slice(4) : c; };
  N.danfseHTML = function (xml, sit) {
    var x = N.lerXmlCompleto(xml), ch = x.chave || (sit && sit.chave) || '', canc = sit && sit.cancelada, teste = x.tpAmb === '2';
    var qrSvg = ''; try { if (window.qrcode && ch) { var q = qrcode(0, 'M'); q.addData(N.consultaPublica(ch)); q.make(); qrSvg = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); } } catch (e) {}
    var c = function (l, v, span) { return '<div class="c"' + (span ? ' style="grid-column:span ' + span + '"' : '') + '><b>' + l + '</b><span>' + esc(v == null || v === '' ? '-' : v) + '</span></div>'; };
    var bl = function (t, h) { return '<section><h3>' + t + '</h3><div class="g">' + h + '</div></section>'; };
    var pes = function (p) { return c('CNPJ / CPF / NIF', fdoc(p.doc)) + c('Inscrição municipal', p.im) + c('Telefone', p.fone) + c('E-mail', p.email) + c('Nome / Nome empresarial', p.nome, 2) + c('Endereço', [p.lgr, p.bairro].filter(Boolean).join(' - '), 1) + c('CEP', p.cep); };
    var sn = { '1': 'Não optante', '2': 'Optante — Microempreendedor Individual (MEI)', '3': 'Optante — Microempresa ou Empresa de Pequeno Porte (ME/EPP)' }[x.opSimpNac] || '-';
    var trib = { '1': 'Operação tributável', '2': 'Imunidade', '3': 'Exportação de serviço', '4': 'Não incidência' }[x.tribISSQN] || '-';
    var ret = { '1': 'Não retido', '2': 'Retido pelo tomador', '3': 'Retido pelo intermediário' }[x.tpRet] || '-';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFSe ' + esc(x.nNFSe) + '</title><style>@page{size:A4;margin:8mm}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:8pt}.d{border:1px solid #000;position:relative;max-width:194mm;margin:0 auto}header{display:grid;grid-template-columns:1.2fr 2fr 1fr;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #000}header .t{text-align:center}header .t b{font-size:12pt;display:block}.qr{justify-self:end;width:24mm;height:24mm}.qr svg{width:100%;height:100%}section{border-top:1px solid #000;padding:3px 0}section:first-of-type{border-top:0}h3{margin:0;padding:1px 6px;font-size:7.5pt;text-transform:uppercase}.g{display:grid;grid-template-columns:repeat(4,1fr)}.c{padding:2px 6px}.c b{display:block;font-size:6.5pt;font-weight:400;text-transform:uppercase;color:#333}.c span{font-size:8pt;font-weight:700;word-break:break-word}.ch{font-family:monospace;font-size:9.5pt;font-weight:700;letter-spacing:.5px}.wm{position:absolute;top:38%;left:0;right:0;text-align:center;font-size:46pt;font-weight:700;color:rgba(200,0,0,.18);transform:rotate(-22deg);pointer-events:none}.bar{max-width:194mm;margin:6px auto;display:flex;gap:8px;justify-content:flex-end;font-family:sans-serif}@media print{.bar{display:none}}</style></head><body>' +
      '<div class="bar"><button onclick="print()">Imprimir / salvar PDF</button></div><div class="d">' + (canc ? '<div class="wm">CANCELADA</div>' : teste ? '<div class="wm">SEM VALOR FISCAL</div>' : '') +
      '<header><div>' + (sit && sit.logo ? '<img src="' + esc(sit.logo) + '" alt="" style="max-height:20mm;max-width:52mm;display:block;margin-bottom:3px">' + '<b style="font-size:9pt;color:#1351b4">NFS-e</b> <span style="font-size:7pt">Nota Fiscal de Serviço eletrônica</span>' : '<b style="font-size:13pt;color:#1351b4">NFS-e</b><br>Nota Fiscal de Serviço eletrônica') + '</div><div class="t"><b>DANFSe v1.0</b>Documento Auxiliar da NFS-e' + (teste ? '<br><span style="color:#b00;font-weight:700">AMBIENTE DE PRODUÇÃO RESTRITA — SEM VALOR FISCAL</span>' : '') + '</div><div class="qr">' + qrSvg + '</div></header>' +
      bl('Chave de acesso da NFS-e', '<div class="c" style="grid-column:span 4"><span class="ch">' + ch.replace(/(\d{4})/g, '$1 ').trim() + '</span></div>') +
      '<section><div class="g">' + c('Número da NFS-e', x.nNFSe) + c('Competência da NFS-e', fdt(x.dCompet)) + c('Data e hora da emissão da NFS-e', fdt(x.dhProc, 1)) + c('Número da DPS', x.nDPS) + c('Série da DPS', x.serie) + c('Data e hora da emissão da DPS', fdt(x.dhEmi, 1)) + c('Situação', canc ? 'Cancelada' + (sit.cancelada.em ? ' em ' + fdt(sit.cancelada.em) : '') : 'Autorizada') + c('Local de emissão', x.xLocEmi) + '</div></section>' +
      bl('Emitente da NFS-e — Prestador do serviço', pes(x.emit) + c('Município', x.xLocEmi) + c('Simples Nacional na data de competência', sn, 2) + c('Regime de apuração tributária pelo SN', x.opSimpNac === '3' ? 'Regime de apuração dos tributos federais e municipal pelo SN' : '-')) +
      bl('Tomador do serviço', pes(x.toma)) +
      bl('Intermediário do serviço', x.interm ? pes(x.interm) : c('', 'Intermediário do serviço não identificado na NFS-e', 4)) +
      bl('Serviço prestado', c('Código de tributação nacional', fct(x.cTribNac) + (x.xTribNac ? ' - ' + x.xTribNac : ''), 2) + c('Código de tributação municipal', x.cTribMun + (x.xTribMun ? ' - ' + x.xTribMun : '')) + c('Local da prestação', x.xLocPrest) + c('Código NBS', x.cNBS + (x.xNBS ? ' - ' + x.xNBS : ''), 2) + c('País da prestação', 'Brasil') + c('Valor do serviço', brl(x.vServ)) + c('Descrição do serviço', x.desc, 4)) +
      bl('Tributação municipal', c('Tributação do ISSQN', trib) + c('Município de incidência do ISSQN', x.xLocIncid || x.xLocPrest) + c('Regime especial de tributação', x.regEsp && x.regEsp !== '0' ? x.regEsp : 'Nenhum') + c('Valor do serviço', brl(x.vServ)) + c('Desconto incondicionado', brl(x.vDesc)) + c('BC ISSQN', brl(x.vBC)) + c('Alíquota aplicada', x.pAliqAplic != null ? x.pAliqAplic.toFixed(2).replace('.', ',') + '%' : '-') + c('Retenção do ISSQN', ret) + c('ISSQN apurado', brl(x.vISSQN))) +
      bl('Tributação federal', c('IRRF', brl(x.vRetIRRF)) + c('Contribuição previdenciária - retida', brl(x.vRetCP)) + c('Contribuições sociais - retidas', brl(x.vRetCSLL)) + c('PIS / COFINS', x.vPis == null && x.vCofins == null ? '-' : brl((x.vPis || 0) + (x.vCofins || 0)))) +
      bl('Valor total da NFS-e', c('Valor do serviço', brl(x.vServ)) + c('Desconto incondicionado', brl(x.vDesc)) + c('Total das retenções', brl(x.vTotRet)) + c('Valor líquido da NFS-e', brl(x.vLiq))) +
      (x.ibs ? bl('IBS e CBS (reforma tributária)', c('Indicador da operação', x.ibs.cIndOp) + c('CST / classificação', x.ibs.CST + ' / ' + x.ibs.cClassTrib) + c('Código NBS', x.ibs.cNBS ? x.ibs.cNBS.replace(/(\d)(\d{4})(\d{2})(\d{2})/, '$1.$2.$3.$4') : '-') + c('Uso ou consumo pessoal', x.ibs.indFinal === '1' ? 'Sim' : 'Não') + c('Base de cálculo', brl(x.ibs.vBC)) + c('IBS', x.ibs.vIBS == null ? '-' : brl(x.ibs.vIBS)) + c('CBS', x.ibs.vCBS == null ? '-' : brl(x.ibs.vCBS)) + c('Alíquotas (UF / Mun. / CBS)', [x.ibs.pIBSUF, x.ibs.pIBSMun, x.ibs.pCBS].map(function (v) { return v == null ? '-' : String(v).replace('.', ',') + '%'; }).join(' / '))) : '') +
      bl('Totais aproximados dos tributos', c('Simples Nacional', x.pTotTribSN != null ? x.pTotTribSN.toFixed(2).replace('.', ',') + '%' : '-', 4)) +
      bl('Informações complementares', c('', (x.xInfComp ? x.xInfComp + ' — ' : '') + 'A autenticidade desta NFS-e pode ser verificada pela leitura do QR Code ou na Consulta Pública do Portal Nacional (www.nfse.gov.br/ConsultaPublica), com a chave de acesso.', 4)) +
      '</div></body></html>';
  };
  N.abrirDanfseXml = function (empresa, n, w, logo) {
    var pegar = n.xml && n.xml.indexOf('<NFSe') > -1 ? Promise.resolve({ nfseXml: n.xml, cancelada: n.status === 'cancelada' || n.status === 'substituida' ? { em: n.canceladaEm } : null }) : N.consultarNfse(empresa, n.amb, n.chave).then(function (r) { if (r.nfseXml) n.xml = r.nfseXml; return r; });
    return Promise.all([pegar, carregarQR()]).then(function (R) { var r = R[0]; if (!r.nfseXml) throw new Error('XML oficial indisponível.');
      var h = N.danfseHTML(r.nfseXml, { chave: n.chave, logo: logo || '', cancelada: r.cancelada || (n.status !== 'autorizada' ? { em: n.canceladaEm } : null) });
      w = w || window.open('about:blank', '_blank'); if (!w) { var u = URL.createObjectURL(new Blob([h], { type: 'text/html' })); location.href = u; return; } w.document.open(); w.document.write(h); w.document.close(); });
  };
  /* logomarca: reduz para no máximo 600x240 px (fica nítida na impressão e leve para guardar) */
  N.lerLogo = function (file) {
    return new Promise(function (ok, erro) {
      if (!file || !/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return erro(new Error('Envie a logomarca em PNG, JPG, WEBP ou SVG.'));
      if (file.size > 5 * 1024 * 1024) return erro(new Error('A imagem passa de 5 MB.'));
      var fr = new FileReader(); fr.onerror = function () { erro(new Error('Não consegui ler a imagem.')); };
      fr.onload = function () { var im = new Image(); im.onerror = function () { erro(new Error('Imagem inválida.')); };
        im.onload = function () { var k = Math.min(1, 600 / im.width, 240 / im.height), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); var u = cv.toDataURL('image/png'); if (u.length > 350000) u = cv.toDataURL('image/webp', 0.9); ok(u); };
        im.src = fr.result; };
      fr.readAsDataURL(file);
    });
  };
  /* ---------- ZIP (sem compressão) para o lote de XMLs ---------- */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  N.zip = function (arquivos) {
    var enc = new TextEncoder(), partes = [], central = [], off = 0, d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    arquivos.forEach(function (f) {
      var nome = enc.encode(f.nome), dados = typeof f.texto === 'string' ? enc.encode(f.texto) : f.texto, crc = crc32(dados);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nome, dados);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nome.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nome); off += 30 + nome.length + dados.length;
    });
    var tam = central.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, arquivos.length, true); e.setUint16(10, arquivos.length, true); e.setUint32(12, tam, true); e.setUint32(16, off, true);
    return new Blob(partes.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  };
  /* ---------- relatório mensal + lote de XML (painel da equipe e portal do cliente) ---------- */
  var mesN = function (k) { var p = k.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+p[1] - 1] + '/' + p[0]; };
  var compDe = function (n) { return String(n.comp || n.emissao || '').slice(0, 7); };
  var NFRS = { de: '', ate: '', emit: '', amb: 'producao', sit: 'todas' };
  N.painelRelatorio = function (el, o) {
    var hoje = new Date(), ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1), k2 = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    if (!NFRS.de) { NFRS.de = k2(ini); NFRS.ate = k2(hoje); }
    var emits = o.emitentes || null;
    var filtrar = function () {
      return o.notas().filter(function (n) {
        var st = n.status; if (st !== 'autorizada' && st !== 'cancelada' && st !== 'substituida') return false;
        if (NFRS.amb === 'producao' && !(n.real && n.amb === 'producao')) return false; if (NFRS.amb === 'restrita' && !(n.real && n.amb === 'restrita')) return false;
        if (NFRS.emit && n.cliente !== NFRS.emit) return false; var c = compDe(n); if (c < NFRS.de || c > NFRS.ate) return false;
        if (NFRS.sit === 'autorizada' && st !== 'autorizada') return false; if (NFRS.sit === 'cancelada' && st === 'autorizada') return false; return true;
      });
    };
    var desenha = function () {
      var l = filtrar(), meses = {}, d = new Date(NFRS.de + '-01T12:00:00'), fim = NFRS.ate;
      while (k2(d) <= fim) { meses[k2(d)] = { q: 0, v: 0, qc: 0, vc: 0, ret: 0, iss: 0 }; d.setMonth(d.getMonth() + 1); }
      l.forEach(function (n) { var m = meses[compDe(n)]; if (!m) return; if (n.status === 'autorizada') { m.q++; m.v += +n.valor || 0; m.iss += +n.iss || 0; if (n.ret) m.ret += +n.iss || 0; } else { m.qc++; m.vc += +n.valor || 0; } });
      var ks = Object.keys(meses), mx = Math.max.apply(null, ks.map(function (k) { return meses[k].v; }).concat([1])), T = { q: 0, v: 0, qc: 0, vc: 0, ret: 0 };
      ks.forEach(function (k) { var m = meses[k]; T.q += m.q; T.v += m.v; T.qc += m.qc; T.vc += m.vc; T.ret += m.ret; });
      var semXml = l.filter(function (n) { return !(n.xml && n.xml.indexOf('<NFSe') > -1); }).length;
      el.querySelector('[data-rx=res]').innerHTML =
        '<div class="row" style="gap:12px;flex-wrap:wrap;margin:6px 0 14px"><div class="kpi"><span>Notas autorizadas</span><strong>' + T.q + '</strong></div><div class="kpi"><span>Faturado (autorizadas)</span><strong>' + brl(T.v) + '</strong></div><div class="kpi"><span>Canceladas / substituídas</span><strong>' + T.qc + ' · ' + brl(T.vc) + '</strong></div><div class="kpi"><span>ISS retido pelo tomador</span><strong>' + brl(T.ret) + '</strong></div></div>' +
        '<div style="display:flex;align-items:flex-end;gap:6px;height:150px;border-bottom:1px solid var(--line);padding:0 4px;margin-bottom:6px" aria-label="Valor faturado por mês">' + ks.map(function (k) { var m = meses[k], h = Math.round(m.v / mx * 130); return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0" title="' + mesN(k) + ': ' + brl(m.v) + '"><small style="font-size:10px;color:var(--muted);white-space:nowrap">' + (m.v ? (m.v >= 1000 ? (m.v / 1000).toFixed(1).replace('.', ',') + ' mil' : Math.round(m.v)) : '') + '</small><div style="width:70%;max-width:36px;height:' + h + 'px;background:var(--blue2,#2344AC);border-radius:4px 4px 0 0"></div></div>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:6px;padding:0 4px;margin-bottom:14px">' + ks.map(function (k) { return '<small style="flex:1;text-align:center;font-size:10px;color:var(--muted)">' + mesN(k) + '</small>'; }).join('') + '</div>' +
        '<div class="tbl"><table><thead><tr><th>Mês (competência)</th><th>Autorizadas</th><th>Valor autorizado</th><th>Canceladas</th><th>Valor cancelado</th><th>ISS retido</th><th>Variação</th></tr></thead><tbody>' + ks.map(function (k, i) { var m = meses[k], a = i ? meses[ks[i - 1]].v : 0, vr = i && a ? ((m.v - a) / a * 100) : null; return '<tr><td>' + mesN(k) + '</td><td>' + m.q + '</td><td>' + brl(m.v) + '</td><td>' + m.qc + '</td><td>' + brl(m.vc) + '</td><td>' + brl(m.ret) + '</td><td>' + (vr == null ? '—' : '<span style="color:' + (vr >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (vr >= 0 ? '+' : '') + vr.toFixed(1).replace('.', ',') + '%</span>') + '</td></tr>'; }).join('') + '<tr style="font-weight:700"><td>Total</td><td>' + T.q + '</td><td>' + brl(T.v) + '</td><td>' + T.qc + '</td><td>' + brl(T.vc) + '</td><td>' + brl(T.ret) + '</td><td></td></tr></tbody></table></div>' +
        '<p class="help" style="margin-top:8px">' + l.length + ' nota(s) no filtro' + (semXml ? ' · ' + semXml + ' sem XML guardado (será buscado na Receita ao baixar o lote)' : '') + '.</p>';
      el._rx = { l: l, meses: meses, ks: ks, T: T };
    };
    el.innerHTML = '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end">' +
      (emits ? '<label>Emitente<select data-rf="emit"><option value="">Todos</option>' + emits.map(function (x) { return '<option value="' + x.id + '"' + (NFRS.emit === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label>Competência de<input type="month" data-rf="de" value="' + NFRS.de + '"></label><label>até<input type="month" data-rf="ate" value="' + NFRS.ate + '"></label>' +
      '<label>Ambiente<select data-rf="amb"><option value="producao"' + (NFRS.amb === 'producao' ? ' selected' : '') + '>Notas reais (produção)</option><option value="restrita"' + (NFRS.amb === 'restrita' ? ' selected' : '') + '>Testes na Receita</option><option value="todas"' + (NFRS.amb === 'todas' ? ' selected' : '') + '>Todas</option></select></label>' +
      '<label>Situação<select data-rf="sit"><option value="todas">Autorizadas e canceladas</option><option value="autorizada"' + (NFRS.sit === 'autorizada' ? ' selected' : '') + '>Só autorizadas</option><option value="cancelada"' + (NFRS.sit === 'cancelada' ? ' selected' : '') + '>Só canceladas</option></select></label></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0"><button class="btn b-blue" data-rb="zip">Baixar XMLs em lote (.zip)</button><button class="btn b-line" data-rb="pdf">Relatório em PDF</button><button class="btn b-line" data-rb="xlsx">Planilha (Excel)</button><button class="btn b-line" data-rb="lista">Lista de notas (Excel)</button></div><div data-rx="res"></div>';
    Array.prototype.forEach.call(el.querySelectorAll('[data-rf]'), function (i) { i.onchange = function () { NFRS[i.getAttribute('data-rf')] = i.value; desenha(); }; });
    var nomeEm = function (id) { return o.nomeDe ? o.nomeDe(id) : ''; }, filtroTxt = function () { return 'Competência ' + mesN(NFRS.de) + ' a ' + mesN(NFRS.ate) + (NFRS.emit ? ' · ' + nomeEm(NFRS.emit) : '') + ' · ' + ({ producao: 'notas reais', restrita: 'testes', todas: 'todos os ambientes' })[NFRS.amb]; };
    el.querySelector('[data-rb=pdf]').onclick = function () { var R = el._rx; window.NXR && NXR.pdf({ titulo: 'Notas fiscais de serviço — evolução mensal', sub: (o.titulo || '') , filtros: filtroTxt(), orient: 'retrato', cols: [{ t: 'Mês' }, { t: 'Autorizadas', cls: 'r' }, { t: 'Valor autorizado', cls: 'r' }, { t: 'Canceladas', cls: 'r' }, { t: 'Valor cancelado', cls: 'r' }, { t: 'ISS retido', cls: 'r' }], rows: R.ks.map(function (k) { var m = R.meses[k]; return [mesN(k), m.q, brl(m.v), m.qc, brl(m.vc), brl(m.ret)]; }).concat([['Total', R.T.q, brl(R.T.v), R.T.qc, brl(R.T.vc), brl(R.T.ret)]]) }); };
    el.querySelector('[data-rb=xlsx]').onclick = function () { var R = el._rx; window.NXR && NXR.xlsx('NFS-e_mensal', ['Mês', 'Autorizadas', 'Valor autorizado', 'Canceladas', 'Valor cancelado', 'ISS retido'], (R.ks.map(function (k) { var m = R.meses[k]; return [mesN(k), m.q, +m.v.toFixed(2), m.qc, +m.vc.toFixed(2), +m.ret.toFixed(2)]; })), 'Mensal'); };
    el.querySelector('[data-rb=lista]').onclick = function () { var R = el._rx; window.NXR && NXR.xlsx('NFS-e_lista', ['Emitente', 'Nº NFS-e', 'Emissão', 'Competência', 'Tomador', 'CPF/CNPJ do tomador', 'Serviço', 'Valor', 'ISS retido', 'Situação', 'Chave de acesso'], (R.l.map(function (n) { return [nomeEm(n.cliente), n.num, n.emissao, n.comp, n.tom.nome, n.tom.doc, n.serv, +n.valor, n.ret ? +n.iss : 0, (N.SIT[n.status] || [0, n.status])[1], n.chave]; })), 'Notas'); };
    el.querySelector('[data-rb=zip]').onclick = function () {
      var b = this, R = el._rx, l = R.l.filter(function (n) { return n.real && n.chave; }); if (!l.length) { (window.NX && NX.toast) ? NX.toast('Nenhuma nota real no filtro.') : 0; return; }
      b.disabled = true; var feitos = 0, falhas = [];
      l.reduce(function (p, n) { return p.then(function () { if (n.xml && n.xml.indexOf('<NFSe') > -1) return; b.textContent = 'Buscando XML na Receita… ' + (++feitos); return N.consultarNfse(o.empresaDe ? o.empresaDe(n) : n.cliente, n.amb, n.chave).then(function (r) { if (r.nfseXml) n.xml = r.nfseXml; }).catch(function () { falhas.push(n.num); }); }); }, Promise.resolve())
        .then(function () { if (o.salvar) o.salvar();
          var vis = {}, arq = l.filter(function (n) { if (!n.xml || vis[n.chave]) return false; vis[n.chave] = 1; return true; }).map(function (n) { var em = (nomeEm(n.cliente) || 'Emitente').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'Emitente'; return { nome: em + '/' + compDe(n) + '/NFSe_' + n.num + '_' + n.chave + '.xml', texto: n.xml }; });
          var u = URL.createObjectURL(N.zip(arq)), a = document.createElement('a'); a.href = u; a.download = 'NFS-e_XML_' + NFRS.de + '_a_' + NFRS.ate + '.zip'; document.body.appendChild(a); a.click(); a.remove();
          b.disabled = false; b.textContent = 'Baixar XMLs em lote (.zip)'; if (window.NX && NX.toast) NX.toast(arq.length + ' XML(s) no arquivo' + (falhas.length ? ' · não consegui baixar: nº ' + falhas.join(', ') : '') + '.'); });
    };
    desenha();
  };
  N.consultaPublica = function (chave) { return 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=' + chave; };
})();
