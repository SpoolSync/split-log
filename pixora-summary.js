/* Pixora summary: lets an app hand a few numbers to the Pixora Today dashboard, privately.
   The dashboard owns an encryption key pair. Its public half sits in the person's own account
   (apps/dashboard/users/<uid>); the private half never leaves the dashboard except wrapped by the
   dashboard passcode. An app encrypts its summary to that public key, so the database, the project
   owner and anyone else see only scrambled bytes. Only the person's own dashboard can open them.
   Nothing is sent when the person isn't signed in or hasn't set up the dashboard.
   Shared file: the same copy lives in every Pixora app. Change it in one, copy it to all. */
(function(root){
"use strict";
var VERSION=1,CHECK_MS=6*3600*1000,cache={},timers={};
function b64(u){var s="",i;for(i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function store(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
function read(k){try{return localStorage.getItem(k);}catch(e){return null;}}

/* The dashboard's public key, or null when this person has no dashboard yet. Checked at most every few hours. */
async function publicKey(fdb,uid,force){
  var c=cache[uid];
  if(c&&!force&&Date.now()-c.at<CHECK_MS)return c.key;
  var snap=await fdb.doc("apps/dashboard/users/"+uid).get(),d=snap.exists?snap.data():null,key=null;
  if(d&&d.pub&&typeof d.pub.x==="string"&&typeof d.pub.y==="string"&&typeof d.kid==="string"){
    var k=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:d.pub.x,y:d.pub.y,ext:true},{name:"ECDH",namedCurve:"P-256"},false,[]);
    key={k:k,kid:d.kid};
  }
  cache[uid]={at:Date.now(),key:key};
  return key;
}
async function encrypt(pub,obj){
  var eph=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
  var aes=await crypto.subtle.deriveKey({name:"ECDH",public:pub},eph.privateKey,{name:"AES-GCM",length:256},false,["encrypt"]);
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},aes,new TextEncoder().encode(JSON.stringify(obj))));
  var j=await crypto.subtle.exportKey("jwk",eph.publicKey);
  return {ex:j.x,ey:j.y,iv:b64(iv),ct:b64(ct)};
}
/* Send this app's summary. Skips quietly when nothing changed since the last send. */
async function publish(fdb,uid,app,data){
  if(!fdb||!uid||!/^[a-z]{2,20}$/.test(app)||!(root.crypto&&crypto.subtle))return false;
  var pk=await publicKey(fdb,uid);
  if(!pk)return false;
  var body=JSON.stringify(data),mark="pxsum:"+app+":"+uid,last=read(mark),sig=pk.kid+"|"+body;
  if(last===sig)return false;
  var box=await encrypt(pk.k,{v:VERSION,app:app,at:Date.now(),data:data});
  try{
    await fdb.doc("apps/dashboard/users/"+uid+"/inbox/"+app).set({v:VERSION,kid:pk.kid,ts:Date.now(),ex:box.ex,ey:box.ey,iv:box.iv,ct:box.ct});
  }catch(e){
    if(e&&e.code==="permission-denied")cache[uid]=null;
    throw e;
  }
  store(mark,sig);
  return true;
}
/* Call this whenever the app's data changes. It waits a moment, then builds and sends the summary. */
function schedule(app,getArgs,ms){
  clearTimeout(timers[app]);
  timers[app]=setTimeout(function(){
    var a;try{a=getArgs();}catch(e){a=null;}
    if(!a||!a.fdb||!a.uid)return;
    var data;try{data=a.build();}catch(e){return;}
    if(!data)return;
    publish(a.fdb,a.uid,app,data).catch(function(){});
  },ms==null?4000:ms);
}
/* Forget what was sent, so the next schedule sends a fresh copy (for example after signing in again). */
function reset(app,uid){store("pxsum:"+app+":"+uid,null);cache[uid]=null;}
root.PixoraSummary={publish:publish,schedule:schedule,reset:reset,version:VERSION};
})(typeof self!=="undefined"?self:this);
