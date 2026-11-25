"use strict";
var C=SplitCore;
var CURS=["CAD","USD","INR","EUR","GBP","AUD"];
var CATS=["Food & drink","Groceries","Rent & utilities","Travel","Transport","Fun","Shopping","Other"];
var METHODS=["E-transfer","Cash","Card","Other"];
var MODES=[["equal","Equal"],["exact","Amounts"],["percent","Percent"],["shares","Shares"],["items","Items"]];
var MODEWORD={equal:"split equally",exact:"split by amounts",percent:"split by percent",shares:"split by shares",items:"split by item"};
var IDRE=/^[a-z0-9]{6,24}$/;

var S={ready:false,groups:[],left:{},screen:"home",gid:null},lastScreen="";
var DEK=null,hiddenAt=0,lockMode="setup",eraseArmed=false,dlgUrls=[];

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id);}
/* Anonymous feature counts (pixora-usage.js): a fixed word per feature, never anything typed. */
function T(f){try{if(window.PixoraUsage)PixoraUsage.track(f);}catch(e){}}
function h(tag,attrs){
  var el=document.createElement(tag),k,v;
  if(attrs)for(k in attrs){v=attrs[k];if(v==null||v===false)continue;
    if(k==="class")el.className=v;else if(k==="text")el.textContent=v;
    else if(k.slice(0,2)==="on")el.addEventListener(k.slice(2),v);
    else el.setAttribute(k,v===true?"":v);}
  for(var i=2;i<arguments.length;i++)add(el,arguments[i]);
  return el;
}
function add(el,c){if(c==null||c===false)return;if(Array.isArray(c)){c.forEach(function(x){add(el,x);});return;}el.append(c.nodeType?c:document.createTextNode(String(c)));}
function z(n){return String(n).padStart(2,"0");}
function today(){var d=new Date();return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());}
function dayLabel(s){var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString(LOC(),{weekday:"short",month:"short",day:"numeric",year:"numeric"});}
function rid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
var fmts={};
/* Pixora country (Canada, US, UK or India): home currency for new groups, money and date format. */
var PCY=window.PixoraCountry;
function LOC(){return PCY?PCY.locale():"en-CA";}
function homeCur(){return PCY?PCY.info().cur:"CAD";}
function money(c,cur){cur=cur||homeCur();if(PCY)return PCY.money((c||0)/100,{cur:cur,dec:2});if(!fmts[cur])fmts[cur]=new Intl.NumberFormat("en-CA",{style:"currency",currency:cur});return fmts[cur].format((c||0)/100);}
/* "12.50" -> 1250. Blank counts as zero. Anything odd is NaN so the form can say so. */
function cents(s){s=String(s==null?"":s).replace(/[$,\s]/g,"");if(s==="")return 0;if(!/^\d*(\.\d{0,2})?$/.test(s)||s===".")return NaN;return Math.round(parseFloat(s)*100);}
function num(s){s=String(s==null?"":s).replace(/[%\s]/g,"");if(s==="")return 0;if(!/^\d*(\.\d*)?$/.test(s)||s===".")return NaN;return parseFloat(s);}
function plain(c){return (c/100).toFixed(2);}
var toastTimer=null;
function toast(msg){var t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.hidden=true;},4000);}
function grp(id){return S.groups.filter(function(g){return g.id===id;})[0];}
function meOf(g){var id=C.myId(g);return g.members.filter(function(m){return m.id===id;})[0];}
function you(g,m){return m.id===C.myId(g)?" (you)":"";}
function nm(g,id){var m=g.members.filter(function(x){return x.id===id;})[0];return m?m.name:"Someone";}
function field(label,control,id){if(id)control.id=id;return h("div",{class:"field"},h("label",id?{for:id,text:label}:{class:"lab",text:label}),control);}
function input(attrs,val,oninput){var el=h("input",attrs);el.value=val==null?"":val;if(oninput)el.addEventListener("input",function(){oninput(el.value);});return el;}
function select(opts,val,onchange){
  var el=h("select");
  opts.forEach(function(o){var v=Array.isArray(o)?o[0]:o,t=Array.isArray(o)?o[1]:o;el.append(h("option",{value:v,text:t}));});
  el.value=val;if(onchange)el.addEventListener("change",function(){onchange(el.value);});return el;
}
function b64(bytes){var s="",i;for(i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function unb64(s){var bin=atob(s),out=new Uint8Array(bin.length),i;for(i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function utf8(s){return new TextEncoder().encode(s);}
async function saveFile(blob,name){
  try{
    var f=new File([blob],name,{type:blob.type});
    if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return;}
  }catch(e){if(e&&e.name==="AbortError")return;}
  var url=URL.createObjectURL(blob),a=h("a",{href:url,download:name});
  document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);
}
function readText(file){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result));};r.onerror=function(){rej(r.error);};r.readAsText(file);});}
async function copy(text){try{await navigator.clipboard.writeText(text);toast("Copied.");}catch(e){toast("Couldn't copy. Select the text and copy it by hand.");}}

/* ---------- encrypted storage (this phone only) ---------- */
var ITER=600000,dbp=null,writeChain=Promise.resolve();
function idbOpen(){
  if(!dbp)dbp=new Promise(function(res,rej){
    var r=indexedDB.open("splitlog",1);
    r.onupgradeneeded=function(){r.result.createObjectStore("kv");r.result.createObjectStore("images");};
    r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};
  });
  return dbp;
}
function idb(store,mode,fn){
  return idbOpen().then(function(db){return new Promise(function(res,rej){
    var tx=db.transaction(store,mode),rq=fn(tx.objectStore(store));
    tx.oncomplete=function(){res(rq?rq.result:undefined);};
    tx.onerror=tx.onabort=function(){rej(tx.error);};
  });});
}
function kvGet(k){return idb("kv","readonly",function(s){return s.get(k);});}
var vaultV=1;function setMeta(m){vaultV=(m&&m.v)||1;return kvSet("meta",m);}
function kvSet(k,v){return idb("kv","readwrite",function(s){return s.put(v,k);});}
function wipeAll(){return idb("kv","readwrite",function(s){return s.clear();}).then(function(){return idb("images","readwrite",function(s){return s.clear();});});}
function rnd(n){return crypto.getRandomValues(new Uint8Array(n));}
async function kek(pass,salt,iter){
  var base=await crypto.subtle.importKey("raw",utf8(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function seal(key,bytes){var iv=rnd(12);return {iv:iv,ct:new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,bytes))};}
async function unseal(key,box){return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:box.iv},key,box.ct));}
function importDek(raw){return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);}
async function createVault(pass){
  var salt=rnd(16),raw=rnd(32),k=await kek(pass,salt,ITER);
  await setMeta({v:1,vid:rid(),mts:Date.now(),salt:salt,iter:ITER,wrapped:await seal(k,raw)});
  DEK=await importDek(raw);raw.fill(0);S.groups=[];S.left={};await persist();
}
async function openVault(pass){
  var meta=await kvGet("meta"),k=await kek(pass,meta.salt,meta.iter);
  var raw=await unseal(k,meta.wrapped); /* throws when the passcode is wrong */
  var key=await importDek(raw);raw.fill(0);
  await openWithKey(key);
}
async function openWithKey(key){
  var box=await kvGet("state"),data={};
  if(box)data=JSON.parse(new TextDecoder().decode(await unseal(key,box)));
  DEK=key;S.groups=data.groups||[];S.left=data.left||{};
}
async function changePass(cur,next){
  var meta=await kvGet("meta"),raw=await unseal(await kek(cur,meta.salt,meta.iter),meta.wrapped);
  var salt=rnd(16),k=await kek(next,salt,ITER);
  await setMeta({v:1,vid:meta.vid||rid(),mts:Date.now(),salt:salt,iter:ITER,wrapped:await seal(k,raw)});raw.fill(0);
  cloudMetaPush().catch(function(){});
}
function persist(){
  var snap=JSON.stringify({groups:S.groups,left:S.left||{}}),key=DEK;
  writeChain=writeChain.catch(function(){}).then(async function(){await kvSet("state",await seal(key,utf8(snap)));cloudKick();dashKick();});
  return writeChain;
}
/* receipt photos: shrunk, then encrypted like everything else */
async function shrink(file){
  try{
    var bmp=await createImageBitmap(file),k=Math.min(1,1600/Math.max(bmp.width,bmp.height));
    var cv=h("canvas");cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);
    cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);
    var out=await new Promise(function(res){cv.toBlob(res,"image/jpeg",0.82);});
    return out||file;
  }catch(e){return file;}
}
async function imgSave(blob,id){
  id=id||rid();var box=await seal(DEK,new Uint8Array(await blob.arrayBuffer()));
  await idb("images","readwrite",function(s){return s.put({iv:box.iv,ct:box.ct,type:blob.type||"image/jpeg"},id);});return id;
}
async function imgLoad(id){
  var box=await idb("images","readonly",function(s){return s.get(id);});
  return box?new Blob([await unseal(DEK,box)],{type:box.type}):null;
}
function imgDel(id){return id?idb("images","readwrite",function(s){return s.delete(id);}).catch(function(){}):Promise.resolve();}

/* The few numbers a dashboard would show. Null while locked. */
function appSummary(){return S.ready?C.summary(S.groups):null;}

/* ---------- screens ---------- */
function go(screen,gid){S.screen=screen;S.gid=gid||null;render();window.scrollTo(0,0);}
function render(){
  var app=$("app");app.textContent="";
  if(!S.ready)return;
  var g=S.screen==="group"?grp(S.gid):null;
  if(S.screen==="group"&&!g)S.screen="home";
  if(S.screen!==lastScreen){lastScreen=S.screen;T("screen_"+S.screen);}
  if(S.screen==="home")drawHome(app);else if(S.screen==="group")drawGroup(app,g);else drawSettings(app);
}
function amountEl(c,cur,tag){return h(tag||"span",{class:"mono "+(c>0?"pos":c<0?"neg":"muted"),text:money(Math.abs(c),cur)});}

function drawHome(app){
  app.append(h("header",{class:"top"},
    h("div",null,h("p",{class:"eyebrow",text:"Split Log"}),h("h1",{text:"Your groups"})),
    h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn quiet mini",text:"Join a group",onclick:function(){openJoin("");}}),
      h("button",{type:"button",class:"btn quiet mini",text:"Settings",onclick:function(){go("settings");}}))),
    statusChip());
  var pc=pxCard();if(pc)app.append(pc);
  if(!S.groups.length){
    app.append(h("div",{class:"empty"},
      h("p",{text:"Start with a group: a trip, a household, a dinner. Add the people in it, then log who paid for what. Got an invite from a friend? Tap Join a group."}),
      h("div",{class:"btnrow"},h("button",{type:"button",class:"btn primary",text:"Start a group",onclick:function(){openGroup(null);}}),
        h("button",{type:"button",class:"btn",text:"Join a group",onclick:function(){openJoin("");}}))));
    return;
  }
  var sum=C.summary(S.groups),curs=Object.keys(sum),tape=h("section",{class:"tape","aria-label":"Where you stand"});
  if(!curs.length)tape.append(h("p",{class:"sub",text:"Pick which person is you in each group to see your totals"}));
  curs.forEach(function(cur,i){
    var net=sum[cur].owed-sum[cur].owe;
    if(i)tape.append(h("hr",{class:"rule"}));
    tape.append(h("p",{class:"sub",text:(net>0?"Overall, you're owed":net<0?"Overall, you owe":"You're all settled")+(curs.length>1?" · "+cur:"")}),
      h("p",{class:"total "+(net>0?"pos":net<0?"neg":""),text:money(Math.abs(net),cur)}),
      h("div",{class:"ln"},h("span",{class:"k",text:"Owed to you"}),h("span",{class:"lead"}),h("span",{text:money(sum[cur].owed,cur)})),
      h("div",{class:"ln"},h("span",{class:"k",text:"You owe"}),h("span",{class:"lead"}),h("span",{text:money(sum[cur].owe,cur)})));
  });
  app.append(tape);
  var list=h("section",{class:"list","aria-label":"Groups"});
  S.groups.slice().sort(function(a,b){return (b.updatedAt||0)-(a.updatedAt||0);}).forEach(function(g){
    var me=meOf(g),c=me?C.balances(g)[me.id]||0:0;
    list.append(h("div",{class:"row"},h("button",{type:"button",class:"rowmain",onclick:function(){go("group",g.id);}},
      h("span",{class:"what",text:g.name}),
      me?h("span",{class:"amt "+(c>0?"pos":c<0?"neg":"muted"),text:c?money(Math.abs(c),g.currency):"settled"}):h("span",{class:"chip warn",text:"Who are you?"}),
      h("span",{class:"meta",text:(g.cloud?"Shared · ":"")+(me&&c?(c>0?"You're owed":"You owe")+" · ":"")+(g.members.length?g.members.map(function(m){return m.name;}).join(", "):"Loading…")}))));
  });
  app.append(list,h("div",{class:"btnrow"},h("button",{type:"button",class:"btn primary",text:"New group",onclick:function(){openGroup(null);}})));
}

function drawGroup(app,g){
  var cur=g.currency,bal=C.balances(g),pays=C.simplify(bal),me=meOf(g);
  app.append(h("button",{type:"button",class:"back",text:"← All groups",onclick:function(){go("home");}}),
    h("header",{class:"top"},
      h("div",null,h("p",{class:"eyebrow",text:g.members.length+" people · "+cur+" · "+(g.cloud?"shared":"on your phone")}),h("h1",{text:g.name})),
      h("button",{type:"button",class:"btn quiet mini",text:"Edit group",onclick:function(){openGroup(g);}})),
    statusChip());
  if(g.gone)app.append(h("div",{class:"empty"},h("p",{class:"neg",text:"This group was deleted by the person who started it, or you were removed. What you see is the last copy on this phone, and it no longer updates."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn danger",text:"Remove it from this phone",onclick:async function(){await dropGroup(g,true);go("home");}}))));
  var tape=h("section",{class:"tape","aria-label":"Balances"},h("p",{class:"sub",text:"Balances"}));
  g.members.forEach(function(m){
    var c=bal[m.id]||0;
    tape.append(h("div",{class:"ln"},h("span",{class:"k",text:m.name+you(g,m)}),h("span",{class:"lead"}),
      h("span",{class:c>0?"pos":c<0?"neg":"muted",text:c>0?"is owed "+money(c,cur):c<0?"owes "+money(-c,cur):"settled"})));
  });
  if(pays.length){
    tape.append(h("hr",{class:"rule"}),h("p",{class:"sub",text:"Fewest payments to settle up"}));
    pays.forEach(function(p){
      tape.append(h("div",{class:"payline"},
        h("span",null,h("b",{text:nm(g,p.from)})," pays ",h("b",{text:nm(g,p.to)})," ",h("span",{class:"mono",text:money(p.cents,cur)})),
        h("button",{type:"button",class:"btn quiet mini",text:"Record",onclick:function(){openPayment(g,null,p);}})));
    });
  }
  app.append(tape,g.gone?null:h("div",{class:"btnrow"},
    h("button",{type:"button",class:"btn primary",text:"Add expense",onclick:function(){openExpense(g,null);}}),
    h("button",{type:"button",class:"btn",text:"Record a payment",onclick:function(){openPayment(g,null,null);}}),
    h("button",{type:"button",class:"btn",text:"Invite friends",onclick:function(){openInvite(g);}}),
    h("button",{type:"button",class:"btn quiet",text:"Share",onclick:function(){openShare(g);}})));
  if(!me)app.append(h("p",{class:"small muted",text:"Tap Edit group and mark which person is you, so the app can show your own share."}));

  var acts=g.expenses.map(function(e){return {t:"e",d:e.date,at:e.createdAt||0,x:e};}).concat(g.settlements.map(function(s){return {t:"s",d:s.date,at:s.createdAt||0,x:s};}));
  acts.sort(function(a,b){return b.d.localeCompare(a.d)||b.at-a.at;});
  if(acts.length>6){
    var q=h("input",{type:"search",placeholder:"Search this group",value:groupQ[g.id]||"","aria-label":"Search this group",style:"width:100%"});
    q.addEventListener("input",function(){groupQ[g.id]=q.value;clearTimeout(q._t);q._t=setTimeout(function(){var p=q.selectionStart;render();var n=document.querySelector("input[type=search]");if(n){n.focus();try{n.setSelectionRange(p,p);}catch(x){}}T("search");},250);});
    app.append(q);
    var qs=(groupQ[g.id]||"").trim().toLowerCase();
    if(qs)acts=acts.filter(function(a){var x=a.x,txt=a.t==="s"?[nm(g,x.from),nm(g,x.to),x.method,x.note,plain(x.cents)]:[x.desc,x.cat,x.note,plain(x.cents)].concat(Object.keys(x.payers).map(function(id){return nm(g,id);}));return txt.join(" ").toLowerCase().indexOf(qs)>=0;});
  }
  var list=h("section",{class:"list","aria-label":"Activity"}),last="";
  if(!acts.length)list.append(h("div",{class:"empty"},h("p",{text:"Nothing logged yet. Add the first expense and the balances fill in above."})));
  acts.forEach(function(a){
    if(a.d!==last){last=a.d;list.append(h("div",{class:"dayhead"},h("span",{text:dayLabel(a.d)})));}
    if(a.t==="s"){
      var s=a.x;
      list.append(h("div",{class:"row"},h("button",{type:"button",class:"rowmain",onclick:function(){openPayment(g,s,null);}},
        h("span",{class:"what",text:nm(g,s.from)+" paid "+nm(g,s.to)}),h("span",{class:"amt",text:money(s.cents,cur)}),
        h("span",{class:"meta",text:"Payment · "+s.method+(s.note?" · "+s.note:"")}))));
      return;
    }
    var e=a.x,payers=Object.keys(e.payers),share=null,bad=false;
    try{share=C.sharesFor(e);}catch(err){bad=true;}
    var meta="Paid by "+(payers.length===1?nm(g,payers[0]):payers.length+" people")+" · "+MODEWORD[e.mode];
    if(me&&share)meta+=" · your share "+money(share[me.id]||0,cur);
    var chips=h("div",{class:"chips"},e.cat?h("span",{class:"chip",text:e.cat}):null,e.imageId?h("span",{class:"chip has",text:"Receipt"}):null,
      e.repeat?h("span",{class:"chip has",text:"Repeats monthly"}):null,bad?h("span",{class:"chip warn",text:"Needs fixing"}):null);
    list.append(h("div",{class:"row"},h("button",{type:"button",class:"rowmain",onclick:function(){openExpense(g,e);}},
      h("span",{class:"what",text:e.desc}),h("span",{class:"amt",text:money(e.cents,cur)}),h("span",{class:"meta",text:meta})),
      chips.childNodes.length?chips:null));
  });
  app.append(list);
}

var groupQ={};
/* ---------- paid in another currency ----------
   Daily rates come from the same public file as Investments' prices (/invest/prices.json, CAD per unit).
   The converted total goes in the Total, and the original amount and rate go in the note, so everyone in
   the group sees how it was worked out. */
var FX=null,FXP=null;
function loadFx(){if(FXP)return FXP;FXP=fetch("/invest/prices.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.fx){FX={d:j.d,cad:Object.assign({CAD:1},j.fx.CAD||{},j.fx.USDCAD?{USD:j.fx.USDCAD}:{})};}return FX;}).catch(function(){FXP=null;return null;});return FXP;}
var FXNAMES=["USD","EUR","GBP","INR","AUD","NZD","MXN","JPY","CNY","HKD","SGD","AED","CHF","SEK","NOK","DKK","PLN","KRW","THB","PHP","VND","IDR","MYR","BRL","ZAR","TRY","EGP","MAD","DOP","JMD","CRC","COP","PEN","CLP","ARS","ILS","SAR","QAR","PKR","LKR","BDT","NPR","KES","NGN","CAD"];
function fxBox(cur,apply,getNote){
  var box=h("div",{class:"field"}),open=false,sel,amt,out;
  function draw(){
    box.textContent="";
    if(!open){box.append(h("button",{type:"button",class:"btn quiet mini",text:"Paid in another currency?",onclick:function(){open=true;draw();loadFx().then(calc);T("fx_open");}}));return;}
    sel=select(FXNAMES.filter(function(c){return c!==cur;}),cur==="USD"?"EUR":"USD",calc);sel.setAttribute("aria-label","Currency it was paid in");
    amt=h("input",{type:"text",inputmode:"decimal",placeholder:"Amount paid","aria-label":"Amount in that currency"});amt.addEventListener("input",calc);
    out=h("p",{class:"hint","aria-live":"polite"});
    box.append(h("span",{class:"lab",text:"Paid in another currency"}),h("div",{class:"two"},sel,amt),out);
  }
  function calc(){
    if(!out)return;var c=sel.value,a=num(amt.value);
    if(!FX){out.textContent="Getting today's rates…";loadFx().then(function(f){if(f)calc();else out.textContent="Couldn't get rates. Connect once, or type the converted total yourself.";});return;}
    var rx=FX.cad[c],rg=FX.cad[cur];if(!rx||!rg){out.textContent="No rate for "+c+" today. Type the converted total yourself.";return;}
    var rate=rx/rg;if(!(a>0)){out.textContent="1 "+c+" = "+(Math.round(rate*10000)/10000)+" "+cur+" (rate from "+FX.d+")";return;}
    var total=(Math.round(a*rate*100)/100).toFixed(2),tag=c+" "+a.toFixed(2)+" at "+(Math.round(rate*10000)/10000)+" ("+FX.d+")";
    out.textContent="= "+money(Math.round(a*rate*100),cur)+" · put in the total, and the original amount in the note.";
    var note=(getNote()||"").replace(/\s*·?\s*[A-Z]{3} [\d.]+ at [\d.]+ \(\d{4}-\d{2}-\d{2}\)\s*$/,"");
    apply(total,(note?note+" · ":"")+tag);T("fx_convert");
  }
  draw();return box;
}

/* ---------- dialogs ---------- */
function openDlg(node){var d=$("dlg");closeDlg();d.textContent="";d.append(node);d.showModal();d.scrollTop=0;}
function closeDlg(){var d=$("dlg");dlgUrls.forEach(function(u){URL.revokeObjectURL(u);});dlgUrls=[];if(d.open)d.close();d.textContent="";}
$("dlg").addEventListener("cancel",function(ev){ev.preventDefault();closeDlg();});
function touch(g){g.updatedAt=Date.now();}
function armed(btn,label,fn){var on=false;btn.addEventListener("click",function(){if(!on){on=true;btn.textContent=label;return;}fn();});return btn;}

function openExpense(g,e){
  var cur=g.currency,me=meOf(g),payerIds=e?Object.keys(e.payers):[];
  var D={desc:e?e.desc:"",amount:e?plain(e.cents):"",date:e?e.date:today(),cat:e?e.cat||"":"",note:e?e.note||"":"",repeat:!!(e&&e.repeat),
    payer:e?(payerIds.length===1?payerIds[0]:"multi"):(me||g.members[0]).id,paid:{},mode:e?e.mode:"equal",inc:{},exact:{},pct:{},shr:{},items:[],
    imageId:e?e.imageId||null:null,newBlob:null,removeImage:false};
  g.members.forEach(function(m){
    var p=e&&e.parts?e.parts[m.id]:0;
    D.paid[m.id]=e&&e.payers[m.id]&&payerIds.length>1?plain(e.payers[m.id]):"";
    D.inc[m.id]=e&&e.mode==="equal"?!!p:true;
    D.exact[m.id]=e&&e.mode==="exact"&&p?plain(p):"";
    D.pct[m.id]=e&&e.mode==="percent"&&p?String(p):"";
    D.shr[m.id]=e&&e.mode==="shares"?(p?String(p):"0"):"1";
  });
  function blankItem(){var w={};g.members.forEach(function(m){w[m.id]=true;});return {name:"",price:"",who:w};}
  if(e&&e.mode==="items")D.items=e.items.map(function(it){var w={};it.who.forEach(function(id){w[id]=true;});return {name:it.name,price:plain(it.cents),who:w};});
  if(!D.items.length)D.items=[blankItem()];

  function build(){
    var total=cents(D.amount);
    if(!(total>0))throw new Error("Enter the total amount.");
    var x={id:e?e.id:rid(),desc:D.desc.trim()||"Expense",date:D.date||today(),cents:total,mode:D.mode,parts:{},items:[],payers:{},cat:D.cat,note:D.note.trim(),
      repeat:D.repeat?"monthly":null,imageId:D.imageId,seriesId:e?e.seriesId||null:null,anchorDay:e&&e.date===D.date?e.anchorDay||null:null,createdAt:e?e.createdAt:Date.now()};
    if(D.payer==="multi")g.members.forEach(function(m){var c=cents(D.paid[m.id]);if(isNaN(c))throw new Error("Check the amounts under Paid by.");if(c>0)x.payers[m.id]=c;});
    else x.payers[D.payer]=total;
    g.members.forEach(function(m){
      var v;
      if(D.mode==="equal"){if(D.inc[m.id])x.parts[m.id]=1;}
      else if(D.mode==="exact"){v=cents(D.exact[m.id]);if(isNaN(v))throw new Error("Check the amount for "+m.name+".");if(v>0)x.parts[m.id]=v;}
      else if(D.mode==="percent"||D.mode==="shares"){v=num(D.mode==="percent"?D.pct[m.id]:D.shr[m.id]);if(isNaN(v))throw new Error("Check the number for "+m.name+".");if(v>0)x.parts[m.id]=v;}
    });
    if(D.mode==="items")x.items=D.items.filter(function(it){return it.name.trim()||it.price.trim();}).map(function(it){
      var c=cents(it.price);if(isNaN(c))throw new Error("Check the item prices.");
      return {name:it.name.trim()||"Item",cents:c,who:g.members.filter(function(m){return it.who[m.id];}).map(function(m){return m.id;})};
    });
    C.checkPayers(x);C.sharesFor(x);
    return x;
  }

  var hint=h("p",{class:"hint","aria-live":"polite"}),payBox=h("div",{class:"field"}),splitBox=h("div",{class:"field"}),err=h("p",{class:"err",role:"alert",hidden:true});
  function refresh(){
    var total=cents(D.amount),msg="",cls="hint",k,t=0;
    if(!(total>0)){hint.textContent="Enter the total to see how it splits.";hint.className="hint";return;}
    if(D.mode==="equal"){var n=g.members.filter(function(m){return D.inc[m.id];}).length;msg=n?"About "+money(Math.round(total/n),cur)+" each, between "+n:"Choose at least one person.";if(!n)cls="hint bad";}
    else if(D.mode==="exact"){for(k in D.exact)t+=cents(D.exact[k])||0;msg=t===total?"Adds up to the total.":t<total?money(total-t,cur)+" left to assign":money(t-total,cur)+" over the total";cls="hint "+(t===total?"ok":"bad");}
    else if(D.mode==="percent"){for(k in D.pct)t+=num(D.pct[k])||0;t=Math.round(t*100)/100;msg=t+"% of 100%";cls="hint "+(Math.abs(t-100)<0.005?"ok":"bad");}
    else if(D.mode==="shares"){for(k in D.shr)t+=num(D.shr[k])||0;msg=t>0?"One share is about "+money(Math.round(total/t),cur):"Give at least one person a share.";if(!(t>0))cls="hint bad";}
    else{D.items.forEach(function(it){t+=cents(it.price)||0;});msg=t>total?"Items are "+money(t-total,cur)+" over the total":"Items "+money(t,cur)+" + tax, tip and fees "+money(total-t,cur)+", shared in proportion";cls="hint "+(t>total?"bad":"ok");}
    hint.textContent=msg;hint.className=cls;
  }
  function drawPay(){
    payBox.textContent="";
    payBox.append(h("label",{for:"e-payer",text:"Paid by"}));
    var sel=select(g.members.map(function(m){return [m.id,m.name+you(g,m)];}).concat([["multi","Several people"]]),D.payer,function(v){D.payer=v;drawPay();});
    sel.id="e-payer";payBox.append(sel);
    if(D.payer==="multi")g.members.forEach(function(m){
      payBox.append(h("div",{class:"prow"},h("span",{class:"nm",text:m.name}),input({type:"text",inputmode:"decimal",placeholder:"0.00","aria-label":"Paid by "+m.name},D.paid[m.id],function(v){D.paid[m.id]=v;})));
    });
  }
  function drawSplit(){
    splitBox.textContent="";
    var seg=h("div",{class:"seg",role:"group","aria-label":"How to split"});
    MODES.forEach(function(md){seg.append(h("button",{type:"button","aria-pressed":String(D.mode===md[0]),text:md[1],onclick:function(){D.mode=md[0];drawSplit();refresh();}}));});
    splitBox.append(h("span",{class:"lab",text:"Split"}),seg);
    if(D.mode==="items"){
      D.items.forEach(function(it,i){
        var who=h("div",{class:"who",role:"group","aria-label":"Who shares this item"});
        g.members.forEach(function(m){
          var b=h("button",{type:"button","aria-pressed":String(!!it.who[m.id]),text:m.name,onclick:function(){it.who[m.id]=!it.who[m.id];b.setAttribute("aria-pressed",String(!!it.who[m.id]));}});
          who.append(b);
        });
        splitBox.append(h("div",{class:"item"},h("div",{class:"itemtop"},
          input({type:"text",placeholder:"Item","aria-label":"Item name"},it.name,function(v){it.name=v;}),
          input({type:"text",inputmode:"decimal",placeholder:"0.00","aria-label":"Item price"},it.price,function(v){it.price=v;refresh();}),
          h("button",{type:"button",class:"x","aria-label":"Remove item",text:"×",onclick:function(){D.items.splice(i,1);if(!D.items.length)D.items.push(blankItem());drawSplit();refresh();}})),who));
      });
      splitBox.append(h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet mini",text:"Add item",onclick:function(){D.items.push(blankItem());drawSplit();}})));
    }else g.members.forEach(function(m){
      if(D.mode==="equal"){
        var cb=h("input",{type:"checkbox"});cb.checked=D.inc[m.id];cb.addEventListener("change",function(){D.inc[m.id]=cb.checked;refresh();});
        splitBox.append(h("label",{class:"tog"},cb,h("span",{text:m.name+you(g,m)})));
      }else{
        var key=D.mode==="exact"?"exact":D.mode==="percent"?"pct":"shr";
        splitBox.append(h("div",{class:"prow"},h("span",{class:"nm",text:m.name+you(g,m)}),
          input({type:"text",inputmode:"decimal",placeholder:D.mode==="exact"?"0.00":D.mode==="percent"?"%":"shares","aria-label":m.name},D[key][m.id],function(v){D[key][m.id]=v;refresh();})));
      }
    });
    if(D.mode==="shares")splitBox.append(h("p",{class:"small muted",text:"Shares are weights: someone on 2 pays twice what someone on 1 pays."}));
    splitBox.append(hint);
  }

  /* receipt photo */
  var photoBox=h("div",{class:"field"}),file=h("input",{type:"file",accept:"image/*",class:"vh",id:"e-file"});
  function drawPhoto(url){
    photoBox.textContent="";
    photoBox.append(h("span",{class:"lab",text:"Receipt photo"}),file);
    if(url)photoBox.append(h("img",{class:"preview",src:url,alt:"Receipt"}));
    var row=h("div",{class:"btnrow"},h("label",{for:"e-file",class:"btn quiet mini",text:url?"Replace photo":"Add a photo"}));
    if(url)row.append(h("button",{type:"button",class:"btn quiet mini",text:"Remove photo",onclick:function(){D.newBlob=null;D.removeImage=true;drawPhoto(null);}}));
    photoBox.append(row);
  }
  file.addEventListener("change",async function(){
    var f=file.files&&file.files[0];if(!f)return;
    if(f.size>25e6){toast("That photo is too large. Try a smaller one.");return;}
    D.newBlob=await shrink(f);D.removeImage=false;
    var u=URL.createObjectURL(D.newBlob);dlgUrls.push(u);drawPhoto(u);
  });
  drawPhoto(null);
  if(D.imageId)imgLoad(D.imageId).then(function(b){if(b&&!D.newBlob&&!D.removeImage){var u=URL.createObjectURL(b);dlgUrls.push(u);drawPhoto(u);}}).catch(function(){});

  var rep=h("input",{type:"checkbox"});rep.checked=D.repeat;rep.addEventListener("change",function(){D.repeat=rep.checked;});
  var save=h("button",{type:"submit",class:"btn primary",text:"Save"});
  async function commit(x,isCopy){
    if(D.newBlob){var old=isCopy?null:D.imageId;x.imageId=await imgSave(D.newBlob);await imgDel(old);}
    else if(D.removeImage&&!isCopy){await imgDel(D.imageId);x.imageId=null;}
    else if(isCopy)x.imageId=null;
    x.ts=Date.now();
    if(!isCopy){T(e?"expense_edit":"expense_add_"+x.mode);if(D.newBlob)T("receipt_photo");if(x.repeat)T("repeat_monthly");if(D.payer==="multi")T("several_payers");}
    var i=g.expenses.findIndex(function(y){return y.id===x.id;});
    if(i>=0)g.expenses[i]=x;else g.expenses.push(x);
    C.runRepeats(g,today(),Date.now);touch(g);await persist();closeDlg();render();
  }
  var form=h("form",{class:"form",novalidate:true,onsubmit:async function(ev){
    ev.preventDefault();err.hidden=true;
    var x;try{x=build();}catch(er){err.textContent=er.message;err.hidden=false;return;}
    save.disabled=true;
    try{await commit(x,false);}catch(er){save.disabled=false;err.textContent="Couldn't save on this phone. Try again.";err.hidden=false;}
  }},
    h("h2",{id:"dlgTitle",text:e?"Edit expense":"Add expense"}),
    field("What was it for?",input({type:"text",placeholder:"Dinner, groceries, cab",maxlength:"80"},D.desc,function(v){D.desc=v;}),"e-desc"),
    h("div",{class:"two"},
      field("Total ("+cur+")",input({type:"text",inputmode:"decimal",placeholder:"0.00"},D.amount,function(v){D.amount=v;refresh();}),"e-amt"),
      field("Date",input({type:"date"},D.date,function(v){D.date=v;}),"e-date")),
    fxBox(cur,function(total,note){D.amount=total;var el=$("e-amt");if(el)el.value=total;D.note=note;var nt=$("e-note");if(nt)nt.value=note;refresh();},function(){return D.note;}),
    payBox,splitBox,
    field("Category",select([["","None"]].concat(CATS),D.cat,function(v){D.cat=v;}),"e-cat"),
    field("Note",input({type:"text",maxlength:"200"},D.note,function(v){D.note=v;}),"e-note"),
    photoBox,
    h("label",{class:"tog"},rep,h("span",{text:"Repeat this every month (rent, internet, subscriptions)"})),
    err,
    h("div",{class:"btnrow"},save,h("button",{type:"button",class:"btn quiet",text:"Cancel",onclick:closeDlg})),
    e?h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn quiet mini",text:"Duplicate for today",onclick:async function(){
        var x;try{x=build();}catch(er){err.textContent=er.message;err.hidden=false;return;}
        x.id=rid();x.date=today();x.repeat=null;x.seriesId=null;x.anchorDay=null;x.createdAt=Date.now();D.newBlob=null;T("expense_duplicate");
        await commit(x,true);toast("Copied to today.");
      }}),
      armed(h("button",{type:"button",class:"btn quiet danger mini",text:"Delete"}),"Tap again to delete",async function(){
        g.expenses=g.expenses.filter(function(y){return y.id!==e.id;});tombstone(g,"e_"+e.id);T("expense_delete");await imgDel(e.imageId);touch(g);await persist();closeDlg();render();
      })):null);
  drawPay();drawSplit();refresh();openDlg(form);
}

function openPayment(g,s,suggest){
  var me=meOf(g),D={from:s?s.from:suggest?suggest.from:(me||g.members[0]).id,to:s?s.to:suggest?suggest.to:g.members[g.members[0].id===(me||g.members[0]).id?1:0].id,
    amount:s?plain(s.cents):suggest?plain(suggest.cents):"",date:s?s.date:today(),method:s?s.method:"E-transfer",note:s?s.note||"":""};
  var err=h("p",{class:"err",role:"alert",hidden:true}),opts=g.members.map(function(m){return [m.id,m.name+you(g,m)];});
  var form=h("form",{class:"form",novalidate:true,onsubmit:async function(ev){
    ev.preventDefault();
    var c=cents(D.amount),bad=!(c>0)?"Enter the amount paid.":D.from===D.to?"Choose two different people.":"";
    if(bad){err.textContent=bad;err.hidden=false;return;}
    var x={id:s?s.id:rid(),from:D.from,to:D.to,cents:c,date:D.date||today(),method:D.method,note:D.note.trim(),createdAt:s?s.createdAt:Date.now(),ts:Date.now()};
    T(s?"payment_edit":suggest?"payment_from_suggestion":"payment_record");
    var i=g.settlements.findIndex(function(y){return y.id===x.id;});
    if(i>=0)g.settlements[i]=x;else g.settlements.push(x);
    touch(g);await persist();closeDlg();render();
  }},
    h("h2",{id:"dlgTitle",text:s?"Edit payment":"Record a payment"}),
    h("p",{class:"small muted",text:"This only records that money changed hands. Send the money yourself, by e-transfer or cash."}),
    h("div",{class:"two"},field("Who paid",select(opts,D.from,function(v){D.from=v;}),"p-from"),field("Who received",select(opts,D.to,function(v){D.to=v;}),"p-to")),
    h("div",{class:"two"},field("Amount ("+g.currency+")",input({type:"text",inputmode:"decimal",placeholder:"0.00"},D.amount,function(v){D.amount=v;}),"p-amt"),field("Date",input({type:"date"},D.date,function(v){D.date=v;}),"p-date")),
    field("How",select(METHODS,D.method,function(v){D.method=v;}),"p-how"),
    field("Note",input({type:"text",maxlength:"200"},D.note,function(v){D.note=v;}),"p-note"),
    err,
    h("div",{class:"btnrow"},h("button",{type:"submit",class:"btn primary",text:"Save"}),h("button",{type:"button",class:"btn quiet",text:"Cancel",onclick:closeDlg}),
      s?armed(h("button",{type:"button",class:"btn quiet danger",text:"Delete"}),"Tap again to delete",async function(){
        g.settlements=g.settlements.filter(function(y){return y.id!==s.id;});tombstone(g,"s_"+s.id);touch(g);await persist();closeDlg();render();
      }):null));
  openDlg(form);
}

function usedIds(g){
  var u={};
  g.expenses.forEach(function(e){var k;for(k in e.payers)u[k]=1;for(k in e.parts)u[k]=1;(e.items||[]).forEach(function(it){it.who.forEach(function(id){u[id]=1;});});});
  g.settlements.forEach(function(s){u[s.from]=1;u[s.to]=1;});
  return u;
}
function openGroup(g,note){
  var used=g?usedIds(g):{},D={name:g?g.name:"",currency:g?g.currency:homeCur(),members:g?g.members.map(function(m){return {id:m.id,name:m.name,me:m.id===C.myId(g)};}):[{id:rid(),name:"",me:true},{id:rid(),name:"",me:false}]};
  var box=h("div",{class:"field"}),err=h("p",{class:"err",role:"alert",hidden:true});
  function draw(){
    box.textContent="";box.append(h("span",{class:"lab",text:"People"}));
    D.members.forEach(function(m,i){
      var rb=h("input",{type:"radio",name:"g-me","aria-label":m.name?m.name+" is me":"This is me"});rb.checked=m.me;
      rb.addEventListener("change",function(){D.members.forEach(function(x){x.me=x===m;});});
      box.append(h("div",{class:"mrow"},
        input({type:"text",placeholder:m.me?"Your name":"Friend's name",maxlength:"40","aria-label":"Name"},m.name,function(v){m.name=v;}),
        h("label",{class:"tog small"},rb,h("span",{text:"Me"})),
        h("button",{type:"button",class:"x",text:"×","aria-label":"Remove "+(m.name||"person"),disabled:!!used[m.id]||D.members.length<=2,title:used[m.id]?"Already part of an expense or payment":null,onclick:function(){D.members.splice(i,1);draw();}})));
    });
    box.append(h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet mini",text:"Add a person",onclick:function(){D.members.push({id:rid(),name:"",me:false});draw();}})));
    if(g)box.append(h("p",{class:"small muted",text:"People who are already in an expense or payment can be renamed but not removed."}));
  }
  draw();
  var form=h("form",{class:"form",novalidate:true,onsubmit:async function(ev){
    ev.preventDefault();
    var people=D.members.filter(function(m){return m.name.trim()||used[m.id];});
    var bad=!D.name.trim()?"Give the group a name.":people.length<2?"Add at least two people.":people.some(function(m){return !m.name.trim();})?"Every person needs a name.":"";
    if(bad){err.textContent=bad;err.hidden=false;return;}
    var members=people.map(function(m){return {id:m.id,name:m.name.trim()};}),meId=(people.filter(function(m){return m.me;})[0]||{}).id||null,now=Date.now();
    if(g){
      if(JSON.stringify([g.name,g.currency,g.members])!==JSON.stringify([D.name.trim(),D.currency,members]))g.hts=now;
      if(meId!==g.me)g.pts=now;
      g.name=D.name.trim();g.currency=D.currency;g.members=members;g.me=meId;touch(g);
    }else{g=newGroup(D.name.trim(),D.currency,members,meId);S.groups.push(g);T("group_create");}
    await persist();closeDlg();go("group",g.id);
  }},
    h("h2",{id:"dlgTitle",text:g?"Edit group":"New group"}),
    note?h("p",{class:"small",text:note}):null,
    field("Group name",input({type:"text",placeholder:"Cottage weekend, Apartment 4B",maxlength:"60"},D.name,function(v){D.name=v;}),"g-name"),
    field("Currency",select(CURS,D.currency,function(v){D.currency=v;}),"g-cur"),
    box,err,
    h("div",{class:"btnrow"},h("button",{type:"submit",class:"btn primary",text:"Save"}),h("button",{type:"button",class:"btn quiet",text:"Cancel",onclick:closeDlg}),
      g?armed(h("button",{type:"button",class:"btn quiet danger",text:leaving(g)?"Leave group":"Delete group"}),
        leaving(g)?"Tap again: removes the group from your phones. Your friends keep it.":g.cloud?"Tap again: deletes it for everyone in the group":"Tap again: deletes every expense in it",async function(){
        T(leaving(g)?"group_leave":"group_delete");await dropGroup(g);closeDlg();go("home");toast(leaving(g)?"You left the group.":"Group deleted.");
      }):null));
  openDlg(form);
}

/* ---------- sharing: text, read-only link, spreadsheet, group file ---------- */
function summaryText(g){
  var bal=C.balances(g),cur=g.currency,lines=[g.name+": balances on "+today(),""];
  g.members.forEach(function(m){var c=bal[m.id]||0;lines.push(m.name+(c>0?" is owed "+money(c,cur):c<0?" owes "+money(-c,cur):" is settled"));});
  var pays=C.simplify(bal);
  if(pays.length){lines.push("","To settle up:");pays.forEach(function(p){lines.push(nm(g,p.from)+" pays "+nm(g,p.to)+" "+money(p.cents,cur));});}
  return lines.join("\n");
}
function shareLink(g){return location.href.split("#")[0]+"#s="+b64(utf8(JSON.stringify(C.snapshot(g,25)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function csvCell(v){v=String(v==null?"":v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function groupCsv(g){
  var rows=[["Date","Type","Description","Amount","Paid by","Category","Note"].concat(g.members.map(function(m){return m.name+" share";}))];
  g.expenses.slice().sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(e){
    var s={};try{s=C.sharesFor(e);}catch(er){}
    rows.push([e.date,"Expense",e.desc,plain(e.cents),Object.keys(e.payers).map(function(id){return nm(g,id);}).join(" + "),e.cat||"",e.note||""].concat(g.members.map(function(m){return plain(s[m.id]||0);})));
  });
  g.settlements.forEach(function(s){rows.push([s.date,"Payment",nm(g,s.from)+" paid "+nm(g,s.to),plain(s.cents),nm(g,s.from),s.method,s.note||""]);});
  return rows.map(function(r){return r.map(csvCell).join(",");}).join("\r\n");
}
function fileName(g,ext){return (g.name.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"group")+"-"+today()+ext;}
function openShare(g){
  var text=summaryText(g),ta=h("textarea",{readonly:true,"aria-label":"Summary text"});ta.value=text;
  openDlg(h("div",{class:"form"},
    h("h2",{id:"dlgTitle",text:"Share "+g.name}),
    ta,
    h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn primary",text:navigator.share?"Send summary":"Copy summary",onclick:async function(){
        T("share_summary");if(navigator.share){try{await navigator.share({text:text});}catch(e){}}else copy(text);
      }}),
      h("button",{type:"button",class:"btn",text:"Copy view-only link",onclick:function(){T("share_view_link");copy(shareLink(g));}})),
    h("p",{class:"small muted",text:"The link opens a read-only snapshot of the balances for anyone you send it to. They don't need the app or a passcode. It shows today's numbers and doesn't update, so send a fresh one after changes."}),
    h("hr",{class:"rule"}),
    h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn quiet",text:"Save as spreadsheet",onclick:function(){T("export_csv");saveFile(new Blob([groupCsv(g)],{type:"text/csv"}),fileName(g,".csv"));}}),
      h("button",{type:"button",class:"btn quiet",text:"Send the whole group",onclick:function(){
        T("export_group_file");var copyG=JSON.parse(JSON.stringify(g));copyG.expenses.forEach(function(e){e.imageId=null;});
        ["me","key","tok","owner","acct","cloud","gone","tomb","seen","hts","pts"].forEach(function(k){delete copyG[k];});
        saveFile(new Blob([JSON.stringify({app:"splitlog-group",v:1,group:copyG})],{type:"application/json"}),fileName(g,".splitlog.json"));
      }})),
    h("p",{class:"small muted",text:"\"Send the whole group\" makes a file a friend can bring into their own Split Log from Settings. It carries every expense but not the receipt photos, and it is not encrypted."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet",text:"Done",onclick:closeDlg}))));
}

/* Files and links come from outside, so rebuild them field by field and drop anything that doesn't fit. */
function cleanGroup(o,keepPrivate){
  function str(v,n){return String(v==null?"":v).slice(0,n);}
  function id(v){return typeof v==="string"&&IDRE.test(v)?v:null;}
  function pos(v){v=Number(v);return isFinite(v)&&v>0?v:0;}
  function date(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:today();}
  if(!o||typeof o!=="object"||!id(o.id)||!Array.isArray(o.members))return null;
  var ok={},members=[];
  o.members.slice(0,60).forEach(function(m){var i=m&&id(m.id);if(i&&!ok[i]){ok[i]=1;members.push({id:i,name:str(m.name,40)||"Someone"});if(keepPrivate&&m.me)o.me=o.me||i;}});
  if(members.length<2)return null;
  function map(src,whole){var out={},k;if(src&&typeof src==="object")for(k in src)if(ok[k]===1){var v=pos(src[k]);if(whole)v=Math.round(v);if(v>0)out[k]=v;}return out;}
  var g={id:o.id,name:str(o.name,60)||"Group",currency:CURS.indexOf(o.currency)>=0?o.currency:"CAD",members:members,expenses:[],settlements:[],updatedAt:Date.now()},dropped=0;
  function ts(v){v=Number(v);return isFinite(v)&&v>0?v:1;}
  if(keepPrivate){
    if(typeof o.me==="string"&&ok[o.me]===1)g.me=o.me;
    if(typeof o.key==="string"&&/^[A-Za-z0-9+\/]{43}=$/.test(o.key))g.key=o.key;
    if(typeof o.tok==="string"&&/^[A-Za-z0-9_-]{16,64}$/.test(o.tok))g.tok=o.tok;
    g.cloud=!!o.cloud&&!!g.key&&!!g.tok;g.owner=typeof o.owner==="string"?o.owner.slice(0,128):null;g.acct=typeof o.acct==="string"?o.acct.slice(0,128):null;
    g.hts=ts(o.hts);g.pts=ts(o.pts);g.tomb={};g.seen={};
    if(o.tomb&&typeof o.tomb==="object")for(var tk in o.tomb)if(/^[es]_[a-z0-9]{6,24}$/.test(tk))g.tomb[tk]=ts(o.tomb[tk]);
  }
  (Array.isArray(o.expenses)?o.expenses:[]).slice(0,5000).forEach(function(e){
    var i=e&&id(e.id),mode=e&&MODEWORD[e.mode]?e.mode:null;
    if(!i||!mode){dropped++;return;}
    var x={id:i,desc:str(e.desc,80)||"Expense",date:date(e.date),cents:Math.round(pos(e.cents)),mode:mode,parts:map(e.parts,mode==="exact"),payers:map(e.payers,true),
      items:(Array.isArray(e.items)?e.items:[]).slice(0,200).map(function(it){return {name:str(it&&it.name,80)||"Item",cents:Math.round(pos(it&&it.cents)),who:(Array.isArray(it&&it.who)?it.who:[]).filter(function(w){return ok[w]===1;})};}),
      cat:CATS.indexOf(e.cat)>=0?e.cat:"",note:str(e.note,200),repeat:e.repeat==="monthly"?"monthly":null,imageId:keepPrivate?id(e.imageId):null,seriesId:id(e.seriesId),
      anchorDay:e.anchorDay>=1&&e.anchorDay<=31?Math.round(e.anchorDay):null,createdAt:Number(e.createdAt)||Date.now(),ts:keepPrivate?ts(e.ts):1};
    try{C.checkPayers(x);C.sharesFor(x);g.expenses.push(x);}catch(er){dropped++;}
  });
  (Array.isArray(o.settlements)?o.settlements:[]).slice(0,5000).forEach(function(s){
    var i=s&&id(s.id),c=Math.round(pos(s&&s.cents));
    if(!i||!c||ok[s.from]!==1||ok[s.to]!==1||s.from===s.to){dropped++;return;}
    g.settlements.push({id:i,from:s.from,to:s.to,cents:c,date:date(s.date),method:METHODS.indexOf(s.method)>=0?s.method:"Other",note:str(s.note,200),createdAt:Number(s.createdAt)||Date.now(),ts:keepPrivate?ts(s.ts):1});
  });
  g.dropped=dropped;return g;
}

/* ---------- settings: passcode, backup, group files ---------- */
function pw(id,label,auto){return field(label,h("input",{type:"password",autocomplete:auto,autocapitalize:"off",autocorrect:"off",spellcheck:"false"}),id);}
function drawSettings(app){
  app.append(h("button",{type:"button",class:"back",text:"← All groups",onclick:function(){go("home");}}),h("h1",{text:"Settings"}),cloudPanel());

  /* bring in a friend's group as a new copy of your own */
  var gf=h("input",{type:"file",accept:".json,application/json",class:"vh",id:"s-gfile"}),gmsg=h("p",{class:"small",hidden:true});
  gf.addEventListener("change",async function(){
    var f=gf.files&&gf.files[0];gf.value="";if(!f)return;
    var g=null;try{var o=JSON.parse(await readText(f));if(o&&o.app==="splitlog-group")g=cleanGroup(o.group,false);}catch(e){}
    if(!g){gmsg.hidden=false;gmsg.textContent="That isn't a Split Log group file.";return;}
    var d=g.dropped;delete g.dropped;
    var fresh=newGroup(g.name,g.currency,g.members,null);fresh.expenses=g.expenses;fresh.settlements=g.settlements;
    S.groups.push(fresh);await persist();T("import_group_file");
    go("group",fresh.id);openGroup(fresh,"Brought in as your own copy"+(d?", except "+d+" entries that didn't add up":"")+". Mark which person is you, then save.");
  });
  app.append(h("div",{class:"panel"},h("h3",{text:"Join or bring in a group"}),
    h("p",{class:"small muted",text:"Got an invite link or code from a friend? Join the group to share it live. A group file from Share > Send the whole group comes in as your own separate copy instead."}),
    gf,h("div",{class:"btnrow"},h("button",{type:"button",class:"btn",text:"Join with an invite",onclick:function(){openJoin("");}}),h("label",{for:"s-gfile",class:"btn quiet",text:"Choose a group file"})),gmsg));

  /* backup */
  var bmsg=h("p",{class:"small",hidden:true}),rf=h("input",{type:"file",accept:".json,application/json",class:"vh",id:"s-rfile"}),pendingR=null;
  var rbtn=h("button",{type:"button",class:"btn danger",text:"Replace everything with this backup",hidden:true});
  function say(el,t){el.textContent=t;el.hidden=false;}
  var mk=h("button",{type:"button",class:"btn",text:"Save a backup file",onclick:async function(){
    var p=$("s-bpass").value;if(p.length<6){say(bmsg,"Choose a backup password of at least 6 characters.");return;}
    mk.disabled=true;mk.textContent="Encrypting…";
    try{
      var images={},ids=[];S.groups.forEach(function(g){g.expenses.forEach(function(e){if(e.imageId)ids.push(e.imageId);});});
      for(var i=0;i<ids.length;i++){var b=await imgLoad(ids[i]);if(b)images[ids[i]]={type:b.type,data:b64(new Uint8Array(await b.arrayBuffer()))};}
      var salt=rnd(16),box=await seal(await kek(p,salt,ITER),utf8(JSON.stringify({groups:S.groups,images:images})));
      await saveFile(new Blob([JSON.stringify({app:"splitlog-backup",v:1,iter:ITER,salt:b64(salt),iv:b64(box.iv),ct:b64(box.ct)})],{type:"application/json"}),"split-log-backup-"+today()+".json");
      say(bmsg,"Backup made. Keep the file and its password somewhere safe.");T("backup_save");
    }catch(e){say(bmsg,"Couldn't make the backup. Try again.");}
    mk.disabled=false;mk.textContent="Save a backup file";
  }});
  rf.addEventListener("change",async function(){
    var f=rf.files&&rf.files[0];rf.value="";if(!f)return;
    rbtn.hidden=true;pendingR=null;
    try{
      var o=JSON.parse(await readText(f));if(!o||o.app!=="splitlog-backup")throw 0;
      var iter=Math.min(Math.max(Number(o.iter)||ITER,100000),2000000);
      var data=JSON.parse(new TextDecoder().decode(await unseal(await kek($("s-bpass").value,unb64(o.salt),iter),{iv:unb64(o.iv),ct:unb64(o.ct)})));
      var groups=(Array.isArray(data.groups)?data.groups:[]).map(function(g){return cleanGroup(g,true);}).filter(Boolean);
      groups.forEach(function(g){delete g.dropped;});
      pendingR={groups:groups,images:data.images&&typeof data.images==="object"?data.images:{}};
      say(bmsg,"Backup opened: "+groups.length+" group"+(groups.length===1?"":"s")+". Restoring replaces everything on this phone.");rbtn.hidden=false;
    }catch(e){say(bmsg,"Couldn't open that file. Type the backup's password in the box above first, then choose the file again.");}
  });
  rbtn.addEventListener("click",async function(){
    rbtn.disabled=true;
    try{
      await idb("images","readwrite",function(s){return s.clear();});
      for(var k in pendingR.images){var im=pendingR.images[k];if(IDRE.test(k)&&im&&typeof im.data==="string")await imgSave(new Blob([unb64(im.data)],{type:/^image\/[a-z0-9.+-]+$/.test(im.type)?im.type:"image/jpeg"}),k);}
      S.groups=pendingR.groups;S.left={};await resetMarks();await persist();cloudStart();T("backup_restore");toast("Backup restored.");go("home");
    }catch(e){rbtn.disabled=false;say(bmsg,"The restore didn't finish. Try again.");}
  });
  app.append(h("div",{class:"panel"},h("h3",{text:"Backup"}),
    h("p",{class:"small muted",text:"Everything lives only on this phone. A lost phone or a forgotten passcode takes it all with it, and a backup file is the only way back. It holds every group and receipt photo, encrypted with the password you type here."}),
    pw("s-bpass","Backup password","off"),
    rf,h("div",{class:"btnrow"},mk,h("label",{for:"s-rfile",class:"btn quiet",text:"Restore from a backup"})),bmsg,h("div",{class:"btnrow"},rbtn)));

  /* passcode */
  var pmsg=h("p",{class:"small",hidden:true}),change=h("button",{type:"button",class:"btn",text:"Change passcode",onclick:async function(){
    var nw=$("s-new").value,bad=!/^\d{4}$/.test(nw)?"The new passcode must be exactly 4 digits.":nw!==$("s-conf").value?"The two new passcodes don't match.":"";
    if(bad){say(pmsg,bad);return;}
    change.disabled=true;
    try{await changePass($("s-cur").value,nw);$("s-cur").value=$("s-new").value=$("s-conf").value="";say(pmsg,"Passcode changed.");}
    catch(e){say(pmsg,"The current passcode is wrong.");}
    change.disabled=false;
  }});
  var every=h("input",{type:"checkbox"});every.checked=!keepOn;
  every.addEventListener("change",function(){keepOn=!every.checked;kvSet("keep",keepOn).then(function(){return kvSet("dek",keepOn?DEK:null);}).catch(function(){});});
  app.append(h("div",{class:"panel"},h("h3",{text:"Unlocking"}),
    h("p",{class:"small muted",text:"After you enter the passcode once, this phone stays unlocked and your phone's own lock protects it. Lock now asks for the passcode again next time."}),
    h("label",{class:"tog"},every,h("span",{text:"Ask for the passcode every time I open the app"})),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet",text:"Lock now",onclick:lock}))));
  if(vaultV===2){
    var qmsg=h("p",{class:"small",hidden:true}),pchange=h("button",{type:"button",class:"btn",text:"Change Pixora passcode",onclick:async function(){
      var nw=$("s-new").value,bad=!/^\d{4}$/.test(nw)?"The new passcode must be exactly 4 digits.":nw!==$("s-conf").value?"The two new passcodes don't match.":!cuser?"Sign in to your Pixora account first.":"";
      if(bad){say(qmsg,bad);return;}
      pchange.disabled=true;
      try{await pxChangePass($("s-cur").value,nw);$("s-cur").value=$("s-new").value=$("s-conf").value="";say(qmsg,"Pixora passcode changed for all your Pixora apps.");}
      catch(e){say(qmsg,e&&e.code==="wrong"?"The current Pixora passcode is wrong.":"Couldn't reach your account. Try again.");}
      pchange.disabled=false;
    }});
    app.append(h("div",{class:"panel"},h("h3",{text:"Pixora passcode"}),h("p",{class:"small muted",text:"Split Log opens with your Pixora passcode, the same one as your other Pixora apps. Changing it here changes it everywhere; other phones stay unlocked."}),
      pw("s-cur","Current Pixora passcode","current-password"),pw("s-new","New Pixora passcode","new-password"),pw("s-conf","Repeat it","new-password"),qmsg,h("div",{class:"btnrow"},pchange)));
  }else{
    var sc=pxCard();if(sc)app.append(sc);
    app.append(h("div",{class:"panel"},h("h3",{text:"Passcode"}),pw("s-cur","Current passcode","current-password"),pw("s-new","New passcode","new-password"),pw("s-conf","Repeat new passcode","new-password"),pmsg,h("div",{class:"btnrow"},change)));
  }

  if(PCY){var csel=h("select",{"aria-label":"Country",style:"max-width:280px;min-height:44px"});PCY.LIST.forEach(function(c){var o=h("option",{value:c[0],text:PCY.INFO[c[0]].flag+" "+c[1]});if(c[0]===PCY.get())o.selected=true;csel.append(o);});
    csel.addEventListener("change",function(){PCY.set(csel.value);toast("New groups will use "+homeCur()+". Existing groups keep their currency.");});
    app.append(h("div",{class:"panel"},h("h3",{text:"Country"}),h("p",{class:"small muted",text:"Canada, the US, the UK or India: the currency new groups start in and how money and dates look, here and in every Pixora app."}),csel));}
  app.append(h("div",{class:"panel"},h("h3",{text:"Ideas or problems?"}),h("p",{class:"small muted",text:"Tell Sachin what would make Split Log better or what went wrong. Nothing from your groups is sent."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn",text:"Send feedback",onclick:function(){if(window.PixoraFeedback)PixoraFeedback.open("splitlog","Split Log");}}))));
  app.append(h("div",{class:"panel"},h("h3",{text:"Start over"}),h("p",{class:"small muted",text:"Deletes every group, expense, receipt photo and the passcode from this phone. If you're signed in, it also leaves your shared groups and clears Split Log from your Pixora account. Friends keep their copies. Your Pixora login is not deleted. To delete the login itself, email pixora3dstudios@gmail.com."}),
    h("div",{class:"btnrow"},armed(h("button",{type:"button",class:"btn danger",text:"Erase everything"}),"Tap again to erase everything",eraseEverything))));
}

/* ---------- read-only view opened from a shared link ---------- */
function showShared(snap,then){
  var v=$("shared"),cur=snap.c;v.textContent="";v.hidden=false;
  var tape=h("section",{class:"tape"},h("p",{class:"sub",text:"Balances on "+snap.d}));
  snap.b.forEach(function(r){tape.append(h("div",{class:"ln"},h("span",{class:"k",text:r[0]}),h("span",{class:"lead"}),
    h("span",{class:r[1]>0?"pos":r[1]<0?"neg":"muted",text:r[1]>0?"is owed "+money(r[1],cur):r[1]<0?"owes "+money(-r[1],cur):"settled"})));});
  if(snap.p.length){tape.append(h("hr",{class:"rule"}),h("p",{class:"sub",text:"To settle up"}));
    snap.p.forEach(function(r){tape.append(h("div",{class:"payline"},h("span",null,h("b",{text:r[0]})," pays ",h("b",{text:r[1]})),h("span",{class:"mono",text:money(r[2],cur)})));});}
  var list=h("section",{class:"list"});
  if(snap.x.length)list.append(h("div",{class:"dayhead"},h("span",{text:snap.t>snap.x.length?"Latest "+snap.x.length+" of "+snap.t+" expenses":"Expenses"})));
  snap.x.forEach(function(r){list.append(h("div",{class:"row"},h("div",{class:"rowmain"},h("span",{class:"what",text:r[1]}),h("span",{class:"amt",text:money(r[2],cur)}),h("span",{class:"meta",text:r[0]+" · paid by "+r[3]}))));});
  v.append(h("header",{class:"top"},h("div",null,h("p",{class:"eyebrow",text:"Split Log · shared summary, read only"}),h("h1",{text:snap.n}))),tape,list,
    h("p",{class:"small muted",text:"This is a snapshot someone sent you. It doesn't update, and nothing here was uploaded anywhere: the numbers travel inside the link itself."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn",text:"Open my own Split Log",onclick:function(){history.replaceState(null,"",location.pathname+location.search);v.hidden=true;v.textContent="";then();}})));
}

/* ---------- groups: secrets, stamps, leaving ---------- */
function b64url(b){return b64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unb64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return unb64(s);}
function newGroup(name,currency,members,meId){
  var now=Date.now();
  return {id:rid(),name:name,currency:currency,members:members,expenses:[],settlements:[],updatedAt:now,me:meId,
    key:b64(rnd(32)),tok:b64url(rnd(18)),cloud:false,owner:null,acct:null,hts:now,pts:now,tomb:{},seen:{}};
}
function tombstone(g,k){(g.tomb=g.tomb||{})[k]=Date.now();}
/* Older copies of a group: give them the fields syncing needs. Returns true when something changed. */
function upgrade(g){
  var ch=false;
  if(!g.me){var m=g.members.filter(function(x){return x.me;})[0];if(m){g.me=m.id;ch=true;}}
  g.members.forEach(function(m){if("me" in m){delete m.me;ch=true;}});
  if(!g.key){g.key=b64(rnd(32));ch=true;}
  if(!g.tok){g.tok=b64url(rnd(18));ch=true;}
  if(!g.tomb){g.tomb={};ch=true;}
  if(!g.seen){g.seen={};ch=true;}
  if(!g.hts){g.hts=1;ch=true;}
  if(!g.pts){g.pts=1;ch=true;}
  g.expenses.forEach(function(e){if(!e.ts){e.ts=1;ch=true;}});
  g.settlements.forEach(function(x){if(!x.ts){x.ts=1;ch=true;}});
  return ch;
}
function leaving(g){return !!(g.cloud&&g.owner&&cuser&&g.owner!==cuser.uid);}
/* Delete a group you started, or leave one a friend started. Friends keep their copy when you leave. */
async function dropGroup(g,localOnly){
  var leave=leaving(g);
  S.groups=S.groups.filter(function(x){return x.id!==g.id;});
  S.left[g.id]=Date.now();
  stopGroup(g.id);forgetMarks(g.id);delete gkCache[g.id];
  await Promise.all(g.expenses.map(function(e){return imgDel(e.imageId);}));
  await persist();
  if(localOnly||!g.cloud||!fdb||!cuser)return;
  try{
    if(leave)await groupDoc(g.id).collection("members").doc(cuser.uid).delete();
    else await cloudDeleteGroup(g.id);
  }catch(e){}
}

/* ---------- lock ---------- */
async function eraseEverything(){
  cloudStop();
  if(cuser){try{await cloudWipe();}catch(e){}}
  DEK=null;S.groups=[];S.left={};S.ready=false;closeDlg();
  try{await wipeAll();}catch(e){}
  if(cuser)showLock("setup",null,"cloud");else showAccount();
}
function showLock(mode,problem,src){
  if(window.PixoraPin){var lp=$("l-pass"),lc=$("l-confirm"),pinSet=mode==="setup"||(mode==="pxnew"&&!pxHasMk);
    if(pinSet){PixoraPin.fit(lp,null,true);PixoraPin.fit(lc,null,true);}else if(mode==="pxunlock")kvGet("mk").then(function(mk){PixoraPin.fit(lp,mk,false);}).catch(function(){});else{PixoraPin.fit(lp,null,false);PixoraPin.fit(lc,null,false);}}
  lockMode=mode;eraseArmed=false;
  $("app").hidden=true;$("acct").hidden=true;$("lock").hidden=false;
  var px=mode==="pxunlock"||mode==="pxnew",pxSet=mode==="pxnew"&&!pxHasMk;
  $("lockTitle").textContent=px?(pxSet?"Set your Pixora passcode":"Enter your Pixora passcode"):mode==="setup"?"Set a passcode":"Enter your passcode";
  $("lockSub").textContent=src==="cloud"?(mode==="setup"?"Signed in. Now set a Split Log passcode. It encrypts your groups before they reach your Pixora account, so nobody else can read them. You type it once per phone.":"Your Pixora account already has Split Log data. Enter the Split Log passcode you set on your other phone."):
    mode==="setup"?"It encrypts every group and receipt on this phone. You type it once, then this phone stays unlocked. It can't be recovered if you forget it. Six or more characters is much harder to guess.":"Your splits are encrypted on this phone.";
  if(px)$("lockSub").textContent=pxSet?"One passcode for every Pixora app. It encrypts your groups on this phone before they reach your account, so nobody else can read them. It can't be recovered, so pick one you'll remember.":"The same passcode you use in your other Pixora apps. You type it once on this phone.";
  $("l-confirmField").hidden=!(mode==="setup"||pxSet);
  $("l-pass").value="";$("l-confirm").value="";
  $("l-pass").setAttribute("autocomplete",mode==="setup"||pxSet?"new-password":"current-password");
  $("l-go").textContent=mode==="setup"||pxSet?"Set passcode":"Unlock";$("l-go").disabled=!!problem;
  var er=$("l-err");er.hidden=!problem;er.textContent=problem||"";
  var x=$("l-erase");x.hidden=!(mode==="unlock"||mode==="pxunlock");x.textContent="Forgot it? Erase everything and start over";
  $("l-acct").hidden=!(mode==="setup"&&!cuser&&src!=="cloud");
  if(!problem)try{$("l-pass").focus();}catch(e){}
}
$("l-acct").addEventListener("click",function(){showAccount();});
function lock(){
  if(!DEK)return;
  kvSet("dek",null).catch(function(){});
  cloudStop();
  DEK=null;S.groups=[];S.left={};S.ready=false;closeDlg();$("app").textContent="";gkCache={};
  kvGet("meta").then(function(m){showLock(m&&m.v===2?"pxunlock":"unlock");});
}
$("lockForm").addEventListener("submit",async function(ev){
  ev.preventDefault();
  var pass=$("l-pass").value,er=$("l-err"),btn=$("l-go");
  var setting=lockMode==="setup"||(lockMode==="pxnew"&&!pxHasMk);
  function fail(m){er.textContent=m;er.hidden=false;btn.disabled=false;btn.textContent=setting?"Set passcode":"Unlock";}
  er.hidden=true;btn.disabled=true;btn.textContent=setting?"Setting up…":"Unlocking…";
  try{
    if(lockMode==="pxnew"){
      if(!pxHasMk){
        if(!/^\d{4}$/.test(pass))return fail("Use exactly 4 digits.");
        if(pass!==$("l-confirm").value)return fail("The two passcodes don't match.");
      }
      try{await pxCreateVault(pass);}catch(e){return fail(e&&e.code==="wrong"?"That isn't your Pixora passcode.":"Couldn't reach your Pixora account. Check the connection and try again.");}
    }else if(lockMode==="pxunlock"){
      try{await pxOpenVault(pass);}catch(e){return fail(e&&e.code==="net"?"Connect to the internet once to unlock on this phone.":"That isn't your Pixora passcode.");}
    }else if(lockMode==="setup"){
      if(!/^\d{4}$/.test(pass))return fail("Use exactly 4 digits.");
      if(pass!==$("l-confirm").value)return fail("The two passcodes don't match.");
      await createVault(pass);
    }else{
      var f=(await kvGet("fails"))||{n:0,until:0};
      if(Date.now()<f.until)return fail("Too many wrong tries. Wait "+Math.ceil((f.until-Date.now())/1000)+" seconds.");
      try{await openVault(pass);}
      catch(e){
        f.n++;if(f.n>=5)f.until=Date.now()+Math.min(900,30*Math.pow(2,f.n-5))*1000;
        await kvSet("fails",f);
        return fail(f.n>=5?"Wrong passcode. Wait "+Math.ceil((f.until-Date.now())/1000)+" seconds before trying again.":"Wrong passcode.");
      }
      await kvSet("fails",{n:0,until:0});
    }
  }catch(e){return fail("Couldn't open storage on this phone. Close the app and try again.");}
  $("l-pass").value="";$("l-confirm").value="";btn.disabled=false;
  await rememberKey();await enterApp();
});
$("l-erase").addEventListener("click",async function(){
  if(!eraseArmed){eraseArmed=true;this.textContent="Tap again: this deletes every group and receipt";return;}
  await eraseEverything();
});
/* Staying unlocked: after one correct passcode the data key is kept on this phone in a form web pages
   can't read out or copy, so the app opens without asking. "Lock now" removes it. */
var keepOn=true;
async function rememberKey(){try{keepOn=(await kvGet("keep"))!==false;await kvSet("dek",keepOn?DEK:null);}catch(e){}}
async function enterApp(){
  var ch=false;S.groups.forEach(function(g){if(upgrade(g))ch=true;});
  var added=0;S.groups.forEach(function(g){added+=C.runRepeats(g,today(),Date.now);});
  if(ch||added)await persist();
  S.ready=true;S.screen="home";S.gid=null;
  $("lock").hidden=true;$("acct").hidden=true;$("app").hidden=false;
  render();
  if(added)toast(added+" monthly expense"+(added===1?"":"s")+" added.");
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
  cloudInit().then(function(){paintCloud();if(cuser)cloudStart();if(pendingJoin){var c=pendingJoin;pendingJoin=null;openJoin(c);}
    if(cuser&&vaultV===2&&window.PixoraPin){var lp=lastPass;lastPass="";PixoraPin.check({fdb:fdb,uid:cuser.uid,cur:lp,onDone:function(n){kvSet("mk",n).catch(function(){});toast("Your Pixora passcode is now 4 digits, for every app.");}});}});
}
document.addEventListener("visibilitychange",function(){
  if(document.hidden)hiddenAt=Date.now();
  else if(DEK&&!keepOn&&hiddenAt&&Date.now()-hiddenAt>180000)lock();
});

/* ---------- Pixora account and cloud sync ----------
   Firebase project "Pixora" (pixora-bca1f), web app "Split Log".
   Your own list of groups lives under apps/splitlog/users/<uid>, which only you can read or write. It is
   encrypted with your Split Log data key, which is stored only wrapped by your passcode.
   Each group lives under apps/splitlog/groups/<group id>, readable and writable only by its members. A
   person becomes a member by proving they hold the secret from the invite. Everything inside a group is
   encrypted with that group's own key, which travels only inside the invite and never reaches the server,
   so the database holds ciphertext that nobody with database access, the project owner included, can read.
   Receipt photos never leave the phone that took them. */
var USERS="apps/splitlog/users/",GROUPS="apps/splitlog/groups/";
var fdb=null,cuser=null,authReady=null,cloudLive=false,cloudState="off",cloudConflict=null,cloudErr="",lastSync=0;
var pUnsub=null,gSubs={},gkCache={},pushing=false,pushAgain=false,pushTimer=null,pendingJoin=null,joinWipeArmed=false;
function toBytes(u){return firebase.firestore.Blob.fromUint8Array(u instanceof Uint8Array?u:new Uint8Array(u));}
function fromBytes(b){return b&&b.toUint8Array?b.toUint8Array():new Uint8Array(0);}
function sts(){return firebase.firestore.FieldValue.serverTimestamp();}
function cloudInit(){
  if(authReady)return authReady;
  authReady=new Promise(function(res){
    if(!window.firebase||!window.PIXORA_CLOUD){res(null);return;}
    try{
      firebase.initializeApp(window.PIXORA_CLOUD);
      fdb=firebase.firestore();
      if(window.PIXORA_EMULATOR){fdb.useEmulator("127.0.0.1",window.PIXORA_EMULATOR.db);firebase.auth().useEmulator("http://127.0.0.1:"+window.PIXORA_EMULATOR.auth,{disableWarnings:true});}
      fdb.enablePersistence({synchronizeTabs:true}).catch(function(){});
    }catch(e){fdb=null;res(null);return;}
    var first=true,t=setTimeout(function(){if(first){first=false;res(cuser);}},6000);
    firebase.auth().onAuthStateChanged(function(u){
      var was=cuser&&cuser.uid;cuser=u||null;
      if(first){first=false;clearTimeout(t);res(cuser);return;}
      if((u&&u.uid)===was)return;
      cloudStop();if(u&&DEK)cloudStart();
      if(S.ready)render();
    });
  });
  return authReady;
}
function userDoc(){return fdb.doc(USERS+cuser.uid);}
function listCol(){return userDoc().collection("items");}
function groupDoc(gid){return fdb.doc(GROUPS+gid);}
function gkey(g){
  if(!gkCache[g.id])gkCache[g.id]=crypto.subtle.importKey("raw",unb64(g.key),"AES-GCM",false,["encrypt","decrypt"]);
  return gkCache[g.id];
}
async function sealJson(key,o){var b=await seal(key,utf8(JSON.stringify(o)));return {iv:toBytes(b.iv),ct:toBytes(b.ct)};}
async function openJson(key,d){return JSON.parse(new TextDecoder().decode(await unseal(key,{iv:fromBytes(d.iv),ct:fromBytes(d.ct)})));}
/* What the group stores to check invites: a one-way fingerprint of the invite secret, as lowercase hex. */
async function joinHash(tok){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",utf8(tok)))).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
function metaToCloud(m){
  if(m.v===2)return {v:2,vid:m.vid,mts:m.mts||0,pmid:m.pk.mid,piv:toBytes(m.pk.iv),pct:toBytes(m.pk.ct)};
  return {v:1,vid:m.vid,iter:m.iter,salt:toBytes(m.salt),wiv:toBytes(m.wrapped.iv),wct:toBytes(m.wrapped.ct),mts:m.mts||0};
}
function metaFromCloud(d){
  if(d.v===2)return {v:2,vid:d.vid,mts:d.mts||0,pk:{mid:d.pmid,iv:fromBytes(d.piv),ct:fromBytes(d.pct)}};
  return {v:1,vid:d.vid,iter:d.iter,salt:fromBytes(d.salt),wrapped:{iv:fromBytes(d.wiv),ct:fromBytes(d.wct)},mts:d.mts||0};
}
async function getCloudMeta(){var s=await userDoc().get();return s.exists&&s.data().vid?metaFromCloud(s.data()):null;}
function setCloud(state,err){cloudState=state;cloudErr=err||"";if(state==="synced")lastSync=Date.now();paintCloud();}
function statusText(){
  return !cuser?"On this phone only · Sign in to share groups":cloudState==="synced"?"Synced to your Pixora account":cloudState==="syncing"?"Syncing…":
    cloudState==="offline"?"Offline · will sync later":cloudState==="conflict"?"Account needs your other passcode":cloudState==="error"?"Sync paused":"Connecting to your account…";
}
function statusChip(){
  return h("button",{type:"button",id:"saveStatus",class:"status"+((!cuser||cloudState==="conflict"||cloudState==="error")?" warn":""),text:statusText(),onclick:function(){go("settings");}});
}
function paintCloud(){var st=$("saveStatus");if(!st)return;st.textContent=statusText();st.className="status"+((!cuser||cloudState==="conflict"||cloudState==="error")?" warn":"");}
function markKey(kind,gid){return kind+":"+cuser.uid+(gid?":"+gid:"");}
async function resetMarks(){
  var ks=await idb("kv","readonly",function(s){return s.getAllKeys();});
  await Promise.all(ks.filter(function(k){return /^(pp|pl|gp|gl):/.test(k);}).map(function(k){return kvSet(k,null);}));
}

async function cloudStart(){
  if(!fdb||!cuser||!DEK)return;
  cloudStop();setCloud("syncing");
  var uid=cuser.uid,meta=await kvGet("meta");
  if(!meta.vid){meta.vid=rid();meta.mts=Date.now();await setMeta(meta);}
  var cm;
  try{cm=await getCloudMeta();}catch(e){setCloud("offline");return;}
  if(!cuser||cuser.uid!==uid||!DEK)return;
  if(!cm){
    try{await userDoc().set(Object.assign(metaToCloud(meta),{at:sts()}));}catch(e){setCloud("offline");return;}
    cm=meta;
  }
  if(cm.vid!==meta.vid){cloudConflict=cm;setCloud("conflict");if(S.ready)render();return;}
  cloudConflict=null;
  pxCheck(uid,meta);
  if((cm.mts||0)>(meta.mts||0))await setMeta(cm);
  else if((meta.mts||0)>(cm.mts||0))userDoc().set(metaToCloud(meta),{merge:true}).catch(function(){});
  cloudLive=true;
  dashKick(1500);
  listenList(uid);
  S.groups.forEach(function(g){if(g.cloud&&g.acct===uid)listenGroup(g);});
  cloudKick(0);
}
function forgetMarks(gid){if(cuser){kvSet(markKey("gl",gid),null).catch(function(){});kvSet(markKey("gp",gid),null).catch(function(){});}}
function stopGroup(gid){var s=gSubs[gid];if(s){s.forEach(function(f){try{f();}catch(e){}});delete gSubs[gid];}}
function cloudStop(){
  cloudLive=false;
  if(pUnsub){try{pUnsub();}catch(e){}pUnsub=null;}
  Object.keys(gSubs).forEach(stopGroup);
  if(pushTimer){clearTimeout(pushTimer);pushTimer=null;}
  setCloud(cuser?"connecting":"off");
}
function snapErr(err){setCloud(navigator.onLine===false?"offline":"error",err&&err.code);}

/* Your own list of groups (which groups, their keys, which person you are). */
async function listenList(uid){
  var mark=(await kvGet(markKey("pl")))||0;
  if(!cloudLive)return;
  pUnsub=listCol().where("sv",">",firebase.firestore.Timestamp.fromMillis(mark)).onSnapshot({includeMetadataChanges:true},async function(snap){
    if(!cloudLive||!DEK)return;
    var changed=false,top=mark,ch=snap.docChanges();
    for(var i=0;i<ch.length;i++){
      if(ch[i].type==="removed")continue;
      var d=ch[i].doc.data({serverTimestamps:"none"});if(!d.sv)continue;
      top=Math.max(top,d.sv.toMillis());
      try{if(await applyListEntry(ch[i].doc.id.slice(2),d))changed=true;}catch(e){}
    }
    if(changed){await persist();if(S.ready)render();}
    if(!snap.metadata.fromCache){if(top>mark){mark=top;kvSet(markKey("pl"),mark).catch(function(){});}if(!pushing)setCloud("synced");}
  },snapErr);
}
async function applyListEntry(gid,d){
  var g=grp(gid),left=S.left[gid]||0;
  if((d.ts||0)<=Math.max(g?g.pts||0:0,left))return false;
  if(d.del){
    if(g){S.groups=S.groups.filter(function(x){return x.id!==gid;});stopGroup(gid);forgetMarks(gid);await Promise.all(g.expenses.map(function(e){return imgDel(e.imageId);}));}
    S.left[gid]=d.ts;return true;
  }
  var r=await openJson(DEK,d);
  if(!g){
    g={id:gid,name:r.name||"Group",currency:r.currency||"CAD",members:[],expenses:[],settlements:[],updatedAt:Date.now(),
      key:r.key,tok:r.tok,me:r.me||null,cloud:true,owner:r.owner||null,acct:cuser.uid,hts:0,pts:d.ts,tomb:{},seen:{}};
    S.groups.push(g);delete S.left[gid];
    if(cloudLive)listenGroup(g);
  }else{g.me=r.me||null;g.pts=d.ts;}
  return true;
}

/* One group: its header (name, currency, people) and its expenses and payments. */
function listenGroup(g){
  var gid=g.id;if(gSubs[gid]||!cloudLive)return;
  var subs=gSubs[gid]=[];
  subs.push(groupDoc(gid).onSnapshot(async function(snap){
    var cur=grp(gid);if(!cur||!DEK)return;
    if(!snap.exists){if(!snap.metadata.fromCache&&cur.hts){cur.gone=true;await persist();if(S.ready)render();}return;}
    var d=snap.data({serverTimestamps:"none"});
    if(d.owner&&cur.owner!==d.owner){cur.owner=d.owner;}
    if(cur.gone){delete cur.gone;}
    if((d.ts||0)>(cur.hts||0)){
      try{var r=await openJson(await gkey(cur),d);cur.name=r.name;cur.currency=r.currency;cur.members=r.members;cur.hts=d.ts;cur.seen.h=d.ts;}catch(e){return;}
      await persist();if(S.ready)render();
    }
  },function(err){
    var cur=grp(gid);
    if(err&&err.code==="permission-denied"&&cur&&cur.hts){cur.gone=true;persist();if(S.ready)render();}
    else snapErr(err);
    stopGroup(gid);
  }));
  (async function(){
    if(!cuser)return;
    var mark=(await kvGet(markKey("gl",gid)))||0;
    if(!gSubs[gid]||!cuser)return;
    subs.push(groupDoc(gid).collection("items").where("sv",">",firebase.firestore.Timestamp.fromMillis(mark)).onSnapshot({includeMetadataChanges:true},async function(snap){
      var cur=grp(gid);if(!cur||!DEK)return;
      var changed=false,top=mark,ch=snap.docChanges(),key=await gkey(cur);
      for(var i=0;i<ch.length;i++){
        if(ch[i].type==="removed")continue;
        var d=ch[i].doc.data({serverTimestamps:"none"});if(!d.sv)continue;
        top=Math.max(top,d.sv.toMillis());
        try{if(await applyItem(cur,key,ch[i].doc.id,d))changed=true;}catch(e){}
      }
      if(changed){cur.updatedAt=Date.now();await persist();if(S.ready)render();}
      if(!snap.metadata.fromCache){if(top>mark){mark=top;kvSet(markKey("gl",gid),mark).catch(function(){});}if(!pushing)setCloud("synced");}
    },function(err){if(!(err&&err.code==="permission-denied"))snapErr(err);}));
  })();
}
async function applyItem(g,key,k,d){
  var isE=k.indexOf("e_")===0,list=isE?g.expenses:k.indexOf("s_")===0?g.settlements:null;if(!list)return false;
  var id=k.slice(2),idx=list.findIndex(function(x){return x.id===id;}),cur=idx>=0?list[idx].ts||0:0;
  if((d.ts||0)<=Math.max(cur,g.tomb[k]||0))return false;
  g.seen[k]=d.ts;delete g.tomb[k];
  if(d.del){if(idx>=0){var gone=list.splice(idx,1)[0];if(gone.imageId)imgDel(gone.imageId);}return true;}
  var rec=await openJson(key,d);rec.id=id;rec.ts=d.ts;
  rec.imageId=idx>=0?list[idx].imageId||null:null;
  if(idx>=0)list[idx]=rec;else list.push(rec);
  return true;
}

function cloudKick(ms){
  if(!cloudLive)return;
  if(pushTimer)clearTimeout(pushTimer);
  pushTimer=setTimeout(function(){pushTimer=null;cloudPush();},ms==null?800:ms);
}
/* Sends whatever changed since the last send. Each record carries the time it was last changed; the newest wins. */
async function cloudPush(){
  if(!cloudLive||!DEK||!cuser)return;
  if(pushing){pushAgain=true;return;}
  pushing=true;setCloud(navigator.onLine===false?"offline":"syncing");
  var uid=cuser.uid;
  try{
    for(var i=0;i<S.groups.length;i++){
      var g=S.groups[i];
      if(g.cloud&&g.acct!==uid)continue; /* synced by a different Pixora account on this phone */
      if(!g.cloud)await createCloudGroup(g);
      await pushGroup(g);
    }
    await pushList();
    if(cuser&&cuser.uid===uid)setCloud("synced");
  }catch(e){setCloud(navigator.onLine===false?"offline":"error",e&&e.code);}
  finally{pushing=false;if(pushAgain){pushAgain=false;cloudKick(300);}}
}
async function createCloudGroup(g){
  var uid=cuser.uid,head=await sealJson(await gkey(g),{name:g.name,currency:g.currency,members:g.members});
  await groupDoc(g.id).set({owner:uid,jh:await joinHash(g.tok),ts:g.hts||1,iv:head.iv,ct:head.ct,sv:sts()});
  await groupDoc(g.id).collection("members").doc(uid).set({t:g.tok,at:sts()});
  g.cloud=true;g.owner=uid;g.acct=uid;g.seen.h=g.hts;g.pts=Math.max(g.pts||0,Date.now());
  await persist();listenGroup(g);
}
async function pushGroup(g){
  var mk=markKey("gp",g.id),mark=(await kvGet(mk))||0,top=mark,ops=[],key=await gkey(g);
  function want(k,ts){if(ts>top)top=ts;return ts>mark&&g.seen[k]!==ts;}
  g.expenses.forEach(function(e){if(want("e_"+e.id,e.ts||0))ops.push(["e_"+e.id,e]);});
  g.settlements.forEach(function(s){if(want("s_"+s.id,s.ts||0))ops.push(["s_"+s.id,s]);});
  Object.keys(g.tomb).forEach(function(k){if(want(k,g.tomb[k]))ops.push([k,null,g.tomb[k]]);});
  if(want("h",g.hts||0)){
    var head=await sealJson(key,{name:g.name,currency:g.currency,members:g.members});
    await groupDoc(g.id).update({ts:g.hts,iv:head.iv,ct:head.ct,sv:sts()});
  }
  for(var i=0;i<ops.length;i+=200){
    var batch=fdb.batch();
    for(var j=i;j<Math.min(i+200,ops.length);j++){
      var o=ops[j],ref=groupDoc(g.id).collection("items").doc(o[0]);
      if(o[1]==null)batch.set(ref,{ts:o[2],del:true,sv:sts()});
      else{var body=Object.assign({},o[1]);delete body.ts;delete body.imageId;var box=await sealJson(key,body);batch.set(ref,{ts:o[1].ts,iv:box.iv,ct:box.ct,sv:sts()});}
    }
    await batch.commit();
  }
  if(top>mark)await kvSet(mk,top);
}
async function pushList(){
  var mk=markKey("pp"),mark=(await kvGet(mk))||0,top=mark,batch=fdb.batch(),n=0;
  for(var i=0;i<S.groups.length;i++){
    var g=S.groups[i];if(!g.cloud||g.acct!==cuser.uid)continue;
    var ts=g.pts||1;if(ts>top)top=ts;if(ts<=mark)continue;
    var box=await sealJson(DEK,{key:g.key,tok:g.tok,me:g.me||null,owner:g.owner,name:g.name,currency:g.currency});
    batch.set(listCol().doc("g_"+g.id),{ts:ts,iv:box.iv,ct:box.ct,sv:sts()});n++;
  }
  Object.keys(S.left).forEach(function(gid){var ts=S.left[gid];if(ts>top)top=ts;if(ts>mark){batch.set(listCol().doc("g_"+gid),{ts:ts,del:true,sv:sts()});n++;}});
  if(n)await batch.commit();
  if(top>mark)await kvSet(mk,top);
}
/* Removes a group you started, for everyone: its records, its members, then the group itself. */
async function cloudDeleteGroup(gid){
  var refs=[],items=await groupDoc(gid).collection("items").get(),mem=await groupDoc(gid).collection("members").get();
  items.forEach(function(d){refs.push(d.ref);});
  mem.forEach(function(d){if(d.id!==cuser.uid)refs.push(d.ref);});
  for(var i=0;i<refs.length;i+=400){var b=fdb.batch();refs.slice(i,i+400).forEach(function(r){b.delete(r);});await b.commit();}
  await groupDoc(gid).delete();
  await groupDoc(gid).collection("members").doc(cuser.uid).delete().catch(function(){});
}
async function cloudMetaPush(){
  if(!fdb||!cuser)return;
  var meta=await kvGet("meta");
  if(cloudLive)await userDoc().set(metaToCloud(meta),{merge:true});
}
/* Erasing: leave every shared group (friends keep theirs) and remove your own list from the account. */
async function cloudWipe(){
  if(!fdb||!cuser)return;
  var uid=cuser.uid,refs=[];
  await Promise.all(S.groups.filter(function(g){return g.cloud&&g.acct===uid;}).map(function(g){return groupDoc(g.id).collection("members").doc(uid).delete().catch(function(){});}));
  var items=await listCol().get();items.forEach(function(d){refs.push(d.ref);});
  refs.push(userDoc());
  for(var i=0;i<refs.length;i+=400){var b=fdb.batch();refs.slice(i,i+400).forEach(function(r){b.delete(r);});await b.commit();}
  await resetMarks();
}
/* This phone already had its own Split Log when you signed in to an account that has one too:
   open the account's data key with the passcode from the other phone, re-encrypt this phone's
   data with it, and from then on both phones share one key and see the same groups. */
async function cloudJoin(pass){
  var cm=cloudConflict,raw=await unseal(await kek(pass,cm.salt,cm.iter),cm.wrapped);
  var nk=await importDek(raw);raw.fill(0);
  var ids=await idb("images","readonly",function(s){return s.getAllKeys();});
  for(var i=0;i<ids.length;i++){
    var r=await idb("images","readonly",function(s){return s.get(ids[i]);});if(!r)continue;
    var b=await seal(nk,await unseal(DEK,r));
    await idb("images","readwrite",function(s){return s.put({iv:b.iv,ct:b.ct,type:r.type},ids[i]);});
  }
  DEK=nk;await setMeta(cm);
  S.groups.forEach(function(g){g.pts=Math.max(g.pts||0,Date.now());});
  await resetMarks();await persist();await rememberKey();cloudConflict=null;await cloudStart();
}
async function cloudReplace(){
  var keep=S.groups;await cloudWipe();
  keep.forEach(function(g){if(g.acct===cuser.uid){g.cloud=false;g.owner=null;g.acct=null;}g.pts=Date.now();});
  await persist();cloudConflict=null;await cloudStart();
}


/* ---------- One Pixora passcode ----------
   Same scheme as the other Pixora apps: a master secret kept in apps/pixora/users/<uid>, stored only
   wrapped by the Pixora passcode. Split Log derives its own key from it (HKDF info "pixora-app:splitlog"),
   so no other Pixora app can read Split Log data, and that key wraps the Split Log data key ("pk" in meta).
   Phones without an account keep a Split Log passcode on that phone (meta v1). Group keys are separate:
   they travel only in invites, so friends aren't affected by any of this. */
var PX_ITER=600000,pxHasMk=false,pxNeed=null,pxArm=false,lastPass="";
function masterDoc(){return fdb.doc("apps/pixora/users/"+cuser.uid);}
async function getMk(){var s=await masterDoc().get();var m=s.exists?s.data().mk:null;return m&&m.id?m:null;}
async function pxAppKey(m){
  var base=await crypto.subtle.importKey("raw",m,"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:utf8("pixora"),info:utf8("pixora-app:splitlog")},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function pxMaster(pass,mk){
  var k=await kek(pass,unb64(mk.salt),Math.min(Math.max(+mk.iter||PX_ITER,100000),2000000));
  var o=JSON.parse(new TextDecoder().decode(await unseal(k,{iv:unb64(mk.iv),ct:unb64(mk.ct)})));
  return unb64(o.m);
}
async function pxWrapMaster(pass,m,id){
  var salt=rnd(16),b=await seal(await kek(pass,salt,PX_ITER),utf8(JSON.stringify({m:b64(m)})));
  var out={v:1,id:id,salt:b64(salt),iter:PX_ITER,iv:b64(b.iv),ct:b64(b.ct)};if(/^\d{4}$/.test(pass))out.fmt="pin4";return out;
}
/* The app key from the typed Pixora passcode; sets up the Pixora passcode if the account has none yet. */
async function pxKey(pass){
  var mk=await getMk();
  if(!mk){var m=rnd(32),id=b64(rnd(9)).replace(/[+/=]/g,"");mk=await pxWrapMaster(pass,m,id);await masterDoc().set({mk:mk},{merge:true});
    if(window.PixoraPin)await PixoraPin.remember(m,id);
    var ak0=await pxAppKey(m);m.fill(0);await kvSet("mk",mk);T("px_passcode_set");return {ak:ak0,mk:mk};}
  var raw;try{raw=await pxMaster(pass,mk);}catch(e){throw {code:"wrong"};}
  if(window.PixoraPin)await PixoraPin.remember(raw,mk.id);lastPass=pass;
  var ak=await pxAppKey(raw);raw.fill(0);await kvSet("mk",mk);return {ak:ak,mk:mk};
}
async function resealImages(nk){
  var ids=await idb("images","readonly",function(s){return s.getAllKeys();});
  for(var i=0;i<ids.length;i++){
    var r=await idb("images","readonly",function(s){return s.get(ids[i]);});if(!r)continue;
    try{var b=await seal(nk,await unseal(DEK,r));await idb("images","readwrite",function(s){return s.put({iv:b.iv,ct:b.ct,type:r.type},ids[i]);});}catch(e){}
  }
}
/* New Split Log on a signed-in phone, locked with the Pixora passcode. */
async function pxCreateVault(pass){
  var r=await pxKey(pass),raw=rnd(32),pk=await seal(r.ak,raw);
  await setMeta({v:2,vid:rid(),mts:Date.now(),pk:{mid:r.mk.id,iv:pk.iv,ct:pk.ct}});
  DEK=await importDek(raw);raw.fill(0);S.groups=[];S.left={};await persist();
}
/* Unlock with the Pixora passcode. Works offline once this phone has seen the account's passcode record. */
async function pxOpenVault(pass){
  var meta=await kvGet("meta"),mk=null,cached=await kvGet("mk").catch(function(){return null;});
  try{await cloudInit();if(fdb&&cuser)mk=await getMk();}catch(e){}
  if(!mk||mk.id!==meta.pk.mid)mk=cached&&cached.id===meta.pk.mid?cached:mk;
  if(!mk)throw {code:"net"};
  var m;try{m=await pxMaster(pass,mk);}catch(e){throw {code:"wrong"};}
  if(window.PixoraPin)await PixoraPin.remember(m,mk.id);lastPass=pass;
  var ak=await pxAppKey(m);m.fill(0);
  var raw=await unseal(ak,meta.pk),key=await importDek(raw);raw.fill(0);
  await openWithKey(key);
}
/* Re-lock this phone's Split Log with the Pixora passcode: a fresh data key, receipt photos re-encrypted,
   and the account's copy replaced. Moves off the old Split Log passcode, or catches up after a Pixora passcode reset. */
async function pxRekey(ak,mid){
  var raw=rnd(32),nk=await importDek(raw),pk=await seal(ak,raw);raw.fill(0);
  await resealImages(nk);
  DEK=nk;var meta={v:2,vid:rid(),mts:Date.now(),pk:{mid:mid,iv:pk.iv,ct:pk.ct}};await setMeta(meta);
  S.groups.forEach(function(g){g.pts=Math.max(g.pts||0,Date.now());});
  await persist();await rememberKey();
  if(fdb&&cuser){cloudStop();await userDoc().set(Object.assign(metaToCloud(meta),{at:sts()}));await resetMarks();}
  pxNeed=null;cloudConflict=null;T("px_relock");
  if(fdb&&cuser)await cloudStart();
}
/* The account holds a Split Log locked with the Pixora passcode from another phone: take its key and combine. */
async function pxAdopt(ak){
  var cm=cloudConflict,raw=await unseal(ak,cm.pk),nk=await importDek(raw);raw.fill(0);
  await resealImages(nk);
  DEK=nk;await setMeta(cm);
  S.groups.forEach(function(g){g.pts=Math.max(g.pts||0,Date.now());});
  await resetMarks();await persist();await rememberKey();cloudConflict=null;pxNeed=null;T("px_combine");await cloudStart();
}
/* Signed in: still on the old passcode, or the Pixora passcode was reset in another app? */
async function pxCheck(uid,meta){
  var need=null;
  try{
    if(meta.v!==2){var mk0=await getMk();need={why:"switch",mk:mk0};}
    else{var mk=await getMk();if(!mk||mk.id!==meta.pk.mid)need={why:"reset",mk:mk};else kvSet("mk",mk).catch(function(){});}
  }catch(e){return;}
  if(!cuser||cuser.uid!==uid)return;
  var was=JSON.stringify(pxNeed&&pxNeed.why);pxNeed=need;
  if(S.ready&&JSON.stringify(need&&need.why)!==was)render();
}
async function pxChangePass(cur,nw){
  var mk=await getMk();if(!mk)throw {code:"nomk"};
  var m;try{m=await pxMaster(cur,mk);}catch(e){throw {code:"wrong"};}
  var nmk=await pxWrapMaster(nw,m,mk.id);m.fill(0);
  await masterDoc().set({mk:nmk},{merge:true});await kvSet("mk",nmk);T("px_passcode_change");
}
/* The card that asks for the Pixora passcode once. */
function pxCard(){
  var conflict=cloudConflict&&cloudConflict.v===2,need=pxNeed;
  if(!conflict&&!need)return null;
  var setting=!conflict&&need&&!need.mk;
  var title=conflict?"Combine with your account":need.why==="reset"?"Enter your new Pixora passcode":setting?"Set your Pixora passcode":"Switch to your Pixora passcode";
  var text=conflict?"Your Pixora account already has Split Log from another phone. Enter your Pixora passcode to combine it with this phone. Nothing is lost on either side."
    :need.why==="reset"?"Your Pixora passcode was changed or reset in another Pixora app. Enter the current one so this phone keeps syncing."
    :setting?"Split Log now uses one Pixora passcode, shared with your other Pixora apps. Set it once here and your old Split Log passcode is retired."
    :"Split Log now uses your Pixora passcode, the same as your other Pixora apps. Enter it once and your old Split Log passcode is retired. Friends and shared groups aren't affected.";
  var msg=h("p",{class:"err",role:"alert",hidden:true});
  var p1=h("input",{type:"password",id:"px-p1",autocomplete:setting?"new-password":"current-password"});
  var p2=setting?h("input",{type:"password",id:"px-p2",autocomplete:"new-password"}):null;
  var go=h("button",{type:"submit",class:"btn primary",text:setting?"Set passcode":"Continue"});
  var f=h("form",{class:"panel pxcard",novalidate:true},h("h3",{text:title}),h("p",{class:"small",text:text}),
    h("div",{class:"field"},h("label",{for:"px-p1",text:"Pixora passcode"}),p1),
    p2?h("div",{class:"field"},h("label",{for:"px-p2",text:"Repeat it"}),p2):null,msg,h("div",{class:"btnrow"},go));
  f.addEventListener("submit",async function(ev){
    ev.preventDefault();msg.hidden=true;
    if(setting&&!/^\d{4}$/.test(p1.value)){msg.textContent="Use exactly 4 digits.";msg.hidden=false;return;}
    if(setting&&p1.value!==p2.value){msg.textContent="The two passcodes don't match.";msg.hidden=false;return;}
    go.disabled=true;go.textContent="Working…";
    try{
      var r=await pxKey(p1.value);
      if(conflict){
        if(cloudConflict.pk.mid!==r.mk.id)throw {code:"stale"};
        await pxAdopt(r.ak);toast("Combined. This phone and your account now match.");
      }else{await pxRekey(r.ak,r.mk.id);toast("Done. Split Log now opens with your Pixora passcode.");}
      render();
    }catch(e){
      go.disabled=false;go.textContent=setting?"Set passcode":"Continue";
      msg.textContent=e&&e.code==="wrong"?"That isn't your Pixora passcode.":e&&e.code==="stale"?"The Split Log copy in your account was locked before your Pixora passcode was reset, so nothing can open it. Replace it with this phone's groups below.":navigator.onLine===false?"No connection. Connect and try again.":"Something went wrong. Try again.";
      msg.hidden=false;
      if(e&&e.code==="stale"&&!f.querySelector(".pxreplace"))f.append(h("div",{class:"btnrow pxreplace"},h("button",{type:"button",class:"btn danger",text:"Replace the account's Split Log list with this phone's",onclick:async function(){
        try{await cloudReplace();render();}catch(x){toast("Couldn't reach your account. Try again.");}}})));
    }
  });
  return f;
}

/* ---------- Pixora Today dashboard ----------
   A few numbers, encrypted on this phone to your own dashboard's key (see pixora-summary.js). */
function dashKick(ms){
  if(!window.PixoraSummary)return;
  PixoraSummary.schedule("splitlog",function(){
    if(!fdb||!cuser||!DEK||!S.ready)return null;
    return {fdb:fdb,uid:cuser.uid,build:function(){
      var mine=S.groups.filter(function(g){return !g.gone;}),groups=[];
      mine.forEach(function(g){var me=C.myId(g);if(!me)return;var c=C.balances(g)[me]||0;groups.push({n:g.name,cur:g.currency||"CAD",net:c});});
      groups.sort(function(a,b){return Math.abs(b.net)-Math.abs(a.net);});
      return {d:today(),count:mine.length,totals:C.summary(mine),groups:groups.slice(0,5)};
    }};
  },ms);
}

/* ---------- invites ---------- */
function inviteCode(g){return g.id+"."+b64url(unb64(g.key))+"."+g.tok;}
function inviteLink(g){return location.href.split("#")[0]+"#join="+inviteCode(g);}
function parseInvite(text){
  var m=String(text||"").trim().match(/([a-z0-9]{6,24})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{16,64})/);
  if(!m)return null;
  var key;try{key=unb64url(m[2]);}catch(e){return null;}
  if(key.length!==32)return null;
  return {gid:m[1],key:b64(key),tok:m[3]};
}
function openInvite(g){
  T("invite_open");
  var box=h("div",{class:"form"},h("h2",{id:"dlgTitle",text:"Invite friends to "+g.name}));
  if(!cuser){
    box.append(h("p",{class:"small",text:"Shared groups live in your Pixora account, so friends see the same totals and can add expenses themselves. Sign in or create a free Pixora account first."}),
      acctForm("i",async function(){await cloudStart();openInvite(grp(g.id));}),
      h("p",{class:"small muted",text:"Rather not? Share > Copy view-only link sends a read-only snapshot that needs no account."}),
      h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet",text:"Close",onclick:closeDlg})));
    openDlg(box);return;
  }
  if(!g.cloud)cloudKick(0);
  var link=inviteLink(g),ta=h("textarea",{readonly:true,"aria-label":"Invite link",style:"min-height:90px"});ta.value=link;
  box.append(h("p",{class:"small",text:"Send this link. Friends sign in with a free Pixora account, then see the same balances you do and can add expenses and payments. Changes show up on everyone's phone."}),
    ta,
    h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn primary",text:navigator.share?"Send invite":"Copy invite",onclick:async function(){
        T("invite_send");if(navigator.share){try{await navigator.share({text:"Join "+g.name+" on Split Log: "+link});}catch(e){}}else copy(link);
      }}),
      navigator.share?h("button",{type:"button",class:"btn",text:"Copy",onclick:function(){copy(link);}}):null),
    h("p",{class:"small muted",text:"Anyone who has this link can join and see the group, so send it only to the people in it. The link holds the group's key: the Pixora servers never see it, so they can't read the group."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet",text:"Done",onclick:closeDlg})));
  openDlg(box);
}
function openJoin(code){
  var inv=parseInvite(code),box=h("div",{class:"form"},h("h2",{id:"dlgTitle",text:"Join a group"})),msg=h("p",{class:"err",role:"alert",hidden:true});
  var field1=h("textarea",{"aria-label":"Invite link or code",placeholder:"Paste the invite link or code",style:"min-height:90px"});field1.value=code||"";
  var go1=h("button",{type:"button",class:"btn primary",text:"Join",onclick:async function(){
    var v=parseInvite(field1.value);
    if(!v){msg.textContent="That doesn't look like a Split Log invite. Paste the whole link.";msg.hidden=false;return;}
    if(!cuser){msg.textContent="Sign in with your Pixora account below first.";msg.hidden=false;return;}
    go1.disabled=true;go1.textContent="Joining…";msg.hidden=true;
    try{var g=await joinGroup(v);T("join_group");closeDlg();go("group",g.id);if(!g.me)openGroup(g,"You're in. Mark which person is you, or add yourself, then save.");}
    catch(e){msg.textContent=e&&e.message||"Couldn't join. Try again.";msg.hidden=false;go1.disabled=false;go1.textContent="Join";}
  }});
  box.append(inv?h("p",{class:"small",text:"A friend invited you to a shared group. Join to see the balances and add expenses together."}):null,
    field("Invite link or code",field1),msg,
    h("div",{class:"btnrow"},go1,h("button",{type:"button",class:"btn quiet",text:"Cancel",onclick:closeDlg})));
  if(inv)box.append(h("p",{class:"small muted",text:"Use Split Log from your home screen? That copy keeps its own data, so open it there instead: copy this link, open Split Log from the home screen, tap Join a group and paste it."}),
    h("div",{class:"btnrow"},h("button",{type:"button",class:"btn quiet mini",text:"Copy the invite",onclick:function(){copy(field1.value);}})));
  if(!cuser)box.append(h("hr",{class:"rule"}),h("p",{class:"small",text:"Joining needs a free Pixora account, the same one used by the other Pixora apps."}),
    acctForm("j",async function(){await cloudStart();go1.click();}));
  openDlg(box);
}
async function joinGroup(v){
  var have=grp(v.gid);if(have)return have;
  await cloudInit();
  if(!fdb||!cuser)throw new Error("Sign in with your Pixora account first.");
  await kvSet(markKey("gl",v.gid),null);await kvSet(markKey("gp",v.gid),null);
  var mref=groupDoc(v.gid).collection("members").doc(cuser.uid);
  try{
    var ms=await mref.get();
    if(!ms.exists)await mref.set({t:v.tok,at:sts()});
  }catch(e){
    throw new Error(e&&e.code==="unavailable"?"You're offline. Connect to the internet and try again.":"That invite doesn't work. The group may have been deleted, or the link was cut off.");
  }
  var snap=await groupDoc(v.gid).get(),d=snap.exists?snap.data({serverTimestamps:"none"}):null;
  if(!d)throw new Error("That group no longer exists.");
  var g={id:v.gid,name:"Group",currency:"CAD",members:[],expenses:[],settlements:[],updatedAt:Date.now(),key:v.key,tok:v.tok,me:null,
    cloud:true,owner:d.owner||null,acct:cuser.uid,hts:0,pts:Date.now(),tomb:{},seen:{}};
  try{var r=await openJson(await gkey(g),d);g.name=r.name;g.currency=r.currency;g.members=r.members;g.hts=d.ts;g.seen.h=d.ts;}
  catch(e){delete gkCache[g.id];try{await mref.delete();}catch(x){}throw new Error("That invite's key doesn't match the group. Ask for a fresh link.");}
  S.groups.push(g);delete S.left[g.id];await persist();
  if(cloudLive)listenGroup(g);else cloudStart();
  return g;
}

/* ---------- account forms ---------- */
var AUTH_MSG={"auth/invalid-credential":"That email and password don't match a Pixora account.","auth/wrong-password":"That email and password don't match a Pixora account.","auth/user-not-found":"That email and password don't match a Pixora account.","auth/invalid-login-credentials":"That email and password don't match a Pixora account.","auth/email-already-in-use":"There is already a Pixora account with that email. Tap Sign in instead.","auth/weak-password":"Use at least 6 characters for the password.","auth/invalid-email":"That doesn't look like an email address.","auth/network-request-failed":"No connection. Connect to the internet and try again.","auth/too-many-requests":"Too many tries. Wait a few minutes and try again."};
async function acctAuth(mode,email,pw){
  await cloudInit();
  if(!fdb)throw {code:"cloud/unavailable",message:"The Pixora account service couldn't start here."};
  email=(email||"").trim();
  if(!/^\S+@\S+\.\S+$/.test(email))throw {code:"auth/invalid-email"};
  if(mode==="reset"){await firebase.auth().sendPasswordResetEmail(email);return null;}
  if(!pw)throw {code:"auth/missing-password",message:"Type your password."};
  var c=mode==="create"?await firebase.auth().createUserWithEmailAndPassword(email,pw):await firebase.auth().signInWithEmailAndPassword(email,pw);
  T(mode==="create"?"account_create":"signin");
  cuser=c.user;return cuser;
}
function authText(e){return AUTH_MSG[e&&e.code]||(e&&e.message)||"Something went wrong. Try again.";}
function acctForm(prefix,onDone){
  var msg=h("p",{class:"err",role:"alert",hidden:true});
  var em=h("input",{type:"email",id:prefix+"-email",autocomplete:"username",autocapitalize:"off",spellcheck:"false",inputmode:"email"});
  var pw=h("input",{type:"password",id:prefix+"-pw",autocomplete:"current-password"});
  function go2(mode){return async function(){
    msg.hidden=true;msg.style.color="";
    var btns=wrap.querySelectorAll("button");btns.forEach(function(b){b.disabled=true;});
    try{
      await acctAuth(mode,em.value,pw.value);
      if(mode==="reset"){msg.style.color="var(--muted)";msg.textContent="If a Pixora account uses that email, a reset link is on its way. Check your spam folder too.";msg.hidden=false;}
      else{pw.value="";await onDone();}
    }catch(e){msg.textContent=authText(e);msg.hidden=false;}
    btns.forEach(function(b){b.disabled=false;});
  };}
  var wrap=h("div",{class:"field",style:"gap:12px"},
    h("div",{class:"field"},h("label",{for:prefix+"-email",text:"Email"}),em),
    h("div",{class:"field"},h("label",{for:prefix+"-pw",text:"Password"}),pw),msg,
    h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn primary",text:"Sign in",onclick:go2("signin")}),
      h("button",{type:"button",class:"btn",text:"Create account",onclick:go2("create")}),
      h("button",{type:"button",class:"btn quiet",text:"Forgot password",onclick:go2("reset")})));
  return wrap;
}
/* First screen on a phone with no Split Log yet. */
function showAccount(problem){
  $("app").hidden=true;$("lock").hidden=true;$("acct").hidden=false;
  var box=$("acctBody");box.textContent="";
  box.append(acctForm("a",async function(){$("acct").hidden=true;await routeSignedIn();}));
  box.append(h("button",{type:"button",class:"btn quiet",style:"align-self:flex-start",text:"Use on this phone only, without an account",onclick:function(){$("acct").hidden=true;showLock("setup");}}));
  if(problem)box.prepend(h("p",{class:"err",role:"alert",text:problem}));
}
async function routeSignedIn(){
  var cm=null;
  try{cm=await getCloudMeta();}
  catch(e){showAccount("Couldn't reach your Pixora account. Check the connection and sign in again.");return;}
  if(cm){await setMeta(cm);showLock(cm.v===2?"pxunlock":"unlock",null,"cloud");}
  else{var mk=null;try{mk=await getMk();}catch(e){}pxHasMk=!!mk;showLock("pxnew",null,"cloud");}
}
function cloudPanel(){
  var p=h("div",{class:"panel"},h("h3",{text:"Pixora account"}));
  if(!fdb&&!window.firebase){p.append(h("p",{class:"small muted",text:"The account service isn't available in this view."}));return p;}
  if(!cuser){
    p.append(h("p",{class:"small muted",text:"Sign in with your Pixora account to share groups with friends live and to use Split Log on more than one phone. Everything is encrypted on your phone before it's uploaded, so nobody else can read it, including whoever runs Pixora. Receipt photos stay on this phone."}));
    p.append(acctForm("s",async function(){render();await cloudStart();render();}));
    return p;
  }
  p.append(h("p",{class:"small",text:"Signed in as "+(cuser.email||"your Pixora account")+"."}));
  if(cloudState==="conflict"&&cloudConflict&&cloudConflict.v===2){
    p.append(pxCard());
  }else if(cloudState==="conflict"){
    var msg=h("p",{class:"err",role:"alert",hidden:true});
    p.append(h("p",{class:"small",style:"font-weight:600",text:"This account already has Split Log data from another phone, protected by a different passcode. Enter that passcode to combine it with what's on this phone."}),
      pw("s-joinpw","Passcode from your other phone","current-password"),msg);
    var jb=h("button",{type:"button",class:"btn primary",text:"Combine",onclick:async function(){
      jb.disabled=true;jb.textContent="Combining…";
      try{await cloudJoin($("s-joinpw").value);toast("Combined. Both phones now use the same passcode.");render();}
      catch(e){msg.textContent="That passcode doesn't open the data in your account.";msg.hidden=false;jb.disabled=false;jb.textContent="Combine";}
    }});
    var rb=h("button",{type:"button",class:"btn danger",text:joinWipeArmed?"Tap again: replaces the account's Split Log list":"I forgot it: replace the account's list with this phone's",onclick:async function(){
      if(!joinWipeArmed){joinWipeArmed=true;render();return;}
      joinWipeArmed=false;rb.disabled=true;
      try{await cloudReplace();toast("Your account now holds this phone's groups.");}catch(e){toast("Couldn't reach your account. Try again.");}
      render();
    }});
    p.append(h("div",{class:"btnrow"},jb,rb));
  }else{
    var when=lastSync?new Date(lastSync).toLocaleTimeString(LOC(),{hour:"numeric",minute:"2-digit"}):"";
    p.append(h("p",{class:"small muted",text:cloudState==="synced"?"Your groups are backed up"+(when?" (last checked "+when+")":"")+". Changes from friends and your other phones show up on their own. Receipt photos stay on the phone that took them.":cloudState==="offline"?"Offline. Changes are kept on this phone and upload when you're back online.":cloudState==="error"?"Sync paused"+(cloudErr?" ("+cloudErr+")":"")+". Tap Sync now to try again.":"Syncing…"}));
    p.append(h("div",{class:"btnrow"},
      h("button",{type:"button",class:"btn",text:"Sync now",onclick:function(){cloudStart().then(render);}}),
      h("button",{type:"button",class:"btn quiet",text:"Sign out",onclick:async function(){cloudStop();await firebase.auth().signOut();cuser=null;render();toast("Signed out. Your groups stay on this phone.");}})));
  }
  return p;
}
addEventListener("hashchange",function(){
  if(location.hash.slice(0,6)!=="#join=")return;
  var c=location.hash.slice(6);history.replaceState(null,"",location.pathname+location.search);
  if(S.ready)openJoin(c);else pendingJoin=c;
});
addEventListener("offline",function(){if(cuser&&cloudLive)setCloud("offline");});
addEventListener("online",function(){if(cuser&&DEK&&(cloudState==="offline"||cloudState==="error"))cloudStart();});

/* ---------- start ---------- */
async function start(){
  if(!window.isSecureContext||!window.crypto||!crypto.subtle||!window.indexedDB){showLock("setup","This app needs to be opened from its https address to encrypt your data.");return;}
  try{
    var meta=await kvGet("meta"),saved=null;
    if(meta){vaultV=meta.v||1;
      try{keepOn=(await kvGet("keep"))!==false;if(keepOn)saved=await kvGet("dek");}catch(e){saved=null;}
      if(saved){try{await openWithKey(saved);await enterApp();}catch(e){DEK=null;saved=null;kvSet("dek",null).catch(function(){});}}
    }
    if(!saved&&meta&&meta.v===2&&keepOn&&meta.pk&&window.PixoraPin){
      try{var sak=await PixoraPin.recall(meta.pk.mid,"splitlog");if(sak){var sraw=await unseal(sak,meta.pk),skey=await importDek(sraw);sraw.fill(0);await openWithKey(skey);await rememberKey();T("unlock_shared");await enterApp();saved=true;}}catch(e){DEK=null;}
    }
    if(!saved){
      if(meta)showLock(meta.v===2?"pxunlock":"unlock");
      else{var u0=await cloudInit();if(u0)await routeSignedIn();else showAccount();}
    }
  }catch(e){showLock("setup","Storage is blocked here. Turn off Private Browsing, then open the app again.");}
}
(function boot(){
  var snap=null,hash=location.hash;
  if(hash.slice(0,3)==="#s="){
    try{var s=hash.slice(3).replace(/-/g,"+").replace(/_/g,"/");snap=C.cleanSnapshot(JSON.parse(new TextDecoder().decode(unb64(s))));}catch(e){}
  }
  if(hash.slice(0,6)==="#join="){pendingJoin=hash.slice(6);history.replaceState(null,"",location.pathname+location.search);}
  if(window.PixoraUsage)PixoraUsage.init("splitlog","splitlog-v7",function(){return fdb&&cuser?fdb:null;});
  if(snap){T("view_only_link_opened");showShared(snap,start);}else start();
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(function(){});
})();
