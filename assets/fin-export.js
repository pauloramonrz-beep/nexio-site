/* NEXIO — exportação do controle financeiro (OFX, OFC, CSV e PDF com timbre) */
(function(){
var F=window.NXF={};
function d8(iso){return String(iso).replace(/-/g,'');}
function amt(v){return Number(v).toFixed(2);}
function clean(s){return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[<>&]/g,' ').slice(0,80);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function brl(n){return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function fdate(iso){var p=String(iso).slice(0,10).split('-');return p[2]+'/'+p[1]+'/'+p[0];}
function fitid(i,ix){return clean(i.fitid||'')||(d8(i.data)+String(ix+1).padStart(4,'0')+Math.round(Math.abs(i.valor)*100));}
function bank(emp){return emp.tipo==='caixa'?'999':String(emp.banco||'').replace(/\D/g,'').padStart(3,'0');}
F.nome=function(emp,periodo,ext){return ('extrato_'+clean(emp.nome||'empresa').replace(/\s+/g,'_').toLowerCase()+'_'+(periodo||'todos')).replace(/_+$/,'').replace(/_+/g,'_')+'.'+ext;};
F.baixar=function(txt,name,type){var b=new Blob([txt],{type:type});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);};
F.ofx=function(emp,l,ini){var fim=ini+l.reduce(function(s,i){return s+i.valor;},0),now=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
  return 'OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\nSECURITY:NONE\r\nENCODING:USASCII\r\nCHARSET:1252\r\nCOMPRESSION:NONE\r\nOLDFILEUID:NONE\r\nNEWFILEUID:NONE\r\n\r\n'+
  '<OFX>\r\n<SIGNONMSGSRSV1>\r\n<SONRS>\r\n<STATUS>\r\n<CODE>0\r\n<SEVERITY>INFO\r\n</STATUS>\r\n<DTSERVER>'+now+'\r\n<LANGUAGE>POR\r\n</SONRS>\r\n</SIGNONMSGSRSV1>\r\n'+
  '<BANKMSGSRSV1>\r\n<STMTTRNRS>\r\n<TRNUID>1\r\n<STATUS>\r\n<CODE>0\r\n<SEVERITY>INFO\r\n</STATUS>\r\n<STMTRS>\r\n<CURDEF>BRL\r\n<BANKACCTFROM>\r\n<BANKID>'+bank(emp)+'\r\n<BRANCHID>'+clean(emp.ag)+'\r\n<ACCTID>'+clean(emp.conta)+'\r\n<ACCTTYPE>CHECKING\r\n</BANKACCTFROM>\r\n'+
  '<BANKTRANLIST>\r\n<DTSTART>'+d8(l[0].data)+'\r\n<DTEND>'+d8(l[l.length-1].data)+'\r\n'+
  l.map(function(i,ix){return '<STMTTRN>\r\n<TRNTYPE>'+(i.valor>=0?'CREDIT':'DEBIT')+'\r\n<DTPOSTED>'+d8(i.data)+'\r\n<TRNAMT>'+amt(i.valor)+'\r\n<FITID>'+fitid(i,ix)+'\r\n<CHECKNUM>'+fitid(i,ix)+'\r\n<MEMO>'+clean(i.desc+' - '+i.cat)+'\r\n</STMTTRN>\r\n';}).join('')+
  '</BANKTRANLIST>\r\n<LEDGERBAL>\r\n<BALAMT>'+amt(fim)+'\r\n<DTASOF>'+d8(l[l.length-1].data)+'\r\n</LEDGERBAL>\r\n</STMTRS>\r\n</STMTTRNRS>\r\n</BANKMSGSRSV1>\r\n</OFX>\r\n';};
F.ofc=function(emp,l,ini){var fim=ini+l.reduce(function(s,i){return s+i.valor;},0);
  return '<OFC>\r\n<DTD>2\r\n<CPAGE>1252\r\n<ACCTSTMT>\r\n<ACCTFROM>\r\n<BANKID>'+bank(emp)+'\r\n<BRANCHID>'+clean(emp.ag)+'\r\n<ACCTID>'+clean(emp.conta)+'\r\n<ACCTTYPE>0\r\n</ACCTFROM>\r\n<STMTRS>\r\n<DTSTART>'+d8(l[0].data)+'\r\n<DTEND>'+d8(l[l.length-1].data)+'\r\n<LEDGER>'+amt(fim)+'\r\n'+
  l.map(function(i,ix){return '<STMTTRN>\r\n<TRNTYPE>'+(i.valor>=0?'1':'0')+'\r\n<DTPOSTED>'+d8(i.data)+'\r\n<TRNAMT>'+amt(i.valor)+'\r\n<FITID>'+fitid(i,ix)+'\r\n<CHKNUM>'+fitid(i,ix)+'\r\n<MEMO>'+clean(i.desc+' - '+i.cat)+'\r\n</STMTTRN>\r\n';}).join('')+
  '</STMTRS>\r\n</ACCTSTMT>\r\n</OFC>\r\n';};
F.csv=function(l){return '﻿Data;Descrição;Categoria;Origem;Tipo;Valor\r\n'+l.map(function(i){return fdate(i.data)+';'+String(i.desc).replace(/;/g,',')+';'+i.cat+';'+(i.orig==='banco'?'Extrato':'Manual')+';'+(i.valor>=0?'Entrada':'Saída')+';'+Number(i.valor).toFixed(2).replace('.',',');}).join('\r\n');};
/* PDF: abre o relatório timbrado e chama a impressão (Salvar como PDF) */
F.pdf=function(o){var emp=o.emp||{},l=o.items,ini=o.ini||0,inn=0,out=0,cats={},saldo=ini;
  l.forEach(function(i){if(i.valor>=0)inn+=i.valor;else out+=i.valor;var c=cats[i.cat]=cats[i.cat]||{e:0,s:0};if(i.valor>=0)c.e+=i.valor;else c.s+=i.valor;});
  var per=o.periodo?(o.periodo.length===7?o.periodo.split('-').reverse().join('/'):o.periodo):(l.length?fdate(l[0].data)+' a '+fdate(l[l.length-1].data):'—');
  var logo=location.origin+'/assets/logo-nexio.png';
  var h='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório financeiro — '+esc(emp.nome||'')+' — '+esc(per)+'</title><style>'+
  '@page{size:A4;margin:14mm 12mm 16mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Calibri,Arial,sans-serif;color:#555}}'+
  '*{box-sizing:border-box}body{font:10pt/1.45 Calibri,Arial,sans-serif;color:#000;margin:0}'+
  '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2344AC;padding-bottom:8px}'+
  '.wm b{display:block;color:#2344AC;font:700 22pt/1 Arial,sans-serif;letter-spacing:4px}.wm small{color:#2344AC;font-size:7pt;letter-spacing:3px}.wm img{height:46px;display:block}'+
  '.ti{text-align:right}.ti h1{margin:0;font-size:15pt;color:#2344AC}.ti span{color:#555;font-size:9pt}'+
  '.cli{margin:12px 0;border:1px solid #c9d3f0;border-radius:6px;display:grid;grid-template-columns:repeat(3,1fr)}.cli div{padding:6px 10px;border-right:1px solid #e3e8f7;border-bottom:1px solid #e3e8f7}.cli div:nth-child(3n){border-right:0}.cli small{display:block;color:#555;font-size:7.5pt;text-transform:uppercase;letter-spacing:.5px}.cli b{font-size:10pt}.cli .w{grid-column:span 2}'+
  '.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}.sum div{border-radius:6px;padding:8px 10px;background:#F3EFEC}.sum div.m{background:#2344AC;color:#fff}.sum small{display:block;font-size:7.5pt;text-transform:uppercase;opacity:.85}.sum b{font-size:12.5pt}'+
  'h2{font-size:11pt;color:#2344AC;margin:14px 0 6px;border-bottom:1px solid #c9d3f0;padding-bottom:3px}'+
  'table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#2344AC;color:#fff;text-align:left;padding:5px 6px;font-weight:600}td{padding:4px 6px;border-bottom:1px solid #e6e6e6}tr:nth-child(even) td{background:#f7f8fc}thead{display:table-header-group}tr{page-break-inside:avoid}'+
  '.r{text-align:right;white-space:nowrap}.p{color:#0a7a4f}.n{color:#b3261e}tfoot td{font-weight:700;background:#eef2ff!important;border-top:1.5px solid #2344AC}'+
  '.ft{margin-top:18px;border-top:1px solid #2344AC;padding-top:5px;font-size:7.5pt;color:#555}'+
  '</style></head><body>'+
  '<div class="hd"><div class="wm"><img src="'+logo+'" alt="NEXIO Inteligência Contábil"></div><div class="ti"><h1>Relatório financeiro</h1><span>Período: '+esc(per)+'</span></div></div>'+
  '<div class="cli"><div class="w"><small>Empresa</small><b>'+esc(emp.nome||'—')+'</b></div><div><small>CNPJ / CPF</small><b>'+esc(emp.doc||'—')+'</b></div>'+
  '<div><small>Banco</small><b>'+esc(emp.banco||'—')+'</b></div><div><small>Agência</small><b>'+esc(emp.ag||'—')+'</b></div><div><small>Conta</small><b>'+esc(emp.conta||'—')+'</b></div>'+
  '<div><small>Lançamentos</small><b>'+l.length+'</b></div><div><small>Emitido em</small><b>'+new Date().toLocaleString('pt-BR')+'</b></div><div><small>Emitido por</small><b>'+esc(o.por||'—')+'</b></div></div>'+
  '<div class="sum"><div><small>Saldo inicial</small><b>'+brl(ini)+'</b></div><div><small>Entradas</small><b class="p">'+brl(inn)+'</b></div><div><small>Saídas</small><b class="n">'+brl(Math.abs(out))+'</b></div><div class="m"><small>Saldo final</small><b>'+brl(ini+inn+out)+'</b></div></div>'+
  '<h2>Resumo por categoria</h2><table><thead><tr><th>Categoria</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th></tr></thead><tbody>'+
  Object.keys(cats).sort().map(function(k){var c=cats[k];return '<tr><td>'+esc(k)+'</td><td class="r p">'+(c.e?brl(c.e):'')+'</td><td class="r n">'+(c.s?brl(Math.abs(c.s)):'')+'</td><td class="r">'+brl(c.e+c.s)+'</td></tr>';}).join('')+
  '</tbody><tfoot><tr><td>Total</td><td class="r">'+brl(inn)+'</td><td class="r">'+brl(Math.abs(out))+'</td><td class="r">'+brl(inn+out)+'</td></tr></tfoot></table>'+
  '<h2>Lançamentos</h2><table><thead><tr><th style="width:62px">Data</th><th>Descrição</th><th>Categoria</th><th style="width:52px">Origem</th><th class="r">Entrada</th><th class="r">Saída</th><th class="r">Saldo</th></tr></thead><tbody>'+
  l.map(function(i){saldo+=i.valor;return '<tr><td>'+fdate(i.data)+'</td><td>'+esc(i.desc)+'</td><td>'+esc(i.cat)+'</td><td>'+(i.orig==='banco'?'Extrato':'Manual')+'</td><td class="r p">'+(i.valor>=0?brl(i.valor):'')+'</td><td class="r n">'+(i.valor<0?brl(Math.abs(i.valor)):'')+'</td><td class="r">'+brl(saldo)+'</td></tr>';}).join('')+
  '</tbody><tfoot><tr><td colspan="4">Totais do período</td><td class="r">'+brl(inn)+'</td><td class="r">'+brl(Math.abs(out))+'</td><td class="r">'+brl(ini+inn+out)+'</td></tr></tfoot></table>'+
  '<div class="ft">Nexio Inteligência Contábil Ltda • Av. Brig. Faria Lima, 1811 - CXPST ESC1119 - Jardim Paulistano, São Paulo - SP, 01452-001<br>(11) 93956-5190 • contato@nexioic.com.br • Contabilidade que impulsiona o futuro.</div>'+
  '<script>window.onload=function(){setTimeout(function(){print()},300)}<\/script></body></html>';
  var w=window.open('','_blank');if(!w){alert('Libere as janelas pop-up deste site para gerar o PDF.');return;}w.document.write(h);w.document.close();};

/* ---------- categorias, contas e DRE gerencial (regime de caixa) ---------- */
F.CATS_IN=['Receita de serviços','Receita de vendas','Vendas em dinheiro','Rendimentos financeiros','Aporte dos sócios','Empréstimos recebidos','Outras entradas'];
F.CATS_OUT=['Impostos sobre o faturamento','Fornecedores','Compras de mercadorias','Materiais e insumos','Folha e encargos','Pró-labore','Aluguel','Energia, água e internet','Marketing','Software e sistemas','Honorários contábeis','Manutenção','Combustível e transporte','Tarifas bancárias','Juros e multas','Impostos e taxas','Parcelas de empréstimos','Compra de equipamentos','Retirada dos sócios','Outras saídas','A classificar'];
F.TRANSF='Transferência entre contas';
var G=[
 {k:'rec',label:'Receita bruta',cats:['Receita de serviços','Receita de vendas','Vendas em dinheiro','Outras entradas']},
 {k:'ded',label:'(−) Impostos sobre o faturamento',cats:['Impostos sobre o faturamento']},
 {t:'Receita líquida',soma:['rec','ded']},
 {k:'cus',label:'(−) Custos (fornecedores, mercadorias e insumos)',cats:['Fornecedores','Compras de mercadorias','Materiais e insumos']},
 {t:'Lucro bruto',soma:['rec','ded','cus']},
 {k:'pes',label:'(−) Pessoal (folha, encargos e pró-labore)',cats:['Folha e encargos','Pró-labore']},
 {k:'adm',label:'(−) Despesas administrativas e operacionais',cats:['Aluguel','Energia, água e internet','Marketing','Software e sistemas','Honorários contábeis','Manutenção','Combustível e transporte','Impostos e taxas','Outras saídas','A classificar']},
 {t:'Resultado operacional',soma:['rec','ded','cus','pes','adm']},
 {k:'fin',label:'(+/−) Resultado financeiro',cats:['Rendimentos financeiros','Tarifas bancárias','Juros e multas']},
 {t:'Resultado líquido do período',soma:['rec','ded','cus','pes','adm','fin'],forte:1},
 {k:'soc',label:'(+/−) Sócios (aportes e retiradas)',cats:['Aporte dos sócios','Retirada dos sócios'],fora:1},
 {k:'emp',label:'(+/−) Empréstimos (entradas e parcelas)',cats:['Empréstimos recebidos','Parcelas de empréstimos'],fora:1},
 {k:'inv',label:'(−) Investimentos (equipamentos)',cats:['Compra de equipamentos'],fora:1},
 {t:'Variação do caixa no período',soma:['rec','ded','cus','pes','adm','fin','soc','emp','inv','out'],forte:1}];
F.grupo=function(cat){for(var i=0;i<G.length;i++)if(G[i].cats&&G[i].cats.indexOf(cat)>-1)return G[i].k;return cat===F.TRANSF?null:'out';};
/* contas: migra o formato antigo (uma conta em emp) */
F.contas=function(d){if(d.contas&&d.contas.length)return d.contas;var e=d.emp||{},l=[];
  l.push({id:'c1',tipo:'banco',nome:'Conta bancária',banco:e.banco||'',ag:e.ag||'',conta:e.conta||'',saldo:e.saldo||'0'});
  l.push({id:'cx',tipo:'caixa',nome:'Caixa (dinheiro em espécie)',saldo:'0'});
  (d.items||[]).forEach(function(i){if(!i.conta)i.conta='c1';});d.contas=l;return l;};
F.num=function(v){if(typeof v==='number')return v;v=String(v||'').trim().replace(/[R$\s]/g,'');if(/,\d{1,2}$/.test(v))v=v.replace(/\./g,'').replace(',','.');else v=v.replace(/,/g,'');var n=parseFloat(v);return isNaN(n)?0:n;};
F.saldoAte=function(d,contaId,ateExcl){var s=0;(d.contas||[]).forEach(function(c){if(!contaId||c.id===contaId)s+=F.num(c.saldo);});
  (d.items||[]).forEach(function(i){if((!contaId||i.conta===contaId)&&(!ateExcl||i.data<ateExcl)&&!(!contaId&&i.cat===F.TRANSF))s+=i.valor;});return s;};
var MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
F.dre=function(items,meses){var v={},det={};meses.forEach(function(m,ix){items.forEach(function(i){if(i.data.slice(0,7)!==m)return;var g=F.grupo(i.cat);if(!g)return;
    v[g]=v[g]||meses.map(function(){return 0;});v[g][ix]+=i.valor;det[g]=det[g]||{};det[g][i.cat]=det[g][i.cat]||meses.map(function(){return 0;});det[g][i.cat][ix]+=i.valor;});});
  var z=function(){return meses.map(function(){return 0;});},rb=v.rec||z();
  var linhas=[];G.forEach(function(g){if(g.t){var a=z();g.soma.forEach(function(k){(v[k]||z()).forEach(function(x,i){a[i]+=x;});});linhas.push({tipo:'total',label:g.t,vals:a,forte:g.forte});if(g.t==='Resultado líquido do período')linhas.push({tipo:'sep',label:'Movimentos fora do resultado'});return;}
    if(g.fora&&!v[g.k])return;linhas.push({tipo:'grupo',label:g.label,vals:v[g.k]||z()});Object.keys(det[g.k]||{}).sort().forEach(function(c){linhas.push({tipo:'cat',label:c,vals:det[g.k][c]});});});
  if(v.out){linhas.splice(linhas.length-1,0,{tipo:'grupo',label:'(+/−) Outros',vals:v.out});}
  return {meses:meses,linhas:linhas,rb:rb};};
F.dreHTML=function(d){var tot=function(a){return a.reduce(function(s,x){return s+x;},0);},rbT=tot(d.rb),many=d.meses.length>1;
  var f=function(n){return n?(n<0?'('+brl(Math.abs(n)).replace('R$ ','')+')':brl(n).replace('R$ ','')):'–';};
  var pct=function(n){return rbT?(n/rbT*100).toFixed(1).replace('.',',')+'%':'';};
  return '<table class="dre"><thead><tr><th>Demonstração do resultado (R$)</th>'+(many?d.meses.map(function(m){return '<th class="r">'+MES[+m.slice(5)-1]+'/'+m.slice(2,4)+'</th>';}).join(''):'')+'<th class="r">'+(many?'Total':MES[+d.meses[0].slice(5)-1]+'/'+d.meses[0].slice(0,4))+'</th><th class="r">% receita</th></tr></thead><tbody>'+
  d.linhas.map(function(l){if(l.tipo==='sep')return '<tr class="d-sep"><td colspan="'+(d.meses.length+(many?3:2))+'">'+l.label+'</td></tr>';var t=tot(l.vals);
    return '<tr class="d-'+l.tipo+(l.forte?' d-forte':'')+'"><td>'+esc(l.label)+'</td>'+(many?l.vals.map(function(x){return '<td class="r'+(x<0?' n':'')+'">'+f(x)+'</td>';}).join(''):'')+'<td class="r'+(t<0?' n':'')+'"><b>'+f(t)+'</b></td><td class="r pc">'+(l.tipo==='cat'?'':pct(t))+'</td></tr>';}).join('')+'</tbody></table>';};
F.DRE_CSS='table.dre{width:100%;border-collapse:collapse;font-size:12px}table.dre th{background:#2344AC;color:#fff;padding:6px 8px;text-align:left;font-weight:600;white-space:nowrap}table.dre td{padding:4px 8px;border-bottom:1px solid #eee;white-space:nowrap}table.dre .r{text-align:right}table.dre .n{color:#b3261e}table.dre tr.d-grupo td{font-weight:600;background:#f7f8fc}table.dre tr.d-cat td:first-child{padding-left:22px;color:#555}table.dre tr.d-cat td{font-size:11px;color:#555}table.dre tr.d-total td{font-weight:700;border-top:1.5px solid #2344AC;background:#eef2ff}table.dre tr.d-forte td{background:#2344AC;color:#fff}table.dre tr.d-forte .n{color:#ffd2cc}table.dre tr.d-sep td{padding-top:14px;font-weight:700;color:#2344AC;border:0;background:#fff}table.dre .pc{color:#555;font-size:11px}table.dre tr.d-forte .pc{color:#dfe6ff}';
F.drePdf=function(o){var d=F.dre(o.items,o.meses),per=o.meses.length>1?MES[+o.meses[0].slice(5)-1]+'/'+o.meses[0].slice(0,4)+' a '+MES[+o.meses[o.meses.length-1].slice(5)-1]+'/'+o.meses[o.meses.length-1].slice(0,4):MES[+o.meses[0].slice(5)-1]+'/'+o.meses[0].slice(0,4),emp=o.emp||{};
  var h='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DRE gerencial — '+esc(emp.nome||'')+' — '+per+'</title><style>@page{size:A4 '+(o.meses.length>4?'landscape':'portrait')+';margin:12mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Calibri,Arial,sans-serif;color:#555}}body{font:10pt/1.4 Calibri,Arial,sans-serif;margin:0;color:#000}'+
  '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2344AC;padding-bottom:8px;margin-bottom:10px}.wm b{display:block;color:#2344AC;font:700 22pt/1 Arial,sans-serif;letter-spacing:4px}.wm small{color:#2344AC;font-size:7pt;letter-spacing:3px}.wm img{height:46px;display:block}.ti{text-align:right}.ti h1{margin:0;font-size:15pt;color:#2344AC}.ti span{color:#555;font-size:9pt}'+
  '.cli{display:flex;gap:24px;flex-wrap:wrap;border:1px solid #c9d3f0;border-radius:6px;padding:8px 12px;margin-bottom:12px}.cli small{display:block;color:#555;font-size:7.5pt;text-transform:uppercase}.nota{font-size:8pt;color:#555;margin-top:10px}.ft{margin-top:14px;border-top:1px solid #2344AC;padding-top:5px;font-size:7.5pt;color:#555}'+F.DRE_CSS+'</style></head><body>'+
  '<div class="hd"><div class="wm"><img src="'+location.origin+'/assets/logo-nexio.png" alt="NEXIO Inteligência Contábil"></div><div class="ti"><h1>DRE gerencial financeira</h1><span>'+per+' · regime de caixa</span></div></div>'+
  '<div class="cli"><div><small>Empresa</small><b>'+esc(emp.nome||'—')+'</b></div><div><small>CNPJ / CPF</small><b>'+esc(emp.doc||'—')+'</b></div><div><small>Contas consideradas</small><b>'+esc(o.contas||'Todas')+'</b></div><div><small>Emitido em</small><b>'+new Date().toLocaleString('pt-BR')+'</b></div><div><small>Emitido por</small><b>'+esc(o.por||'—')+'</b></div></div>'+
  F.dreHTML(d)+'<p class="nota">Demonstrativo gerencial elaborado pelo regime de caixa a partir dos lançamentos informados no Controle Financeiro (bancos e dinheiro em espécie). Transferências entre contas não afetam o resultado. Não substitui a DRE contábil (regime de competência).</p>'+
  '<div class="ft">Nexio Inteligência Contábil Ltda • Av. Brig. Faria Lima, 1811 - CXPST ESC1119 - Jardim Paulistano, São Paulo - SP, 01452-001 • (11) 93956-5190 • contato@nexioic.com.br</div><script>window.onload=function(){setTimeout(function(){print()},300)}<\/script></body></html>';
  var w=window.open('','_blank');if(!w){alert('Libere as janelas pop-up deste site para gerar o PDF.');return;}w.document.write(h);w.document.close();};
F.mesesDe=function(modo,ref){var y=+ref.slice(0,4),m=+ref.slice(5,7),l=[],p=function(yy,mm){return yy+'-'+String(mm).padStart(2,'0');};
  if(modo==='mes')return [ref];if(modo==='tri'){var q=Math.floor((m-1)/3)*3+1;for(var i=0;i<3;i++)l.push(p(y,q+i));return l;}
  if(modo==='12m'){for(var j=11;j>=0;j--){var d=new Date(y,m-1-j,1);l.push(p(d.getFullYear(),d.getMonth()+1));}return l;}
  for(var k=1;k<=12;k++)l.push(p(y,k));return l;};
})();
