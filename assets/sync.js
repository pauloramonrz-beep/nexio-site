/* NEXIO · sincronização do painel e do portal com o Supabase
   O painel e o portal continuam trabalhando com o objeto "db" (mesma interface do protótipo).
   Esta camada carrega o db a partir do banco e grava as diferenças a cada NX.save(db). */
(function(){
var NXS=window.NXS={modo:null,empresa:null,interno:null,snap:{},pend:{},fila:Promise.resolve(),timer:null,erros:0,ultimo:null};
var sb=function(){return NXA.sb;};
var dig=function(s){return String(s||'').replace(/\D/g,'');};
var fmt=function(d){d=dig(d);return d.length===14?d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):d.length===11?d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):d;};
var omit=function(o,ks){var r={};Object.keys(o||{}).forEach(function(k){if(ks.indexOf(k)<0)r[k]=o[k];});return r;};
var uniao=function(a,b){var m={};(a||[]).concat(b||[]).forEach(function(x){if(x&&x.id&&!m[x.id])m[x.id]=x;});return Object.keys(m).map(function(k){return m[k];});};
var isUuid=function(s){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));};
var data=function(s){return /^\d{4}-\d{2}-\d{2}/.test(String(s||''))?String(s).slice(0,10):null;};
var comp=function(s){return /^\d{4}-\d{2}$/.test(String(s||''))?s:null;};
var SETORES=['Fiscal','Departamento Pessoal','Contábil','Financeiro','Societário','Certidões','Notas fiscais','Enviados pelo cliente','Administrativo (interno)'];
var ESTADO=['tasks','procT','servicos','meetings','contab','obligations','avisos','notifCfg','lgpdCfg','catV','procDemo','agendaSeeded','office_pastas','folders','pastas','contratoModelo','gcalClientId','contratoCopia','revalDAS1'];
function chk(r,ctx){if(r&&r.error){NXS.erros++;console.error('[sync]',ctx,r.error);NXS.ultimo=ctx+': '+r.error.message;if(window.NX&&NX.toast&&NXS.erros<4)NX.toast('Não foi possível salvar ('+ctx+'). '+r.error.message);return true;}return false;}

/* ---------- mapeamentos ---------- */
function fileFromRow(r,interno){var m=r.meta||{};return Object.assign({},m,{id:r.id,cliente:interno?undefined:r.empresa_id,setor:r.setor,tipo:r.tipo,titulo:r.titulo,comp:r.competencia||m.comp||'',venc:r.vencimento||'',valor:r.valor!=null?+r.valor:(m.valor||0),status:r.status||m.status,nome:r.nome_arquivo||m.nome||r.titulo,size:r.tamanho||m.size||0,storage_path:r.storage_path,criado:m.criado||String(r.enviado_em).slice(0,10),deleted:r.excluido_em?(m.deleted||r.excluido_em):undefined,visto:!!r.visto_em||!!m.visto,visto_em:r.visto_em});}
function fileToRow(f,interno){var setor=SETORES.indexOf(f.setor)>-1?f.setor:(interno?'Administrativo (interno)':(f.de==='cliente'?'Enviados pelo cliente':'Contábil'));
  return {id:f.id,empresa_id:interno?NXS.interno:f.cliente,setor:setor,tipo:f.tipo||'Documento',titulo:f.titulo||f.nome||'Documento',competencia:comp(f.comp),vencimento:data(f.venc),valor:f.valor?+f.valor:null,status:f.status||null,storage_path:f.storage_path,nome_arquivo:f.nome||null,tamanho:f.size||null,
    excluido_em:f.deleted?(data(f.deleted)?new Date(f.deleted).toISOString():new Date().toISOString()):null,visto_em:f.visto?(f.visto_em||new Date().toISOString()):null,meta:omit(f,['data','storage_path','visto_em'])};}
function msgFromRow(r){return Object.assign({},r.meta||{},{id:r.id,cliente:r.empresa_id,de:r.de,texto:r.texto,lida:r.lida,em:r.em});}
function msgToRow(m){return {id:m.id,empresa_id:m.cliente,de:m.de==='cliente'?'cliente':'equipe',texto:String(m.texto||''),lida:!!m.lida,em:m.em||new Date().toISOString(),meta:omit(m,['id','cliente','de','texto','lida','em'])};}
function notFromRow(r){return Object.assign({},r.meta||{},{id:r.id,cliente:r.empresa_id,ev:r.evento,titulo:r.titulo,texto:r.texto,link:r.link,canais:r.canais||['portal'],lida:r.lida,em:r.em});}
function notToRow(n){return {id:n.id,empresa_id:n.cliente,evento:n.ev||'aviso',titulo:n.titulo||'Aviso',texto:n.texto||null,link:n.link||null,canais:n.canais&&n.canais.length?n.canais:['portal'],lida:!!n.lida,em:n.em||new Date().toISOString(),meta:omit(n,['id','cliente','ev','titulo','texto','link','canais','lida','em'])};}
function notaFromRow(r){return Object.assign({},r.meta||{},{id:r.id,cliente:r.empresa_id,status:r.meta&&r.meta.status||r.situacao});}
function notaToRow(n){var fin=n.status==='autorizada'||n.status==='cancelada';return {id:n.id,empresa_id:n.cliente,serie:(n.real?(n.amb==='producao'?'P':'R'):'S')+(n.serie||'1'),n_dps:fin&&n.nDPS?+n.nDPS:-parseInt(String(n.id).replace(/[^0-9a-f]/gi,'').slice(0,12)||'1',16),chave:/^\d{50}$/.test(n.chave||'')?n.chave:null,situacao:n.status||'simulada',tomador:n.tom||{},servico:{serv:n.serv,desc:n.desc,cTrib:n.cTrib},valores:{valor:n.valor,iss:n.iss,aliq:n.aliqISS},emitida_em:n.dhEmi||new Date().toISOString(),meta:omit(n,['id','cliente'])};}
function lgFromRow(r){return Object.assign({},r.meta||{},{id:r.id,cliente:r.empresa_id,usuario:r.usuario_id,tipo:r.tipo,texto:r.texto,prazo:r.prazo,status:r.status,resposta:r.resposta,em:r.em});}
function lgToRow(r,novo){var o={id:r.id,empresa_id:r.cliente||null,tipo:r.tipo,texto:r.texto,prazo:data(r.prazo),status:r.status||'aberta',resposta:r.resposta||null,respondida_em:r.concluida||null,meta:omit(r,['id','cliente','usuario','tipo','texto','prazo','status','resposta'])};if(!novo)delete o.texto;return o;}
function incFromRow(r){return Object.assign({},r.meta||{},{id:r.id});}
function incToRow(i){return {id:i.id,identificado_em:data(i.data)||new Date().toISOString().slice(0,10),descricao:i.desc||'',dados_afetados:i.dados||'',risco:['Baixo','Médio','Alto'].indexOf(i.risco)>-1?i.risco:'Baixo',medidas:i.medidas||null,comunicado_anpd:data(i.anpd),comunicado_titulares:data(i.tit),status:i.status||'Em apuração',meta:i};}
var CLI_COLS=['id','nome','fantasia','doc','trib','insc','email','tel','endereco','licencas','socios'];
function cliFromRow(r){var I=r.inscricoes||{},d=r.dados||{};return Object.assign({},d,{id:r.id,nome:r.razao_social,fantasia:r.fantasia||'',doc:fmt(r.documento),trib:Object.assign({},r.trib||{},d.trib||{},r.trib||{}),insc:{im:I.im,ie:I.ie,nire:I.nire,ccm:I.ccm,conselho:I.conselho,suframa:I.suframa},email:I.email||d.email||'',tel:I.telefone||d.tel||'',endereco:I.endereco||d.endereco||'',licencas:r.licencas||[],socios:r.socios||[],cidade:d.cidade||(r.trib||{}).mun||''});}
function cliToRow(c,db){var T=c.trib||{},I=c.insc||{};var cat=(window.NX&&db.procT)?NX.catalogFor(db,c).map(function(tp){return {id:tp.id,titulo:tp.titulo,setor:tp.setor,venc:tp.venc,per:tp.per,mes:tp.mes};}):[];
  return {id:c.id,razao_social:c.nome||'Sem nome',fantasia:c.fantasia||null,documento:dig(c.doc)||String(c.id).slice(0,14),municipio_ibge:/^\d{7}$/.test(T.ibge||'')?T.ibge:(c._ibge||'1302603'),trib:T,
    inscricoes:{im:I.im||'',ie:I.ie||'',nire:I.nire||'',ccm:I.ccm||'',conselho:I.conselho||'',suframa:I.suframa||'',email:c.email||'',telefone:c.tel||'',endereco:c.endereco||''},licencas:c.licencas||[],socios:c.socios||[],
    dados:Object.assign(omit(c,CLI_COLS.concat(['senha'])),{pastas:uniao((db.folders||[]).filter(function(x){return x.cliente===c.id;}),c.pastas||[]),catalogo:cat,obrigacoes_extra:(db.obligations||[]).filter(function(o){return o.cliente==='*'||o.cliente===c.id;})})};}
function staffFromRow(p){var x=p.extra||{};return Object.assign({},x,{id:p.id,nome:p.nome,email:p.email,nivel:p.nivel_eq||'analista',setor:p.setor_eq||x.setor||'',ativo:p.ativo,real:true});}
function staffToRow(s){return {nome:s.nome,nivel_eq:s.nivel||'analista',extra:omit(s,['id','nome','email','nivel','ativo','real'])};}

/* ---------- carregar ---------- */
function marcar(db){db.fichaV=1;db.contabV=1;db.notifInit=1;db.usersV=1;db.realV=1;db.agendaSeeded=true;if(db.procDemo==null)db.procDemo=1;db.notifs=db.notifs||[];db.notas=db.notas||[];db.lgpd=db.lgpd||[];db.incidentes=db.incidentes||[];db.office=db.office||[];db.avisos=db.avisos||[];db.cusers=db.cusers||[];db.acessos=db.acessos||[];db.meetings=db.meetings||[];db.obligations=db.obligations||[];db.tasks=db.tasks||[];}
NXS.carregarEquipe=function(){NXS.modo='equipe';NX.realMode=true;
  var q=function(t,sel,o){var x=sb().from(t).select(sel||'*');if(o)x=x.order(o,{ascending:true});return x.limit(10000);};
  return Promise.all([q('empresas'),q('documentos','*','enviado_em'),q('mensagens','*','em'),q('notificacoes','*','em'),q('nfse','*','emitida_em'),q('lgpd_solicitacoes','*','em'),q('incidentes'),q('estado'),sb().from('perfis').select('*').eq('tipo','equipe'),q('empresa_usuarios','empresa_id,usuario_id,nivel,perfis(nome,email,aceite_em,aceite_versao,marketing)'),sb().rpc('acessos_recentes',{p_limite:3000})]).then(function(R){
    var errs=R.filter(function(r){return r.error&&!/acessos_recentes/.test(String(r.error.message));});if(R[0].error)throw R[0].error;
    var emps=R[0].data||[],interno=emps.filter(function(e){return e.interno;})[0];NXS.interno=interno?interno.id:null;
    var db={};(R[7].data||[]).forEach(function(r){db[r.chave]=r.dados;});
    db.clients=emps.filter(function(e){return !e.interno&&e.ativo!==false;}).map(cliFromRow);
    var docs=R[1].data||[];db.files=docs.filter(function(d){return d.empresa_id!==NXS.interno;}).map(function(d){return fileFromRow(d,false);});db.office=docs.filter(function(d){return d.empresa_id===NXS.interno&&!d.excluido_em;}).map(function(d){return fileFromRow(d,true);});
    db.messages=(R[2].data||[]).map(msgFromRow);db.notifs=(R[3].data||[]).map(notFromRow);db.notas=(R[4].data||[]).map(notaFromRow);db.lgpd=(R[5].data||[]).map(lgFromRow);db.incidentes=(R[6].data||[]).map(incFromRow);
    db.folders=uniao(db.folders||[],[].concat.apply([],db.clients.map(function(c){return c.pastas||[];})));
    db.staff=(R[8].data||[]).filter(function(p){return p.ativo;}).map(staffFromRow);
    var cu={};(R[9].data||[]).forEach(function(x){if(!x.perfis)return;var u=cu[x.usuario_id]=cu[x.usuario_id]||{id:x.usuario_id,nome:x.perfis.nome,email:x.perfis.email,nivel:x.nivel,empresas:[],aceite:x.perfis.aceite_em?{v:x.perfis.aceite_versao,em:x.perfis.aceite_em,marketing:x.perfis.marketing}:null,real:true};u.empresas.push(x.empresa_id);});db.cusers=Object.keys(cu).map(function(k){return cu[k];});
    db.acessos=((R[10]&&R[10].data)||[]).slice().reverse().map(function(a){return {tipo:a.tipo==='equipe'?'equipe':'cliente',quem:a.nome,nivel:a.nivel,acao:a.acao,alvo:a.alvo||'',cliente:a.empresa,em:a.em,ip:a.ip};});
    marcar(db);NXS.fotografar(db);Object.keys(NXS.snap.clients||{}).forEach(function(id){NXS.snap.clients[id]='~';});return db;});};
NXS.carregarCliente=function(perfil,emps,atual){NXS.modo='cliente';NXS.empresa=atual.id;NX.realMode=true;
  var id=atual.id,q=function(t,o){return sb().from(t).select('*').eq('empresa_id',id).order(o,{ascending:true}).limit(5000);};
  return Promise.all([sb().from('empresas').select('*').in('id',emps.map(function(e){return e.id;})),q('documentos','enviado_em'),q('mensagens','em'),q('notificacoes','em'),q('nfse','emitida_em'),sb().from('lgpd_solicitacoes').select('*').eq('usuario_id',perfil.id),sb().from('financeiro').select('*').eq('empresa_id',id).maybeSingle()]).then(function(R){
    if(R[0].error)throw R[0].error;
    var db={staff:[],clients:(R[0].data||[]).map(cliFromRow)};var me=db.clients.filter(function(c){return c.id===id;})[0]||{};
    db.procT=(me.catalogo||[]).map(function(t){return Object.assign({planos:['SN','MEI','PF']},t);});db.clients.forEach(function(c){c.obrig=(c.catalogo||[]).map(function(t){return t.id;});});
    db.obligations=me.obrigacoes_extra||[];db.folders=me.pastas||[];db.clients.forEach(function(c){c.resp=perfil.nome;});
    db.files=(R[1].data||[]).map(function(d){return fileFromRow(d,false);});db.messages=(R[2].data||[]).map(msgFromRow);db.notifs=(R[3].data||[]).map(notFromRow);db.notas=(R[4].data||[]).map(notaFromRow);db.lgpd=(R[5].data||[]).map(lgFromRow);
    db.cusers=[{id:perfil.id,nome:perfil.nome,email:perfil.email,nivel:atual.nivel,empresas:emps.map(function(e){return e.id;}),niveis:emps.reduce(function(a,e){a[e.id]=e.nivel;return a;},{}),aceite:perfil.aceite_versao?{v:perfil.aceite_versao,em:perfil.aceite_em,marketing:perfil.marketing}:null,real:true}];
    NXS.fin=R[6]&&R[6].data?R[6].data.dados:null;
    marcar(db);NXS.fotografar(db);return db;});};

/* ---------- diferenças ---------- */
function linhas(db){var L={};var ap=function(k,arr,fn){L[k]={};(arr||[]).forEach(function(x){if(x&&x.id)L[k][x.id]=fn(x);});};
  if(NXS.modo==='equipe'){ap('clients',db.clients,function(c){return cliToRow(c,db);});ap('files',db.files,function(f){return fileToRow(f,false);});ap('office',db.office,function(f){return fileToRow(Object.assign({setor:'Administrativo (interno)',tipo:'Documento',titulo:f.nome},f),true);});
    ap('staff',db.staff,staffToRow);ap('incidentes',db.incidentes,incToRow);L.estado={};ESTADO.forEach(function(k){if(db[k]!==undefined)L.estado[k]=db[k];});}
  else{ap('files',db.files,function(f){return fileToRow(f,false);});var me=(db.clients||[]).filter(function(c){return c.id===NXS.empresa;})[0]||{};L.cfg={c:{nfCfg:me.nfCfg||null,notifPref:me.notifPref||null,cert:me.cert||null,pastas:(db.folders||[]).filter(function(x){return x.cliente===NXS.empresa;})}};}
  ap('messages',db.messages,msgToRow);ap('notifs',db.notifs,notToRow);ap('notas',db.notas,notaToRow);ap('lgpd',db.lgpd,function(r){return lgToRow(r,false);});return L;}
var S=function(x){return JSON.stringify(x);};
NXS.fotografar=function(db){var L=linhas(db),s={};Object.keys(L).forEach(function(k){s[k]={};Object.keys(L[k]).forEach(function(id){s[k][id]=S(L[k][id]);});});NXS.snap=s;};
var TAB={clients:'empresas',files:'documentos',office:'documentos',messages:'mensagens',notifs:'notificacoes',notas:'nfse',lgpd:'lgpd_solicitacoes',incidentes:'incidentes'};

/* arquivos novos: sobe o conteúdo antes de criar o registro */
function subir(f,interno){var empresa=interno?NXS.interno:(f.cliente||NXS.empresa);if(!empresa||!f.data)return Promise.resolve(null);
  var path=empresa+'/'+(NXS.modo==='cliente'?'cliente/':'')+f.id+'-'+NXA.nomeSeguro(f.nome||'arquivo');
  var p=f.data.split(','),mime=(p[0].match(/:(.*?);/)||[])[1]||'application/octet-stream',bin=atob(p[1]),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return sb().storage.from('documentos').upload(path,new Blob([u],{type:mime}),{contentType:mime,upsert:true}).then(function(r){if(chk(r,'envio do arquivo '+(f.nome||'')))return null;return path;});}
NX.beforeSave=function(db){if(!NX.realMode||!NXS.modo)return;
  /* equipe vendo o portal do cliente: nada é gravado, EXCETO as notas fiscais (uma nota emitida nunca pode sumir) */
  if(NXS.somenteLeitura){if(!db.notas)return;clearTimeout(NXS.timer);var so={notas:JSON.parse(JSON.stringify(db.notas))};NXS.timer=setTimeout(function(){NXS.fila=NXS.fila.then(function(){return pushNotas(so.notas);}).catch(function(e){console.error(e);});},600);return;}
  [['files',false],['office',true]].forEach(function(x){(db[x[0]]||[]).forEach(function(f){if(f.data&&!f.storage_path&&!NXS.pend[f.id]){NXS.pend[f.id]={data:f.data,interno:x[1]};}});});
  clearTimeout(NXS.timer);var snapDb=JSON.parse(JSON.stringify(db,function(k,v){return k==='data'&&typeof v==='string'&&v.indexOf('data:')===0?undefined:v;}));
  NXS.timer=setTimeout(function(){NXS.empurrar(snapDb);},600);};
NXS.empurrar=function(db){NXS.fila=NXS.fila.then(function(){return push(db);}).catch(function(e){console.error(e);});return NXS.fila;};
function pushNotas(notas){var old=NXS.snap.notas=NXS.snap.notas||{},ops=[];
  (notas||[]).forEach(function(n){if(!n||!isUuid(n.id))return;var row=notaToRow(n),st=S(row);if(old[n.id]===st)return;var novo=!old[n.id];
    ops.push((novo?sb().from('nfse').insert(row):sb().from('nfse').update(omit(row,['id'])).eq('id',n.id)).then(function(r){if(r.error&&novo&&/duplicate|23505/.test(r.error.code+r.error.message))return sb().from('nfse').update(omit(row,['id'])).eq('id',n.id);return r;}).then(function(r){if(!chk(r,'gravar nota'))old[n.id]=st;}));});
  return Promise.all(ops);}
function push(db){var L=linhas(db),old=NXS.snap,ops=[];
  /* uploads pendentes */
  var ups=Object.keys(NXS.pend).map(function(id){var p=NXS.pend[id],arr=p.interno?db.office:db.files,f=(arr||[]).filter(function(x){return x.id===id;})[0];if(!f){delete NXS.pend[id];return Promise.resolve();}
    if(f.storage_path)return Promise.resolve();return subir(Object.assign({},f,{data:p.data}),p.interno).then(function(path){if(!path)return;f.storage_path=path;var k=p.interno?'office':'files';L[k][id]=fileToRow(p.interno?Object.assign({setor:'Administrativo (interno)',tipo:'Documento',titulo:f.nome},f):f,p.interno);
      try{var c=JSON.parse(localStorage.getItem(NXS.chave)||'null');if(c){(c[k]||[]).forEach(function(x){if(x.id===id)x.storage_path=path;});localStorage.setItem(NXS.chave,JSON.stringify(c));}}catch(x){}
      setTimeout(function(){delete NXS.pend[id];},120000);});});
  return Promise.all(ups).then(function(){
    Object.keys(TAB).forEach(function(k){if(!L[k])return;var t=TAB[k],cur=L[k],prev=old[k]||{};
      Object.keys(cur).forEach(function(id){var s=S(cur[id]);if(prev[id]===s)return;var row=cur[id];
        if((k==='files'||k==='office')&&!row.storage_path)return; /* aguarda upload */
        if(!isUuid(id))return;
        if(NXS.modo==='cliente'&&k==='files'&&!prev[id]&&row.setor!=='Enviados pelo cliente')row.setor='Enviados pelo cliente';
        var novo=!prev[id],q;
        if(k==='lgpd'){row=novo?Object.assign(lgToRow(db.lgpd.filter(function(x){return x.id===id;})[0],true)):row;q=novo?sb().from(t).insert(row):sb().from(t).update(row).eq('id',id);}
        else if(k==='clients'){q=novo?sb().from(t).insert(row):sb().from(t).update(omit(row,['id'])).eq('id',id);}
        else q=novo?sb().from(t).insert(row):sb().from(t).update(omit(row,['id'])).eq('id',id);
        ops.push(q.then(function(r){if(!chk(r,'gravar '+k)){old[k]=old[k]||{};old[k][id]=s;}}));});
      Object.keys(prev).forEach(function(id){if(cur[id])return;
        if(k==='notas'){if(window.console)console.warn('NEXIO: notas fiscais nunca são apagadas do banco ('+id+').');return;}
        var q;if(k==='clients')q=sb().from(t).update({ativo:false}).eq('id',id);
        else if(k==='files'||k==='office'){var path=(JSON.parse(prev[id])||{}).storage_path;q=sb().from(t).delete().eq('id',id).then(function(r){if(!r.error&&path)sb().storage.from('documentos').remove([path]);return r;});}
        else q=sb().from(t).delete().eq('id',id);
        ops.push(q.then(function(r){if(!chk(r,'excluir '+k))delete old[k][id];}));});});
    if(L.estado){var pe=old.estado||{};Object.keys(L.estado).forEach(function(k){var s=S(L.estado[k]);if(pe[k]===s)return;ops.push(sb().from('estado').upsert({chave:k,dados:L.estado[k],atualizado_em:new Date().toISOString()}).then(function(r){if(!chk(r,'estado '+k)){old.estado=old.estado||{};old.estado[k]=s;}}));});}
    if(L.staff){var ps=old.staff||{};Object.keys(L.staff).forEach(function(id){var s=S(L.staff[id]);if(!ps[id]||ps[id]===s)return;ops.push(sb().from('perfis').update(L.staff[id]).eq('id',id).then(function(r){if(!chk(r,'equipe')){old.staff[id]=s;}}));});}
    if(L.cfg){var pc=(old.cfg||{}).c,s2=S(L.cfg.c);if(pc&&pc!==s2)ops.push(sb().rpc('cliente_config',{p_empresa:NXS.empresa,p_dados:L.cfg.c}).then(function(r){if(!chk(r,'configurações')){old.cfg={c:s2};}}));}
    return Promise.all(ops);});}

/* ---------- visualizar / baixar arquivos guardados no servidor ---------- */
function urlAssinada(f){return sb().storage.from('documentos').createSignedUrl(f.storage_path,300).then(function(r){if(r.error)throw r.error;return r.data.signedUrl;});}
var viewerOrig=NX.viewer,downOrig=NX.download;
function regView(f,acao){try{if(NX.realMode&&/^[0-9a-f-]{36}$/i.test(f.id||'')&&!NXS.pend[f.id])sb().rpc('registrar_visualizacao',{p_doc:f.id,p_acao:acao}).then(function(){});}catch(e){}}
NXS.visualizacoes=function(id){return sb().from('doc_visualizacoes').select('nome,email,tipo,acao,em').eq('documento_id',id).order('em',{ascending:false}).limit(200);};
function painelViews(f){if(NXS.modo!=='equipe'||!/^[0-9a-f-]{36}$/i.test(f.id||''))return;var tent=0;(function poe(){var side=document.querySelector('#nxv[open] .nxv-side');if(!side){if(tent++<40)setTimeout(poe,150);return;}
  var box=document.createElement('div');box.innerHTML='<h3 style="font-size:15px;color:var(--blue2);margin:6px 0">Quem visualizou</h3><p class="help">Carregando…</p>';side.appendChild(box);
  NXS.visualizacoes(f.id).then(function(r){var l=r.data||[],e=NX.esc;box.innerHTML='<h3 style="font-size:15px;color:var(--blue2);margin:6px 0">Quem visualizou ('+l.length+')</h3>'+(l.length?'<div style="display:flex;flex-direction:column;gap:6px;font-size:13px">'+l.map(function(v){return '<div style="border-bottom:1px solid var(--line);padding-bottom:4px"><b>'+e(v.nome||v.email||'—')+'</b> <span class="tag '+(v.tipo==='cliente'?'info':'')+'" style="font-size:11px">'+(v.tipo==='cliente'?'Cliente':'Equipe')+'</span><br><span style="color:var(--muted)">'+e(v.acao)+' em '+new Date(v.em).toLocaleString('pt-BR')+'</span></div>';}).join('')+'</div>':'<p class="help">Ninguém abriu este documento ainda.</p>');});})();}
NX.viewer=function(f,ctx){regView(f,'Visualizou');painelViews(f);if(!NX.realMode||f.data)return viewerOrig(f,ctx);var p=NXS.pend[f.id];if(p)return viewerOrig(Object.assign({},f,{data:p.data}),ctx);
  if(!f.storage_path){NX.toast('Arquivo ainda sendo enviado. Tente em instantes.');return;}
  urlAssinada(f).then(function(u){return fetch(u);}).then(function(r){return r.blob();}).then(function(b){var fr=new FileReader();fr.onload=function(){viewerOrig(Object.assign({},f,{data:fr.result}),ctx);};fr.readAsDataURL(b);}).catch(function(e){NX.toast('Não foi possível abrir: '+(e.message||e));});
  NXA.acesso('Abriu documento',f.titulo,f.cliente);};
NX.download=function(f){regView(f,'Baixou');if(!NX.realMode||f.data)return downOrig(f);var p=NXS.pend[f.id];if(p)return downOrig(Object.assign({},f,{data:p.data}));
  if(!f.storage_path){NX.toast('Arquivo ainda sendo enviado. Tente em instantes.');return;}
  sb().storage.from('documentos').createSignedUrl(f.storage_path,300,{download:f.nome||true}).then(function(r){if(r.error){NX.toast('Erro: '+r.error.message);return;}var a=document.createElement('a');a.href=r.data.signedUrl;document.body.appendChild(a);a.click();a.remove();NXA.acesso('Baixou documento',f.titulo,f.cliente);});};
/* registro de acessos também no banco */
var logOrig=NX.log;NX.log=function(db,o){logOrig(db,o);if(NX.realMode&&NXS.modo)NXA.acesso(o.acao||'',o.alvo||'',isUuid(o.cliente)?o.cliente:(NXS.modo==='cliente'?NXS.empresa:null));};

/* ---------- abrir sessão real ---------- */
NXS.iniciar=function(chave,db){NXS.chave=chave;NX.useKey(chave);localStorage.setItem(chave,JSON.stringify(db));};
NXS.atualizar=function(cb){if(!NXS.modo)return;var pend=Object.keys(NXS.pend).length;if(pend){return;}
  NXS.fila.then(function(){var p=NXS.modo==='equipe'?NXS.carregarEquipe():NXS.carregarCliente(NXS._perfil,NXS._emps,NXS._atual);return p.then(function(db){localStorage.setItem(NXS.chave,JSON.stringify(db));cb&&cb();});}).catch(function(e){console.error(e);});};
})();
