/* NEXIO — blog: formatação simples (estilo markdown) e utilidades compartilhadas */
(function(){
var B=window.NXB={};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
B.esc=esc;
B.slug=function(t){return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'post';};
function inline(t){return t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,'$1<i>$2</i>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');}
/* ## título · ### subtítulo · **negrito** · *itálico* · - lista · 1. lista · > destaque · [texto](link) */
B.md=function(src){var L=esc(src||'').replace(/\r/g,'').split('\n'),out=[],lista=null;
  var fecha=function(){if(lista){out.push('</'+lista+'>');lista=null;}};
  L.forEach(function(l){var t=l.trim();
    if(!t){fecha();return;}
    var m;if((m=t.match(/^###\s+(.*)/))){fecha();out.push('<h3>'+inline(m[1])+'</h3>');return;}
    if((m=t.match(/^##\s+(.*)/))){fecha();out.push('<h2>'+inline(m[1])+'</h2>');return;}
    if((m=t.match(/^&gt;\s?(.*)/))){fecha();out.push('<blockquote>'+inline(m[1])+'</blockquote>');return;}
    if((m=t.match(/^[-•]\s+(.*)/))){if(lista!=='ul'){fecha();out.push('<ul>');lista='ul';}out.push('<li>'+inline(m[1])+'</li>');return;}
    if((m=t.match(/^\d+[.)]\s+(.*)/))){if(lista!=='ol'){fecha();out.push('<ol>');lista='ol';}out.push('<li>'+inline(m[1])+'</li>');return;}
    fecha();out.push('<p>'+inline(t)+'</p>');});
  fecha();return out.join('\n');};
B.data=function(d){return d?new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'';};
B.tempo=function(txt){var n=String(txt||'').split(/\s+/).length;return Math.max(1,Math.round(n/200))+' min de leitura';};
B.CSS='.nxb-art{font-size:17px;line-height:1.75;color:#0E1A45}.nxb-art h2{font-size:24px;color:#2344AC;margin:28px 0 10px}.nxb-art h3{font-size:19px;color:#2344AC;margin:22px 0 8px}.nxb-art p{margin:0 0 14px}.nxb-art ul,.nxb-art ol{margin:0 0 14px;padding-left:22px}.nxb-art li{margin:4px 0}.nxb-art blockquote{margin:16px 0;padding:12px 16px;border-left:4px solid #0740EF;background:#F3F6FF;border-radius:8px}.nxb-art a{color:#0740EF}'+
 '.nxb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}.nxb-card{display:flex;flex-direction:column;background:#fff;border:1px solid #DCE3F5;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;transition:box-shadow .2s,transform .2s}.nxb-card:hover{box-shadow:0 12px 30px rgba(14,26,69,.12);transform:translateY(-2px)}.nxb-card .cap{aspect-ratio:16/9;background:#2344AC center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;letter-spacing:2px}.nxb-card .bd{padding:16px 18px;display:flex;flex-direction:column;gap:8px}.nxb-card .ct{font-size:12px;font-weight:700;color:#0740EF;text-transform:uppercase;letter-spacing:.5px}.nxb-card h3{margin:0;font-size:19px;color:#0E1A45;line-height:1.3}.nxb-card p{margin:0;color:#4A5A86;line-height:1.55}.nxb-card small{color:#7A86A8}';
B.card=function(p,href){return '<a class="nxb-card" href="'+href+'"><div class="cap"'+(p.capa?' style="background-image:url('+p.capa+')"':'')+'>'+(p.capa?'':'NEXIO')+'</div><div class="bd"><span class="ct">'+esc(p.categoria)+'</span><h3>'+esc(p.titulo)+'</h3><p>'+esc(p.resumo)+'</p><small>'+B.data(p.publicado_em)+'</small></div></a>';};
})();
