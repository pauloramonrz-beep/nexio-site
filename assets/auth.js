/* NEXIO · login real (Supabase Auth) */
(function(){
  var URL='https://pctwjndleohoidikiwcv.supabase.co',KEY='sb_publishable_U8jK8tPwRuQ4xQGARUHHWg_UWz8Potv';
  var h=location.hash||'';
  window.NXA={tipoLink:/type=(invite|recovery|signup|magiclink)/.exec(h)?/type=(invite|recovery|signup|magiclink)/.exec(h)[1]:null,erroLink:/error_description=([^&]+)/.exec(h)?decodeURIComponent(/error_description=([^&]+)/.exec(h)[1].replace(/\+/g,' ')):null};
  try{NXA.sb=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.sessionStorage}});}catch(x){NXA.sb=null;}
  NXA.ok=!!NXA.sb;
  NXA.perfil=function(){return NXA.sb.auth.getUser().then(function(r){var u=r.data&&r.data.user;if(!u)return null;return NXA.sb.from('perfis').select('*').eq('id',u.id).single().then(function(p){return p.data?Object.assign({email:u.email},p.data):null;});});};
  NXA.acesso=function(acao,alvo,empresa){if(!NXA.sb)return;NXA.sb.rpc('registrar_acesso',{p_empresa:empresa||null,p_acao:acao,p_alvo:alvo||''}).then(function(){},function(){});};
  NXA.sair=function(){return NXA.sb?NXA.sb.auth.signOut():Promise.resolve();};
})();
