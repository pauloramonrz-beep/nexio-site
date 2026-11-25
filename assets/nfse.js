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
  N.emitir = function (empresa, ambiente, dps) { return chamar('emitir', { json: { empresa: empresa, ambiente: ambiente, dps: dps } }); };
  N.cancelar = function (empresa, ambiente, chave, motivo, codigo) { return chamar('cancelar', { json: { empresa: empresa, ambiente: ambiente, chave: chave, motivo: motivo, codigo: codigo || 1 } }); };
  N.danfse = function (empresa, ambiente, chave) { return chamar('danfse', { qs: 'empresa=' + encodeURIComponent(empresa) + '&ambiente=' + ambiente + '&chave=' + chave, binario: true }); };
  N.consultaPublica = function (chave) { return 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=' + chave; };
})();
