/* Pixora feedback: a small form any Pixora app can open. Goes to the admin's feedback list in the
   database (rules: /feedback). Anonymous unless the person chooses to share their email for a reply.
   Nothing from the app's data is attached. Usage: PixoraFeedback.open("meals","Meals") */
(function(root){
"use strict";
function el(tag,attrs,kids){var e=document.createElement(tag);for(var k in attrs||{}){if(k==="text")e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c)e.append(c);});return e;}
function css(){if(document.getElementById("pxfb-css"))return;var s=document.createElement("style");s.id="pxfb-css";
  s.textContent="#pxfb{border:0;border-radius:14px;padding:0;max-width:440px;width:calc(100% - 24px);background:var(--card,#fff);color:var(--ink,#111)}#pxfb::backdrop{background:rgba(0,0,0,.45)}"+
  "#pxfb form{display:flex;flex-direction:column;gap:12px;padding:20px}#pxfb h2{margin:0;font-size:20px}#pxfb p{margin:0;font-size:14px;color:var(--muted,#666)}"+
  "#pxfb .kinds{display:flex;gap:8px;flex-wrap:wrap}#pxfb .kinds label{display:flex;align-items:center;gap:6px;border:1px solid var(--line,#ccc);border-radius:999px;padding:6px 12px;font-size:14px;min-height:36px;cursor:pointer}"+
  "#pxfb textarea{min-height:130px;font:inherit;font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;resize:vertical}"+
  "#pxfb .row{display:flex;gap:8px;flex-wrap:wrap}#pxfb button{font:inherit;font-weight:600;border-radius:8px;padding:10px 16px;min-height:44px;border:1px solid var(--ink,#111);background:transparent;color:inherit;cursor:pointer}"+
  "#pxfb button.p{background:var(--ink,#111);color:var(--paper,#fff)}#pxfb .chk{display:flex;gap:8px;align-items:flex-start;font-size:14px}#pxfb .msg{font-size:14px;font-weight:600}";
  document.head.append(s);}
function today(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function open(app,name){
  css();var old=document.getElementById("pxfb");if(old)old.remove();
  var user=root.firebase&&firebase.apps&&firebase.apps.length&&firebase.auth().currentUser;
  var kinds=[["idea","An idea"],["bug","Something's broken"],["other","Something else"]];
  var ta=el("textarea",{id:"pxfb-m",maxlength:"1500","aria-label":"Your message",placeholder:"What would make "+(name||"Pixora")+" better, or what went wrong?"});
  var share=user&&user.email?el("label",{class:"chk"},[el("input",{type:"checkbox",id:"pxfb-e"}),el("span",{text:"Let Sachin reply to "+user.email})]):null;
  var msg=el("p",{class:"msg",role:"status"});
  var send=el("button",{type:"submit",class:"p",text:"Send"}),cancel=el("button",{type:"button",text:"Cancel"});
  var f=el("form",{novalidate:""},[el("h2",{text:"Send feedback"}),el("p",{text:"It goes straight to Sachin. Nothing from your data is attached"+(share?", and it's anonymous unless you tick the box.":".")}),
    el("div",{class:"kinds",role:"radiogroup","aria-label":"Kind"},kinds.map(function(k,i){var r=el("input",{type:"radio",name:"pxfb-k",value:k[0]});if(i===0)r.checked=true;return el("label",{},[r,el("span",{text:k[1]})]);})),
    ta,share,msg,el("div",{class:"row"},[send,cancel])]);
  var d=el("dialog",{id:"pxfb","aria-label":"Send feedback"},[f]);document.body.append(d);d.showModal();ta.focus();
  cancel.addEventListener("click",function(){d.close();d.remove();});
  d.addEventListener("cancel",function(){d.remove();});
  f.addEventListener("submit",async function(ev){
    ev.preventDefault();var m=ta.value.trim();if(!m){msg.textContent="Type a message first.";return;}
    var kind=(f.querySelector("input[name=pxfb-k]:checked")||{}).value||"other";
    if(!user){location.href="mailto:pixora3dstudios@gmail.com?subject="+encodeURIComponent((name||"Pixora")+" feedback")+"&body="+encodeURIComponent(m);return;}
    send.disabled=true;send.textContent="Sending…";
    var doc={app:app,kind:kind,m:m.slice(0,1500),d:today(),at:firebase.firestore.FieldValue.serverTimestamp()};
    if(share&&document.getElementById("pxfb-e").checked)doc.e=user.email;
    try{await firebase.firestore().collection("feedback").add(doc);
      f.innerHTML="";f.append(el("h2",{text:"Thanks!"}),el("p",{text:"Sachin will see it. "+(doc.e?"He can reply by email.":"")}),(function(){var b=el("button",{type:"button",class:"p",text:"Done"});b.addEventListener("click",function(){d.close();d.remove();});return b;})());
      if(root.PixoraUsage)try{PixoraUsage.track("feedback_"+kind);}catch(e){}
    }catch(e){send.disabled=false;send.textContent="Send";msg.textContent=navigator.onLine===false?"You're offline. Try again when you're connected.":"Couldn't send. Try again.";}
  });
}
root.PixoraFeedback={open:open};
})(typeof self!=="undefined"?self:this);
