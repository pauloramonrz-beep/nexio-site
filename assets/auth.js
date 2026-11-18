/* NEXIO · login real (Supabase Auth) */
(function(){
  var URL='https://pctwjndleohoidikiwcv.supabase.co',KEY='sb_publishable_U8jK8tPwRuQ4xQGARUHHWg_UWz8Potv';
  var h=location.hash||'';
  window.NXA={tipoLink:/type=(invite|recovery|signup|magiclink)/.exec(h)?/type=(invite|recovery|signup|magiclink)/.exec(h)[1]:null,erroLink:/error_description=([^&]+)/.exec(h)?decodeURIComponent(/error_description=([^&]+)/.exec(h)[1].replace(/\+/g,' ')):null};
  try{NXA.sb=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storage:window.sessionStorage}});}catch(x){NXA.sb=null;}
  NXA.ok=!!NXA.sb;
  /* cliente separado, sem sessão, só para enviar convites (não mexe no login de quem convida) */
  NXA.convite=function(email,nome,redirect){var c=window.supabase.createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'nx-convite',flowType:'implicit'}});return c.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,emailRedirectTo:redirect,data:{nome:nome}}});};
  NXA.perfil=function(){return NXA.sb.auth.getUser().then(function(r){var u=r.data&&r.data.user;if(!u)return null;return NXA.sb.from('perfis').select('*').eq('id',u.id).single().then(function(p){return p.data?Object.assign({email:u.email},p.data):null;});});};
  NXA.acesso=function(acao,alvo,empresa){if(!NXA.sb)return;NXA.sb.rpc('registrar_acesso',{p_empresa:empresa||null,p_acao:acao,p_alvo:alvo||''}).then(function(){},function(){});};
  NXA.nomeSeguro=function(n){return String(n).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(-120);};
  NXA.uuid=function(){return (crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}));};
  NXA.SETORES=['Fiscal','Departamento Pessoal','Contábil','Financeiro','Societário','Certidões','Notas fiscais','Enviados pelo cliente'];
  NXA.NIVEIS={titular:'Titular',financeiro:'Financeiro',rh:'RH / Pessoal',notas:'Emissor de notas',consulta:'Consulta'};
  if(window.NX&&!NX.fmtDoc)NX.fmtDoc=function(d){d=String(d||'').replace(/\D/g,'');return d.length===14?d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):d;};
  NXA.sair=function(){return NXA.sb?NXA.sb.auth.signOut():Promise.resolve();};
})();
