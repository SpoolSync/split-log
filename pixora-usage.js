/* Pixora usage: anonymous feature counts so the apps can be improved, and nothing else.
   What is sent: "+N to feature X of app Y on day D", and short error reports. No account id, no names,
   no amounts, nothing a person typed. The database rules only accept adding to a counter, and only the
   Pixora admin account can read the totals. Counts are only sent while signed in to a Pixora account.
   Shared file: the same copy lives in every Pixora app. Change it in one, copy it to all. */
(function(root){
"use strict";
var app=null,ver="",getDb=null,pend={},timer=null,errs=[],sentErr={},FEAT=/^[a-z0-9_]{1,40}$/;
function z(n){return String(n).padStart(2,"0");}
function day(){var d=new Date();return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());}
function flag(k){try{if(localStorage.getItem(k))return false;localStorage.setItem(k,"1");return true;}catch(e){return false;}}
/* getDb(): returns the Firestore instance only while someone is signed in, else null. */
function init(appName,version,getDbFn){
  app=appName;ver=String(version||"").slice(0,20);getDb=getDbFn;
  track("open");
  if(flag("pxu:"+app+":"+day()))track("active_device");
  addEventListener("visibilitychange",function(){if(document.hidden)flush();});
  addEventListener("pagehide",flush);
  addEventListener("error",function(e){error(e&&e.message);});
  addEventListener("unhandledrejection",function(e){var r=e&&e.reason;error(r&&(r.code||r.message)||"unhandled rejection");});
}
/* Count one use of a feature. Feature names are fixed words chosen in the code, never user text. */
function track(feature,n){
  if(!app||!FEAT.test(feature))return;
  pend[feature]=(pend[feature]||0)+(n||1);
  if(!timer)timer=setTimeout(flush,15000);
}
/* Errors: keep only the shape of the message. Numbers, quoted text, emails and links are cut out. */
function scrub(m){
  return String(m||"").replace(/https?:\/\/\S+/g,"<url>").replace(/\S+@\S+/g,"<email>").replace(/(["'`]).*?\1/g,"<text>").replace(/\d+/g,"#").slice(0,160);
}
function error(msg){
  if(!app)return;var m=scrub(msg);if(!m||sentErr[m])return;sentErr[m]=1;
  errs.push(m);if(!timer)timer=setTimeout(flush,15000);
}
async function flush(){
  clearTimeout(timer);timer=null;
  var db=null;try{db=getDb&&getDb();}catch(e){}
  if(!db){return;}
  var batch=pend,list=errs;pend={};errs=[];
  var d=day(),inc=root.firebase&&firebase.firestore.FieldValue.increment;
  for(var f in batch){
    try{await db.doc("stats/"+app+"/f/"+d+"_"+f).set({n:inc(Math.min(batch[f],50)),d:d,f:f},{merge:true});}catch(e){}
  }
  var ua=navigator.userAgent,plat=/iPhone|iPad/.test(ua)?"iOS":/Android/.test(ua)?"Android":/Mac/.test(ua)?"Mac":/Windows/.test(ua)?"Windows":"Other";
  var standalone=(root.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone?"installed":"browser";
  for(var i=0;i<list.length&&i<5;i++){
    try{await db.collection("stats/"+app+"/errors").add({m:list[i],v:ver,p:plat+" "+standalone,d:day()});}catch(e){}
  }
}
root.PixoraUsage={init:init,track:track,error:error,flush:flush};
})(typeof self!=="undefined"?self:this);
