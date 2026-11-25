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
  N.abrirOficial = function (empresa, n, espelho) {
    var w = window.open('about:blank', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px">Baixando o DANFSe oficial do Portal Nacional da NFS-e…</p>');
    N.danfse(empresa, n.amb, n.chave).then(function (b) { var u = URL.createObjectURL(new Blob([b], { type: 'application/pdf' })); if (w) w.location = u; else location.href = u; })
      .catch(function () {
        if (w) w.close();
        N.janela('DANFSe oficial indisponível agora', '<p>O Portal Nacional não entregou o PDF oficial desta nota neste momento' + (n.amb === 'producao' ? '' : ' (no ambiente de testes da Receita o DANFSe oficial costuma ficar indisponível)') + '.</p><p class="help">Você pode baixar o DANFSe oficial direto na Consulta Pública do Portal Nacional informando a chave de acesso abaixo, ou abrir o espelho gerado pela NEXIO a partir do XML oficial.</p><p style="font-family:monospace;word-break:break-all;background:var(--bg,#f5f7fb);padding:8px 10px;border-radius:8px">' + esc(n.chave) + '</p>',
          [{ t: 'Copiar chave', fn: function () { try { navigator.clipboard.writeText(n.chave); } catch (e) {} return false; } },
           { t: 'Abrir Consulta Pública (gov.br)', fn: function () { window.open(N.consultaPublica(n.chave), '_blank'); return false; } },
           { t: 'Ver espelho NEXIO', fn: function () { if (espelho) espelho(n); } }]);
      });
  };
  N.consultaPublica = function (chave) { return 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=' + chave; };
})();
