<?php
/**
 * NEXIO — Serviço de emissão de NFS-e pela API do Sistema Nacional (Sefin Nacional / ADN).
 * Roda na hospedagem PHP (HostGator). O portal chama este arquivo; ele:
 *   - confere o login do usuário no Supabase e a permissão na empresa;
 *   - guarda o certificado A1 do cliente criptografado, FORA da pasta pública;
 *   - monta a DPS, assina (XMLDSig RSA-SHA1), compacta e envia com mTLS;
 *   - devolve a NFS-e autorizada (XML) ou os erros da Receita.
 * Nenhuma senha ou certificado é gravado no banco de dados nem no navegador.
 */
declare(strict_types=1);
@ini_set('display_errors', '0');
date_default_timezone_set('America/Manaus');

/* ---------------- configuração ---------------- */
$CFG = [
  'supabase_url' => 'https://pctwjndleohoidikiwcv.supabase.co',
  'supabase_key' => 'sb_publishable_U8jK8tPwRuQ4xQGARUHHWg_UWz8Potv',
  'origens'      => ['https://nexioic.com.br', 'https://www.nexioic.com.br', 'http://localhost:8765'],
  'dados'        => null, // pasta fora do public_html; null = automático
  'sefin'        => ['producao' => 'https://sefin.nfse.gov.br/SefinNacional', 'restrita' => 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional'],
  'adn'          => ['producao' => 'https://adn.nfse.gov.br', 'restrita' => 'https://adn.producaorestrita.nfse.gov.br'],
  'verAplic'     => 'NEXIO_1.0',
];
if (is_file(__DIR__ . '/config.local.php')) { $CFG = array_replace_recursive($CFG, (array) require __DIR__ . '/config.local.php'); }

/* ---------------- utilidades ---------------- */
function resp(int $code, array $body): void {
  http_response_code($code); header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
function falha(int $code, string $msg, array $extra = []): void { resp($code, ['ok' => false, 'erro' => $msg] + $extra); }
function dig(?string $s): string { return preg_replace('/\D/', '', (string) $s); }
function xe($s): string { return htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
function pasta_dados(): string {
  global $CFG;
  $d = $CFG['dados'] ?: (dirname((string) ($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/nexio_nfse_dados');
  if (!is_dir($d) && !@mkdir($d, 0700, true)) falha(500, 'Não consegui criar a pasta de dados protegida.');
  foreach (['certs', 'seq', 'tmp'] as $s) if (!is_dir("$d/$s")) @mkdir("$d/$s", 0700, true);
  return $d;
}
function chave_mestra(): string {
  $f = pasta_dados() . '/chave.bin';
  if (!is_file($f)) { file_put_contents($f, random_bytes(32)); @chmod($f, 0600); }
  $k = file_get_contents($f); if (strlen($k) !== 32) falha(500, 'Chave de criptografia inválida.');
  return $k;
}
function cifra(string $plain): string {
  $iv = random_bytes(12); $tag = '';
  $c = openssl_encrypt($plain, 'aes-256-gcm', chave_mestra(), OPENSSL_RAW_DATA, $iv, $tag);
  return base64_encode($iv . $tag . $c);
}
function decifra(string $b64): string {
  $r = base64_decode($b64, true); if ($r === false || strlen($r) < 29) falha(500, 'Cofre do certificado corrompido.');
  $p = openssl_decrypt(substr($r, 28), 'aes-256-gcm', chave_mestra(), OPENSSL_RAW_DATA, substr($r, 0, 12), substr($r, 12, 16));
  if ($p === false) falha(500, 'Não consegui abrir o cofre do certificado.');
  return $p;
}
function http(string $metodo, string $url, array $headers = [], ?string $corpo = null, ?array $mtls = null): array {
  $ch = curl_init($url);
  $o = [CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2];
  if ($corpo !== null) $o[CURLOPT_POSTFIELDS] = $corpo;
  if ($mtls) { $o[CURLOPT_SSLCERT] = $mtls['cert']; $o[CURLOPT_SSLKEY] = $mtls['key']; $o[CURLOPT_SSLCERTTYPE] = 'PEM'; $o[CURLOPT_SSLKEYTYPE] = 'PEM'; }
  curl_setopt_array($ch, $o);
  $body = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); $ct = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
  return ['code' => $code, 'body' => $body === false ? '' : $body, 'erro' => $err, 'tipo' => $ct];
}

/* ---------------- CORS ---------------- */
$origem = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origem && in_array($origem, $CFG['origens'], true)) {
  header('Access-Control-Allow-Origin: ' . $origem); header('Vary: Origin');
  header('Access-Control-Allow-Headers: Authorization, Content-Type'); header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

/* ---------------- autenticação (Supabase) ---------------- */
function usuario(): array {
  global $CFG;
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!preg_match('/^Bearer\s+(\S+)$/', $h, $m)) falha(401, 'Faça login novamente.');
  $r = http('GET', $CFG['supabase_url'] . '/auth/v1/user', ['apikey: ' . $CFG['supabase_key'], 'Authorization: Bearer ' . $m[1]]);
  $u = json_decode($r['body'], true);
  if ($r['code'] !== 200 || empty($u['id'])) falha(401, 'Sessão expirada. Faça login novamente.');
  return ['id' => $u['id'], 'email' => $u['email'] ?? '', 'token' => $m[1]];
}
function rest(array $u, string $caminho): array {
  global $CFG;
  $r = http('GET', $CFG['supabase_url'] . '/rest/v1/' . $caminho, ['apikey: ' . $CFG['supabase_key'], 'Authorization: Bearer ' . $u['token'], 'Accept: application/json']);
  if ($r['code'] !== 200) falha(502, 'Não consegui consultar o cadastro (' . $r['code'] . ').');
  return json_decode($r['body'], true) ?: [];
}
/** Confere acesso à empresa. $niveis = níveis do portal permitidos; equipe da NEXIO sempre pode. */
function empresa_permitida(array $u, string $empresa, array $niveis): array {
  if (!preg_match('/^[0-9a-f-]{36}$/i', $empresa)) falha(400, 'Empresa inválida.');
  $e = rest($u, 'empresas?id=eq.' . $empresa . '&select=id,razao_social,documento,municipio_ibge,trib,inscricoes,dados');
  if (!$e) falha(403, 'Você não tem acesso a esta empresa.');
  $p = rest($u, 'perfis?id=eq.' . $u['id'] . '&select=tipo,nivel_eq');
  if (($p[0]['tipo'] ?? '') === 'equipe') return $e[0];
  $v = rest($u, 'empresa_usuarios?empresa_id=eq.' . $empresa . '&usuario_id=eq.' . $u['id'] . '&select=nivel');
  if (!$v || !in_array($v[0]['nivel'] ?? '', $niveis, true)) falha(403, 'Seu nível de acesso não permite esta ação.');
  return $e[0];
}

/* ---------------- certificado ---------------- */
function arq_cert(string $empresa): string { return pasta_dados() . '/certs/' . preg_replace('/[^0-9a-f-]/i', '', $empresa) . '.enc'; }
function ler_pfx(string $pfx, string $senha): array {
  $c = [];
  if (!openssl_pkcs12_read($pfx, $c, $senha)) {
    $e = openssl_error_string() ?: '';
    falha(422, stripos($e, 'mac') !== false || stripos($e, 'password') !== false ? 'Senha do certificado incorreta.' : 'Não consegui abrir o certificado (' . $e . '). Confira o arquivo e a senha.');
  }
  $x = openssl_x509_parse($c['cert']);
  $cn = (string) ($x['subject']['CN'] ?? '');
  $doc = '';
  if (preg_match('/:(\d{14}|\d{11})\b/', $cn, $m)) $doc = $m[1];
  return ['cert' => $c['cert'], 'key' => $c['pkey'], 'extra' => $c['extracerts'] ?? [], 'cn' => $cn, 'doc' => $doc,
    'validade' => date('Y-m-d', (int) $x['validTo_time_t']), 'inicio' => date('Y-m-d', (int) $x['validFrom_time_t']),
    'emissor' => (string) ($x['issuer']['CN'] ?? $x['issuer']['O'] ?? '')];
}
function cert_empresa(string $empresa): array {
  $f = arq_cert($empresa); if (!is_file($f)) falha(409, 'A empresa ainda não enviou o certificado digital A1 no portal (Configurações).');
  $d = json_decode(decifra((string) file_get_contents($f)), true);
  $c = ler_pfx(base64_decode($d['pfx']), $d['senha']);
  if ($c['validade'] < date('Y-m-d')) falha(409, 'O certificado digital venceu em ' . date('d/m/Y', strtotime($c['validade'])) . '. Envie um novo no portal.');
  return $c;
}
/** grava PEMs temporários para o mTLS e devolve os caminhos */
function pem_tmp(array $c): array {
  $d = pasta_dados() . '/tmp/'; $id = bin2hex(random_bytes(8));
  $cert = $d . $id . '.crt'; $key = $d . $id . '.key';
  file_put_contents($cert, $c['cert'] . "\n" . implode("\n", $c['extra'])); file_put_contents($key, $c['key']);
  @chmod($cert, 0600); @chmod($key, 0600);
  register_shutdown_function(function () use ($cert, $key) { @unlink($cert); @unlink($key); });
  return ['cert' => $cert, 'key' => $key];
}

/* ---------------- assinatura XMLDSig (enveloped, C14N, RSA-SHA1) ---------------- */
function assinar(string $xml, string $tagAssinada, array $c): string {
  $doc = new DOMDocument('1.0', 'UTF-8'); $doc->preserveWhiteSpace = false; $doc->formatOutput = false;
  if (!$doc->loadXML($xml)) falha(500, 'XML inválido para assinatura.');
  $no = $doc->getElementsByTagName($tagAssinada)->item(0); if (!$no) falha(500, 'Elemento ' . $tagAssinada . ' não encontrado.');
  $id = $no->getAttribute('Id');
  $digest = base64_encode(sha1($no->C14N(false, false), true));
  $ds = 'http://www.w3.org/2000/09/xmldsig#';
  $sig = $doc->createElementNS($ds, 'Signature');
  $doc->documentElement->appendChild($sig);
  $si = $doc->createElementNS($ds, 'SignedInfo'); $sig->appendChild($si);
  $cm = $doc->createElementNS($ds, 'CanonicalizationMethod'); $cm->setAttribute('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'); $si->appendChild($cm);
  $sm = $doc->createElementNS($ds, 'SignatureMethod'); $sm->setAttribute('Algorithm', $ds . 'rsa-sha1'); $si->appendChild($sm);
  $rf = $doc->createElementNS($ds, 'Reference'); $rf->setAttribute('URI', '#' . $id); $si->appendChild($rf);
  $tr = $doc->createElementNS($ds, 'Transforms'); $rf->appendChild($tr);
  foreach ([$ds . 'enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'] as $alg) { $t = $doc->createElementNS($ds, 'Transform'); $t->setAttribute('Algorithm', $alg); $tr->appendChild($t); }
  $dm = $doc->createElementNS($ds, 'DigestMethod'); $dm->setAttribute('Algorithm', $ds . 'sha1'); $rf->appendChild($dm);
  $rf->appendChild($doc->createElementNS($ds, 'DigestValue', $digest));
  $assin = '';
  if (!openssl_sign($si->C14N(false, false), $assin, $c['key'], OPENSSL_ALGO_SHA1)) falha(500, 'Falha ao assinar a nota com o certificado.');
  $sig->appendChild($doc->createElementNS($ds, 'SignatureValue', base64_encode($assin)));
  $ki = $doc->createElementNS($ds, 'KeyInfo'); $sig->appendChild($ki);
  $xd = $doc->createElementNS($ds, 'X509Data'); $ki->appendChild($xd);
  $pem = preg_replace('/-----[A-Z ]+-----|\s/', '', $c['cert']);
  $xd->appendChild($doc->createElementNS($ds, 'X509Certificate', $pem));
  return '<?xml version="1.0" encoding="UTF-8"?>' . $doc->saveXML($doc->documentElement);
}
function gz64(string $xml): string { return base64_encode(gzencode($xml, 9)); }
function ungz64(string $b): string { $r = @gzdecode(base64_decode($b)); return $r === false ? '' : $r; }

/* ---------------- montagem da DPS (leiaute nacional v1.00) ---------------- */
function proximo_ndps(string $empresa, string $serie, string $amb, int $pedido): int {
  $f = pasta_dados() . '/seq/' . preg_replace('/[^0-9a-f-]/i', '', $empresa) . '_' . preg_replace('/\D/', '', $serie) . '_' . $amb . '.txt';
  $h = fopen($f, 'c+'); flock($h, LOCK_EX); $ult = (int) stream_get_contents($h);
  $n = max($pedido, $ult + 1); ftruncate($h, 0); rewind($h); fwrite($h, (string) $n); flock($h, LOCK_UN); fclose($h);
  return $n;
}
function montar_dps(array $emp, array $d, string $amb, int $nDPS): array {
  global $CFG;
  $T = is_array($emp['trib'] ?? null) ? $emp['trib'] : []; $I = is_array($emp['inscricoes'] ?? null) ? $emp['inscricoes'] : [];
  $docP = dig($emp['documento']); $tpP = strlen($docP) === 11 ? 'CPF' : 'CNPJ';
  $cMun = dig($T['ibge'] ?? '') ?: dig($emp['municipio_ibge'] ?? '') ?: '1302603';
  $serie = substr(preg_replace('/\D/', '', (string) ($d['serie'] ?? '1')) ?: '1', 0, 5);
  $id = 'DPS' . $cMun . ($tpP === 'CPF' ? '1' : '2') . str_pad($docP, 14, '0', STR_PAD_LEFT) . str_pad($serie, 5, '0', STR_PAD_LEFT) . str_pad((string) $nDPS, 15, '0', STR_PAD_LEFT);
  $reg = (string) ($T['regime'] ?? 'SN'); $op = $reg === 'MEI' ? 2 : ($reg === 'SN' ? 3 : 1);
  if ($op === 1 && $amb === 'producao') falha(422, 'Empresas fora do Simples Nacional precisam informar IBS/CBS na nota, e isso ainda não está disponível no portal. Emita pelo Emissor Nacional enquanto isso.');
  $tom = $d['tomador'] ?? []; $docT = dig($tom['doc'] ?? ''); $tpT = strlen($docT) === 11 ? 'CPF' : 'CNPJ';
  if (!in_array(strlen($docT), [11, 14], true)) falha(422, 'CPF/CNPJ do tomador inválido.');
  $vServ = round((float) ($d['vServ'] ?? 0), 2); if ($vServ <= 0) falha(422, 'Informe o valor do serviço.');
  $cTrib = dig($d['cTribNac'] ?? ''); if (strlen($cTrib) === 4) $cTrib .= '01'; if (strlen($cTrib) !== 6) falha(422, 'Código de tributação nacional inválido.');
  $desc = trim((string) ($d['xDescServ'] ?? '')); if ($desc === '') falha(422, 'Informe a descrição do serviço.');
  $ret = !empty($d['ret']); $pAliq = round((float) ($d['pAliq'] ?? 0), 2);
  $dComp = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['dCompet'] ?? '')) ? $d['dCompet'] : date('Y-m-d');
  $dhEmi = date('Y-m-d\TH:i:sP', time() - 60);
  $end = $tom['end'] ?? []; $endXml = '';
  if (!empty($end['cep']) && !empty($end['xLgr'])) {
    $endXml = '<end><endNac><cMun>' . (dig($end['cMun'] ?? '') ?: $cMun) . '</cMun><CEP>' . dig($end['cep']) . '</CEP></endNac><xLgr>' . xe($end['xLgr']) . '</xLgr><nro>' . xe($end['nro'] ?? 'S/N') . '</nro>' . (!empty($end['xCpl']) ? '<xCpl>' . xe($end['xCpl']) . '</xCpl>' : '') . '<xBairro>' . xe($end['xBairro'] ?? 'Centro') . '</xBairro></end>';
  }
  $tribMun = '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>' . ($ret ? 2 : 1) . '</tpRetISSQN>' . (($ret || $op === 1) && $pAliq > 0 ? '<pAliq>' . number_format($pAliq, 2, '.', '') . '</pAliq>' : '') . '</tribMun>';
  $pSN = round((float) ($d['pTotTribSN'] ?? 0), 2);
  // Reforma tributária (NT SE/CGNFS-e 004): grupo IBSCBS no fim da infDPS; exige o código NBS do serviço e muda a DPS para a versão 1.01
  $ibscbs = ''; $ib = (array) ($d['ibscbs'] ?? []);
  if ($ib) {
    $cInd = dig($ib['cIndOp'] ?? ''); $cst = dig($ib['CST'] ?? ''); $cct = dig($ib['cClassTrib'] ?? ''); $nbs = dig($d['cNBS'] ?? '');
    $erros = [];
    if (strlen($nbs) !== 9) $erros[] = 'Código NBS do serviço (9 dígitos) não informado.';
    if (strlen($cInd) !== 6) $erros[] = 'Indicador da operação do IBS/CBS (cIndOp, 6 dígitos) não informado.';
    if (strlen($cst) !== 3) $erros[] = 'CST do IBS/CBS (3 dígitos) não informado.';
    if (strlen($cct) !== 6 || substr($cct, 0, 3) !== $cst) $erros[] = 'Classificação tributária do IBS/CBS (cClassTrib) inválida: os 3 primeiros dígitos devem ser o CST.';
    if ($erros) falha(422, 'Dados de IBS/CBS incompletos na ficha do cliente.', ['erros' => $erros]);
    $tomaCpf = strlen(dig($d['tomador']['doc'] ?? '')) === 11;
    $ibscbs = '<IBSCBS><finNFSe>0</finNFSe><indFinal>' . (isset($ib['indFinal']) ? ((int) $ib['indFinal'] ? 1 : 0) : ($tomaCpf ? 1 : 0)) . '</indFinal><cIndOp>' . $cInd . '</cIndOp><indDest>0</indDest>' .
      '<valores><trib><gIBSCBS><CST>' . $cst . '</CST><cClassTrib>' . $cct . '</cClassTrib></gIBSCBS></trib></valores></IBSCBS>';
  }
  // substituição: a nova nota cancela a anterior automaticamente (cMotivo 01..99 conforme leiaute)
  $subst = ''; $sb = (array) ($d['subst'] ?? []);
  if (strlen(dig($sb['chave'] ?? '')) === 50) $subst = '<subst><chSubstda>' . dig($sb['chave']) . '</chSubstda><cMotivo>' . str_pad((string) max(1, min(99, (int) ($sb['cMotivo'] ?? 99))), 2, '0', STR_PAD_LEFT) . '</cMotivo>' . ((int) ($sb['cMotivo'] ?? 99) === 99 ? '<xMotivo>' . xe(mb_substr(trim((string) ($sb['xMotivo'] ?? 'Substituição da NFS-e')), 0, 255)) . '</xMotivo>' : '') . '</subst>';
  if ($op === 3 && $pSN <= 0) {
    // ME/EPP: a Receita exige pTotTribSN; sem RBT12, usa a alíquota da 1ª faixa do anexo
    $faixa1 = ['I' => 4.00, 'II' => 4.50, 'III' => 6.00, 'IV' => 4.50, 'V' => 15.50];
    $pSN = $faixa1[strtoupper((string) ($T['anexo'] ?? 'III'))] ?? 6.00;
  }
  $tot = $op === 3 ? '<totTrib><pTotTribSN>' . number_format($pSN, 2, '.', '') . '</pTotTribSN></totTrib>' : '<totTrib><indTotTrib>0</indTotTrib></totTrib>';
  $fone = dig($I['telefone'] ?? ''); $email = trim((string) ($I['email'] ?? ''));
  $xml = '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infDPS Id="' . $id . '">' .
    '<tpAmb>' . ($amb === 'producao' ? 1 : 2) . '</tpAmb><dhEmi>' . $dhEmi . '</dhEmi><verAplic>' . xe($CFG['verAplic']) . '</verAplic><serie>' . $serie . '</serie><nDPS>' . $nDPS . '</nDPS><dCompet>' . $dComp . '</dCompet><tpEmit>1</tpEmit><cLocEmi>' . $cMun . '</cLocEmi>' . $subst .
    '<prest><' . $tpP . '>' . $docP . '</' . $tpP . '>' . (!empty($I['im']) ? '<IM>' . xe(dig($I['im']) ?: $I['im']) . '</IM>' : '') . (strlen($fone) >= 10 ? '<fone>' . $fone . '</fone>' : '') . ($email ? '<email>' . xe($email) . '</email>' : '') .
    '<regTrib><opSimpNac>' . $op . '</opSimpNac>' . ($op === 3 ? '<regApTribSN>1</regApTribSN>' : '') . '<regEspTrib>' . (!empty($T['uniprof']) ? 4 : 0) . '</regEspTrib></regTrib></prest>' .
    '<toma><' . $tpT . '>' . $docT . '</' . $tpT . '><xNome>' . xe(trim((string) ($tom['nome'] ?? ''))) . '</xNome>' . $endXml . (strlen(dig($tom['fone'] ?? '')) >= 10 ? '<fone>' . dig($tom['fone']) . '</fone>' : '') . (!empty($tom['email']) ? '<email>' . xe($tom['email']) . '</email>' : '') . '</toma>' .
    '<serv><locPrest><cLocPrestacao>' . (dig($d['cLocPrestacao'] ?? '') ?: $cMun) . '</cLocPrestacao></locPrest><cServ><cTribNac>' . $cTrib . '</cTribNac>' . (!empty($d['cTribMun']) ? '<cTribMun>' . xe(dig($d['cTribMun'])) . '</cTribMun>' : '') . '<xDescServ>' . xe(mb_substr($desc, 0, 2000)) . '</xDescServ>' . (!empty($d['cNBS']) ? '<cNBS>' . dig($d['cNBS']) . '</cNBS>' : '') . '</cServ></serv>' .
    '<valores><vServPrest><vServ>' . number_format($vServ, 2, '.', '') . '</vServ></vServPrest><trib>' . $tribMun . $tot . '</trib></valores>' .
    $ibscbs . '</infDPS></DPS>';
  if ($ibscbs !== '') $xml = str_replace('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">', '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">', $xml);
  return ['xml' => $xml, 'id' => $id];
}
function erros_sefin(array $j, string $bruto = ''): array {
  // a Sefin responde em formatos diferentes (erros/Erros/erro/Erro, lista ou objeto): junta tudo
  $l = [];
  foreach (['erros', 'Erros', 'erro', 'Erro', 'mensagens', 'Mensagens', 'alertas'] as $k) {
    if (!isset($j[$k])) continue; $v = $j[$k];
    if (is_array($v) && (isset($v['Codigo']) || isset($v['codigo']) || isset($v['Descricao']) || isset($v['descricao']))) $v = [$v];
    if (is_array($v)) $l = array_merge($l, $v); elseif (is_string($v)) $l[] = ['descricao' => $v];
  }
  $out = [];
  foreach ($l as $e) { if (is_string($e)) { $out[] = $e; continue; } if (!is_array($e)) continue;
    $out[] = trim(($e['Codigo'] ?? $e['codigo'] ?? '') . ' — ' . ($e['Descricao'] ?? $e['descricao'] ?? $e['mensagem'] ?? '') . (!empty($e['Complemento'] ?? $e['complemento'] ?? '') ? ' (' . ($e['Complemento'] ?? $e['complemento']) . ')' : ''), ' —'); }
  if (!$out && !empty($j['message'])) $out[] = (string) $j['message'];
  if (!$out && !empty($j['title'])) $out[] = (string) $j['title'] . (!empty($j['detail']) ? ': ' . $j['detail'] : '');
  if (!$out && $bruto !== '') $out[] = 'Resposta da Receita: ' . mb_substr(trim(strip_tags($bruto)), 0, 300);
  return array_values(array_filter($out));
}

/* ---------------- rotas ---------------- */
$acao = $_GET['acao'] ?? '';
$entrada = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
  $entrada = json_decode((string) file_get_contents('php://input'), true) ?: [];
}

if ($acao === 'status') {
  resp(200, ['ok' => true, 'servico' => 'NEXIO NFS-e', 'php' => PHP_VERSION, 'openssl' => extension_loaded('openssl'), 'curl' => extension_loaded('curl'), 'zlib' => extension_loaded('zlib'), 'dom' => extension_loaded('dom'), 'pasta_protegida' => is_dir(pasta_dados()) && is_writable(pasta_dados())]);
}

$u = usuario();

if ($acao === 'cert_status') {
  $emp = empresa_permitida($u, (string) ($_GET['empresa'] ?? ''), ['titular', 'financeiro', 'notas', 'rh', 'consulta']);
  $f = arq_cert($emp['id']);
  if (!is_file($f)) resp(200, ['ok' => true, 'tem' => false]);
  $d = json_decode(decifra((string) file_get_contents($f)), true);
  resp(200, ['ok' => true, 'tem' => true, 'nome' => 'Certificado A1 – ' . ($d['meta']['cn'] ?? ''), 'validade' => $d['meta']['validade'] ?? '', 'titular' => $d['meta']['cn'] ?? '', 'enviado_em' => $d['meta']['em'] ?? '']);
}

if ($acao === 'cert') {
  $emp = empresa_permitida($u, (string) ($_POST['empresa'] ?? ''), ['titular']);
  if (empty($_FILES['arquivo']['tmp_name']) || !is_uploaded_file($_FILES['arquivo']['tmp_name'])) falha(422, 'Envie o arquivo .pfx ou .p12.');
  if ($_FILES['arquivo']['size'] > 50000) falha(422, 'Arquivo grande demais para um certificado A1.');
  $pfx = (string) file_get_contents($_FILES['arquivo']['tmp_name']); $senha = (string) ($_POST['senha'] ?? '');
  $c = ler_pfx($pfx, $senha);
  $docEmp = dig($emp['documento']);
  if ($c['doc'] && $c['doc'] !== $docEmp && substr($c['doc'], 0, 8) !== substr($docEmp, 0, 8)) falha(422, 'Este certificado é de outro CPF/CNPJ (' . $c['doc'] . ') e não da empresa (' . $docEmp . ').');
  if ($c['validade'] < date('Y-m-d')) falha(422, 'Este certificado está vencido desde ' . date('d/m/Y', strtotime($c['validade'])) . '.');
  $meta = ['nome' => 'Certificado A1 – ' . ($c['cn'] ?: $docEmp), 'cn' => $c['cn'], 'validade' => $c['validade'], 'emissor' => $c['emissor'], 'em' => date('c'), 'por' => $u['email']];
  file_put_contents(arq_cert($emp['id']), cifra(json_encode(['pfx' => base64_encode($pfx), 'senha' => $senha, 'meta' => $meta])));
  @chmod(arq_cert($emp['id']), 0600);
  resp(200, ['ok' => true] + $meta);
}

if ($acao === 'cert_remover') {
  $emp = empresa_permitida($u, (string) ($entrada['empresa'] ?? ''), ['titular']);
  @unlink(arq_cert($emp['id']));
  resp(200, ['ok' => true]);
}

if ($acao === 'emitir') {
  $emp = empresa_permitida($u, (string) ($entrada['empresa'] ?? ''), ['titular', 'financeiro', 'notas']);
  $amb = ($entrada['ambiente'] ?? '') === 'producao' ? 'producao' : 'restrita';
  $d = (array) ($entrada['dps'] ?? []);
  $c = cert_empresa($emp['id']);
  // reenvio de envio não confirmado: usa o MESMO número de DPS, para a Receita nunca gerar nota em duplicidade
  $nDPS = !empty($entrada['reusar']) && (int) ($d['nDPS'] ?? 0) > 0 ? (int) $d['nDPS'] : proximo_ndps($emp['id'], (string) ($d['serie'] ?? '1'), $amb, max(1, (int) ($d['nDPS'] ?? 1)));
  $dps = montar_dps($emp, $d, $amb, $nDPS);
  $assinado = assinar($dps['xml'], 'infDPS', $c);
  if (!empty($entrada['somente_xml'])) resp(200, ['ok' => true, 'teste' => true, 'idDPS' => $dps['id'], 'nDPS' => $nDPS, 'dpsXml' => $assinado]);
  $r = http('POST', $CFG['sefin'][$amb] . '/nfse', ['Content-Type: application/json', 'Accept: application/json'], json_encode(['dpsXmlGZipB64' => gz64($assinado)]), pem_tmp($c));
  $j = json_decode($r['body'], true) ?: [];
  if ($r['code'] === 201 || $r['code'] === 200) {
    $nfse = ungz64((string) ($j['nfseXmlGZipB64'] ?? ''));
    $nNFSe = ''; if ($nfse && preg_match('/<nNFSe>(\d+)<\/nNFSe>/', $nfse, $m)) $nNFSe = $m[1];
    resp(200, ['ok' => true, 'ambiente' => $amb, 'chave' => $j['chaveAcesso'] ?? '', 'idDPS' => $j['idDps'] ?? $j['idDPS'] ?? $dps['id'], 'nDPS' => $nDPS, 'nNFSe' => $nNFSe, 'dhProc' => $j['dataHoraProcessamento'] ?? '', 'alertas' => $j['alertas'] ?? [], 'nfseXml' => $nfse, 'dpsXml' => $assinado]);
  }
  $semResposta = $r['code'] === 0 || $r['code'] >= 500 || in_array($r['code'], [408, 429], true);
  falha($r['code'] ?: 502, $semResposta ? ($r['code'] ? 'A Receita está indisponível no momento (HTTP ' . $r['code'] . ').' : 'Não consegui falar com a Receita: ' . $r['erro']) : 'A Receita recusou a nota.',
    ['erros' => erros_sefin($j, (string) $r['body']), 'http' => $r['code'], 'nDPS' => $nDPS, 'idDPS' => $dps['id'], 'pendente' => $semResposta, 'dpsXml' => $assinado]);
}

if ($acao === 'consultar_dps') {
  $emp = empresa_permitida($u, (string) ($entrada['empresa'] ?? ''), ['titular', 'financeiro', 'notas']);
  $amb = ($entrada['ambiente'] ?? '') === 'producao' ? 'producao' : 'restrita';
  $id = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($entrada['idDPS'] ?? '')));
  if (strlen($id) !== 45 || strpos($id, 'DPS') !== 0) falha(422, 'Identificador da DPS inválido.');
  $c = cert_empresa($emp['id']); $m = pem_tmp($c);
  $r = http('GET', $CFG['sefin'][$amb] . '/dps/' . $id, ['Accept: application/json'], null, $m);
  if ($r['code'] === 404) resp(200, ['ok' => true, 'encontrada' => false]);
  $j = json_decode($r['body'], true) ?: [];
  $ch = dig($j['chaveAcesso'] ?? '');
  if (($r['code'] !== 200 && $r['code'] !== 201) || strlen($ch) !== 50) falha($r['code'] ?: 502, $r['code'] ? 'A Receita não respondeu a consulta (HTTP ' . $r['code'] . ').' : 'Não consegui falar com a Receita: ' . $r['erro'], ['erros' => erros_sefin($j), 'pendente' => true]);
  $r2 = http('GET', $CFG['sefin'][$amb] . '/nfse/' . $ch, ['Accept: application/json'], null, $m);
  $j2 = json_decode($r2['body'], true) ?: []; $nfse = ungz64((string) ($j2['nfseXmlGZipB64'] ?? ''));
  $nNFSe = ''; if ($nfse && preg_match('/<nNFSe>(\d+)<\/nNFSe>/', $nfse, $mm)) $nNFSe = $mm[1];
  resp(200, ['ok' => true, 'encontrada' => true, 'chave' => $ch, 'nNFSe' => $nNFSe, 'nfseXml' => $nfse, 'idDPS' => $id]);
}

if ($acao === 'cancelar') {
  $emp = empresa_permitida($u, (string) ($entrada['empresa'] ?? ''), ['titular', 'financeiro', 'notas']);
  $amb = ($entrada['ambiente'] ?? '') === 'producao' ? 'producao' : 'restrita';
  $ch = dig($entrada['chave'] ?? ''); if (strlen($ch) !== 50) falha(422, 'Chave de acesso inválida.');
  $mot = trim((string) ($entrada['motivo'] ?? '')); if (mb_strlen($mot) < 15) falha(422, 'Descreva o motivo do cancelamento (mínimo de 15 caracteres).');
  $cod = in_array((int) ($entrada['codigo'] ?? 1), [1, 2, 9], true) ? (int) $entrada['codigo'] : 1;
  $c = cert_empresa($emp['id']); $docP = dig($emp['documento']);
  // leiaute atual (v1.01): Id = "PRE" + chave (50) + tipo do evento (6) = 59 posições; nPedRegEvento não existe mais
  $id = 'PRE' . $ch . '101101';
  $xml = '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infPedReg Id="' . $id . '"><tpAmb>' . ($amb === 'producao' ? 1 : 2) . '</tpAmb><verAplic>' . xe($CFG['verAplic']) . '</verAplic><dhEvento>' . date('Y-m-d\TH:i:sP', time() - 60) . '</dhEvento>' .
    (strlen($docP) === 11 ? '<CPFAutor>' . $docP . '</CPFAutor>' : '<CNPJAutor>' . $docP . '</CNPJAutor>') . '<chNFSe>' . $ch . '</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>' . $cod . '</cMotivo><xMotivo>' . xe(mb_substr($mot, 0, 255)) . '</xMotivo></e101101></infPedReg></pedRegEvento>';
  $assinado = assinar($xml, 'infPedReg', $c);
  $r = http('POST', $CFG['sefin'][$amb] . '/nfse/' . $ch . '/eventos', ['Content-Type: application/json', 'Accept: application/json'], json_encode(['pedidoRegistroEventoXmlGZipB64' => gz64($assinado)]), pem_tmp($c));
  $j = json_decode($r['body'], true) ?: [];
  if ($r['code'] === 201 || $r['code'] === 200) resp(200, ['ok' => true, 'eventoXml' => ungz64((string) ($j['eventoXmlGZipB64'] ?? ''))]);
  $er = erros_sefin($j, (string) $r['body']); $fora = (bool) preg_grep('/^E0822\b/', $er);
  falha($r['code'] ?: 502, $fora ? 'O prazo para cancelar esta nota já acabou (regra da prefeitura no Sistema Nacional).' : 'A Receita recusou o cancelamento' . ($r['code'] ? ' (HTTP ' . $r['code'] . ')' : '') . '.', ['erros' => $er, 'http' => $r['code'], 'foraDoPrazo' => $fora]);
}

if ($acao === 'consultar_nfse') {
  // situação oficial da NFS-e na Receita: XML autorizado + se já foi cancelada (inclusive fora do portal)
  $emp = empresa_permitida($u, (string) ($entrada['empresa'] ?? ''), ['titular', 'financeiro', 'notas', 'rh', 'consulta']);
  $amb = ($entrada['ambiente'] ?? '') === 'producao' ? 'producao' : 'restrita';
  $ch = dig($entrada['chave'] ?? ''); if (strlen($ch) !== 50) falha(422, 'Chave de acesso inválida.');
  $m = pem_tmp(cert_empresa($emp['id']));
  $r = http('GET', $CFG['sefin'][$amb] . '/nfse/' . $ch, ['Accept: application/json'], null, $m);
  if ($r['code'] === 404) falha(404, 'A Receita não encontrou nota com essa chave neste ambiente.', ['http' => 404]);
  $j = json_decode($r['body'], true) ?: [];
  if ($r['code'] !== 200) falha($r['code'] ?: 502, $r['code'] ? 'A Receita não respondeu a consulta (HTTP ' . $r['code'] . ').' : 'Não consegui falar com a Receita: ' . $r['erro'], ['erros' => erros_sefin($j), 'pendente' => true]);
  $nfse = ungz64((string) ($j['nfseXmlGZipB64'] ?? ''));
  if ($nfse && strpos($nfse, dig($emp['documento'])) === false) falha(403, 'Essa nota não pertence a esta empresa.');
  $nNFSe = ''; if ($nfse && preg_match('/<nNFSe>(\d+)<\/nNFSe>/', $nfse, $mm)) $nNFSe = $mm[1];
  $canc = null;
  foreach (['101101' => 'Cancelamento', '105102' => 'Cancelamento por substituição', '305101' => 'Cancelamento deferido por análise fiscal'] as $tp => $nome) {
    $e = http('GET', $CFG['sefin'][$amb] . '/nfse/' . $ch . '/eventos/' . $tp . '/1', ['Accept: application/json'], null, $m);
    if ($e['code'] === 200) { $je = json_decode($e['body'], true) ?: []; $xe = ungz64((string) ($je['eventoXmlGZipB64'] ?? $je['eventoXml'] ?? ''));
      $dh = ''; if ($xe && preg_match('/<dhEvento>([^<]+)<\/dhEvento>/', $xe, $md)) $dh = $md[1];
      $mot = ''; if ($xe && preg_match('/<xMotivo>([^<]*)<\/xMotivo>/', $xe, $mx)) $mot = html_entity_decode($mx[1], ENT_XML1, 'UTF-8');
      $canc = ['tipo' => $nome, 'em' => $dh, 'motivo' => $mot]; break; }
  }
  resp(200, ['ok' => true, 'chave' => $ch, 'nNFSe' => $nNFSe, 'nfseXml' => $nfse, 'cancelada' => $canc]);
}

if ($acao === 'danfse') {
  $emp = empresa_permitida($u, (string) ($_GET['empresa'] ?? ''), ['titular', 'financeiro', 'notas', 'rh', 'consulta']);
  $amb = ($_GET['ambiente'] ?? '') === 'producao' ? 'producao' : 'restrita';
  $ch = dig($_GET['chave'] ?? ''); if (strlen($ch) !== 50) falha(422, 'Chave de acesso inválida.');
  $m = pem_tmp(cert_empresa($emp['id'])); $r = ['code' => 0, 'body' => ''];
  foreach (['/danfse/', '/contribuintes/danfse/'] as $cam) {  // DANFSe oficial gerado pelo Portal Nacional (ADN)
    $r = http('GET', $CFG['adn'][$amb] . $cam . $ch, ['Accept: application/pdf'], null, $m);
    if ($r['code'] === 200 && strpos($r['body'], '%PDF') === 0) break;
  }
  if ($r['code'] === 200 && strpos($r['body'], '%PDF') === 0) { header('Content-Type: application/pdf'); header('Content-Disposition: inline; filename="DANFSe_' . $ch . '.pdf"'); echo $r['body']; exit; }
  falha(404, 'DANFSe oficial indisponível no momento.', ['http' => $r['code']]);
}

falha(404, 'Ação desconhecida.');
