/* Pixora PIN: what every Pixora app shares about the Pixora passcode.
   - New Pixora passcodes are exactly 4 digits. The account's wrapped master key says so with fmt:"pin4".
   - Accounts on an older passcode switch once, from whichever app opens first: the current passcode once,
     then 4 digits. The master key itself stays the same, so every app, phone and piece of data keeps working.
   - One unlock is shared by every Pixora app that runs in the same place (Safari shares one storage for the
     whole site), so typing it in one app opens the others there too. Home-screen apps each have their own
     storage on iPhone, so each asks once per phone, then never again.
   The master key stays wrapped in the account; the shared unlock on the phone is a non-extractable key.
   Shared file: the same copy lives in every Pixora app. Change it in one, copy it to all. */
(function(root){
"use strict";
var ITER=600000,enc=new TextEncoder(),dec=new TextDecoder();
function rnd(n){return crypto.getRandomValues(new Uint8Array(n));}
function b64(u){var s="",i;for(i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function unb64(s){if(s instanceof Uint8Array)return s;if(Array.isArray(s))return new Uint8Array(s);var b=atob(s),o=new Uint8Array(b.length),i;for(i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
function T(f){try{if(root.PixoraUsage)PixoraUsage.track(f);}catch(e){}}
function isPin(p){return /^\d{4}$/.test(String(p||""));}
function isPin4(mk){return !!(mk&&mk.fmt==="pin4");}
async function kek(pass,salt,iter){
  var base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
/* The master secret (32 bytes) from a passcode and the account's wrapped copy. Throws {code:"wrong"}. */
async function unwrap(pass,mk){
  try{
    var k=await kek(pass,unb64(mk.salt),Math.min(Math.max(+mk.iter||ITER,100000),2000000));
    var o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(mk.iv)},k,unb64(mk.ct))));
    return unb64(o.m);
  }catch(e){throw {code:"wrong"};}
}
/* A wrapped copy of the master secret under a 4-digit passcode. */
async function wrap(pin,m,id){
  var salt=rnd(16),iv=rnd(12),k=await kek(pin,salt,ITER);
  var ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},k,enc.encode(JSON.stringify({m:b64(m)}))));
  return {v:1,id:id,salt:b64(salt),iter:ITER,iv:b64(iv),ct:b64(ct),fmt:"pin4"};
}
async function newMaster(pin){var m=rnd(32),id=b64(rnd(9)).replace(/[+/=]/g,"");return {m:m,mk:await wrap(pin,m,id)};}
/* Each app's own key, from the master secret or from the shared unlock. */
async function appKeyFrom(base,app){
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:enc.encode("pixora"),info:enc.encode("pixora-app:"+app)},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function baseOf(m){return crypto.subtle.importKey("raw",m,"HKDF",false,["deriveKey"]);}
async function appKey(m,app){return appKeyFrom(await baseOf(m),app);}

/* ---- the shared unlock on this phone (one storage for every Pixora app running in the same place) ---- */
var dbp=null;
function idb(mode,fn){
  if(!root.indexedDB)return Promise.reject("no idb");
  if(!dbp)dbp=new Promise(function(res,rej){var r=indexedDB.open("pixora-shared",1);r.onupgradeneeded=function(){r.result.createObjectStore("kv");};r.onsuccess=function(){res(r.result);};r.onerror=function(){dbp=null;rej(r.error);};});
  return dbp.then(function(db){return new Promise(function(res,rej){var tx=db.transaction("kv",mode),rq=fn(tx.objectStore("kv"));tx.oncomplete=function(){res(rq?rq.result:undefined);};tx.onerror=tx.onabort=function(){rej(tx.error);};});});
}
/* Filed under the master key's id, so an app can use it before it has reached the account. */
async function remember(m,mid){try{var b=await baseOf(m);await idb("readwrite",function(s){return s.put({base:b,mid:mid,at:Date.now()},"master:"+mid);});}catch(e){}}
async function recall(mid,app){
  if(!mid)return null;
  try{var r=await idb("readonly",function(s){return s.get("master:"+mid);});if(r&&r.base)return await appKeyFrom(r.base,app);}catch(e){}
  return null;
}
async function forget(mid){try{await idb("readwrite",function(s){return mid?s.delete("master:"+mid):s.clear();});}catch(e){}}

/* Passcode boxes: 4-digit keypad when the account uses a PIN, a normal field for an older passcode. */
function fit(input,mk,setting){
  if(!input)return;
  var pin=setting||isPin4(mk);
  if(pin){input.setAttribute("inputmode","numeric");input.setAttribute("pattern","[0-9]*");input.setAttribute("maxlength","4");input.setAttribute("autocomplete","off");}
  else{input.removeAttribute("inputmode");input.removeAttribute("pattern");input.removeAttribute("maxlength");}
}

/* ---- switching to (or changing) the 4-digit passcode, in a small sheet of its own ---- */
var CSS=".pxp-back{position:fixed;inset:0;z-index:9999;background:rgba(10,20,30,.5);display:flex;align-items:flex-end;justify-content:center;padding:0}"+
".pxp-card{width:100%;max-width:440px;background:#fbfcfa;color:#14232a;border-radius:20px 20px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;font:16px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.25)}"+
"@media (min-width:600px){.pxp-back{align-items:center}.pxp-card{border-radius:20px}}"+
"@media (prefers-color-scheme:dark){.pxp-card{background:#16212a;color:#e9eef0}.pxp-card input{background:#0f171e!important;color:#e9eef0!important;border-color:#33424d!important}}"+
".pxp-card h2{margin:0;font-size:21px}.pxp-card p{margin:0}.pxp-mut{opacity:.75;font-size:14px}"+
".pxp-f{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:600}.pxp-f input{border:1px solid #c9d3d0;background:#fff;color:#14232a;border-radius:10px;padding:10px 12px;min-height:48px;font-size:20px;letter-spacing:.2em}"+
".pxp-err{color:#b0371f;font-weight:600;font-size:14px;min-height:1px}.pxp-b{min-height:48px;border-radius:12px;border:1px solid #c9d3d0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}"+
".pxp-b.p{background:#1f4fd8;border-color:#1f4fd8;color:#fff}.pxp-row{display:flex;flex-direction:column;gap:8px}";
function sheet(html){
  var st=document.getElementById("pxp-style");if(!st){st=document.createElement("style");st.id="pxp-style";st.textContent=CSS;document.head.append(st);}
  var bk=document.createElement("div");bk.className="pxp-back";bk.setAttribute("role","dialog");bk.setAttribute("aria-modal","true");bk.innerHTML='<form class="pxp-card" novalidate>'+html+'</form>';
  document.body.append(bk);return bk;
}
/* opts: {fdb, uid, mk, mode:"switch"|"change", app, onDone(newMk), onLater()}.
   switch: the account still has an older passcode. change: pick a new 4-digit one. Same master key either way. */
function prompt(opts){
  var mk=opts.mk,sw=opts.mode!=="change",curPin=isPin4(mk);
  var bk=sheet('<h2>'+(sw?"Pixora passcodes are now 4 digits":"Change your Pixora passcode")+'</h2>'+
    '<p class="pxp-mut">'+(sw?"Enter your current Pixora passcode once, then pick 4 digits. Your data stays as it is, and every Pixora app switches over.":"It changes for every Pixora app. Your data stays as it is.")+'</p>'+
    '<label class="pxp-f">Current passcode<input id="pxp-cur" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'+
    '<label class="pxp-f">New 4-digit passcode<input id="pxp-new" type="password"></label>'+
    '<label class="pxp-f">Repeat it<input id="pxp-rep" type="password"></label>'+
    '<p class="pxp-err" id="pxp-err" role="alert"></p>'+
    '<div class="pxp-row"><button class="pxp-b p" type="submit" id="pxp-go">'+(sw?"Switch to 4 digits":"Change passcode")+'</button>'+
    '<button class="pxp-b" type="button" id="pxp-later">'+(sw?"Not now":"Cancel")+'</button></div>');
  var cur=bk.querySelector("#pxp-cur"),nw=bk.querySelector("#pxp-new"),rep=bk.querySelector("#pxp-rep"),err=bk.querySelector("#pxp-err"),go=bk.querySelector("#pxp-go");
  fit(cur,mk,false);fit(nw,null,true);fit(rep,null,true);
  if(opts.cur){cur.value=opts.cur;cur.closest("label").hidden=true;bk.querySelector(".pxp-mut").textContent="Pick 4 digits for your Pixora passcode. Your data stays as it is, and every Pixora app switches over.";}
  setTimeout(function(){try{(opts.cur?nw:cur).focus();}catch(e){}},60);
  T(sw?"pin_switch_shown":"pin_change_shown");
  bk.querySelector("#pxp-later").onclick=function(){bk.remove();T(sw?"pin_switch_later":"pin_change_cancel");if(opts.onLater)opts.onLater();};
  bk.querySelector("form").onsubmit=async function(e){
    e.preventDefault();err.textContent="";
    if(!isPin(nw.value)){err.textContent="The new passcode must be exactly 4 digits.";return;}
    if(nw.value!==rep.value){err.textContent="The two new passcodes don't match.";return;}
    go.disabled=true;go.textContent="Saving…";
    try{
      var fresh=mk;try{var s=await opts.fdb.doc("apps/pixora/users/"+opts.uid).get();if(s.exists&&s.data().mk&&s.data().mk.id)fresh=s.data().mk;}catch(x){}
      var m=await unwrap(cur.value,fresh),nmk=await wrap(nw.value,m,fresh.id);
      await opts.fdb.doc("apps/pixora/users/"+opts.uid).set({mk:nmk},{merge:true});
      await remember(m,fresh.id);m.fill(0);
      T(sw?"pin_switched":"pin_changed");bk.remove();if(opts.onDone)opts.onDone(nmk);
    }catch(x){
      go.disabled=false;go.textContent=sw?"Switch to 4 digits":"Change passcode";
      if(x&&x.code==="wrong"&&cur.closest("label").hidden){cur.value="";cur.closest("label").hidden=false;cur.focus();}
      err.textContent=x&&x.code==="wrong"?"That isn't your current Pixora passcode.":navigator.onLine===false?"No connection. Connect and try again.":"Couldn't save. Try again.";
    }
  };
  return bk;
}
/* Once per app opening: if the account still has an older passcode, ask to switch (with Not now). */
var asked={};
async function check(opts){
  if(!opts||!opts.fdb||!opts.uid||asked[opts.uid])return;
  try{var mk=opts.mk;if(!mk){var s=await opts.fdb.doc("apps/pixora/users/"+opts.uid).get();mk=s.exists?s.data().mk:null;}
    if(mk&&mk.id&&!isPin4(mk)&&!document.querySelector(".pxp-back")){asked[opts.uid]=1;prompt(Object.assign({},opts,{mk:mk,mode:"switch"}));}}catch(e){}
}
root.PixoraPin={isPin:isPin,isPin4:isPin4,unwrap:unwrap,wrap:wrap,newMaster:newMaster,appKey:appKey,appKeyFrom:appKeyFrom,
  remember:remember,recall:recall,forget:forget,fit:fit,prompt:prompt,check:check};
})(typeof self!=="undefined"?self:this);
