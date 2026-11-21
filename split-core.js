/* Split Log: the money maths. No screen code in here, so it can be tested on its own.
   Every amount is a whole number of cents. Positive balance = that person is owed money. */
(function(root){
"use strict";

/* Share `total` cents by weight. Leftover cents go to the largest remainders, so the parts always add up exactly. */
function allocate(total,weights){
  var sum=weights.reduce(function(a,b){return a+b;},0),out=[],rem=[],used=0,i;
  if(!(sum>0))throw new Error("Nothing to split between.");
  for(i=0;i<weights.length;i++){
    var exact=total*weights[i]/sum,fl=Math.floor(exact+1e-9);
    out.push(fl);used+=fl;rem.push({i:i,r:exact-fl});
  }
  rem.sort(function(a,b){return b.r-a.r||a.i-b.i;});
  for(i=0;used<total;i++,used++)out[rem[i%rem.length].i]++;
  return out;
}

function sumVals(o){var t=0,k;for(k in o)t+=o[k];return t;}

/* What each person owes for one expense: {memberId: cents}. Throws a plain-English Error when the split doesn't add up. */
function sharesFor(e){
  var parts=e.parts||{},ids=Object.keys(parts).filter(function(k){return parts[k]>0;}),out={},res,i;
  if(!(e.cents>0))throw new Error("Enter an amount above zero.");
  if(e.mode==="items"){
    var items=e.items||[],sub={},subTotal=0;
    if(!items.length)throw new Error("Add at least one item.");
    items.forEach(function(it){
      if(!(it.cents>0))throw new Error("Every item needs a price.");
      if(!it.who||!it.who.length)throw new Error("Choose who shares \""+(it.name||"item")+"\".");
      var cut=allocate(it.cents,it.who.map(function(){return 1;}));
      it.who.forEach(function(m,j){sub[m]=(sub[m]||0)+cut[j];});
      subTotal+=it.cents;
    });
    if(subTotal>e.cents)throw new Error("The items add up to more than the total.");
    ids=Object.keys(sub);
    /* tax, tip and fees: spread in proportion to what each person ordered */
    var extra=allocate(e.cents-subTotal,ids.map(function(m){return sub[m];}));
    ids.forEach(function(m,j){out[m]=sub[m]+extra[j];});
    return out;
  }
  if(!ids.length)throw new Error("Choose at least one person to split with.");
  if(e.mode==="exact"){
    var t=0;ids.forEach(function(m){t+=parts[m];});
    if(t!==e.cents)throw new Error(t<e.cents?"The amounts are short of the total.":"The amounts are over the total.");
    ids.forEach(function(m){out[m]=parts[m];});
    return out;
  }
  if(e.mode==="percent"){
    var p=0;ids.forEach(function(m){p+=parts[m];});
    if(Math.abs(p-100)>0.005)throw new Error("The percentages add up to "+(Math.round(p*100)/100)+", not 100.");
  }
  /* equal, percent and shares are all "split by weight" */
  res=allocate(e.cents,ids.map(function(m){return e.mode==="equal"?1:parts[m];}));
  for(i=0;i<ids.length;i++)out[ids[i]]=res[i];
  return out;
}

function checkPayers(e){
  var t=sumVals(e.payers||{});
  if(t!==e.cents)throw new Error(t<e.cents?"The amounts paid are short of the total.":"The amounts paid are over the total.");
}

/* Net position of every member of a group. */
function balances(g){
  var b={};
  g.members.forEach(function(m){b[m.id]=0;});
  (g.expenses||[]).forEach(function(e){
    var s,k;
    try{s=sharesFor(e);}catch(err){return;}
    for(k in e.payers)b[k]=(b[k]||0)+e.payers[k];
    for(k in s)b[k]=(b[k]||0)-s[k];
  });
  (g.settlements||[]).forEach(function(s){
    b[s.from]=(b[s.from]||0)+s.cents;
    b[s.to]=(b[s.to]||0)-s.cents;
  });
  return b;
}

/* The fewest sensible payments that clear the group: biggest debtor pays biggest creditor, repeat. */
function simplify(bal){
  var debt=[],cred=[],out=[],k;
  for(k in bal){if(bal[k]<0)debt.push({id:k,c:-bal[k]});else if(bal[k]>0)cred.push({id:k,c:bal[k]});}
  function byC(a,b){return b.c-a.c||(a.id<b.id?-1:1);}
  while(debt.length&&cred.length){
    debt.sort(byC);cred.sort(byC);
    var d=debt[0],c=cred[0],pay=Math.min(d.c,c.c);
    out.push({from:d.id,to:c.id,cents:pay});
    d.c-=pay;c.c-=pay;
    if(!d.c)debt.shift();
    if(!c.c)cred.shift();
  }
  return out;
}

/* Monthly repeats. Same day next month, pulled back to the month's last day when needed. */
function nextMonth(dateIso,anchorDay){
  var p=dateIso.split("-").map(Number),y=p[0],m=p[1]+1;
  if(m>12){m=1;y++;}
  var last=new Date(y,m,0).getDate(),d=Math.min(anchorDay||p[2],last);
  return y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
}
/* Adds any repeat copies that have come due. Returns how many were added.
   A copy's id comes from its series and date, so two phones in a shared group make the very same copy. */
function repeatId(seriesId,dateIso){return (seriesId+"m"+dateIso.replace(/-/g,"")).slice(-24);}
function runRepeats(g,todayIso,stamp){
  var added=0,guard=0,have={};
  (g.expenses||[]).forEach(function(e){have[e.id]=1;});
  (g.expenses||[]).slice().forEach(function(head){
    if(head.repeat!=="monthly")return;
    var anchor=head.anchorDay||Number(head.date.split("-")[2]),series=head.seriesId||head.id;
    var next=nextMonth(head.date,anchor);
    while(next<=todayIso&&guard++<240){
      var id=repeatId(series,next),now=stamp?stamp():0;
      head.repeat=null;head.seriesId=series;if(stamp)head.ts=now;
      if(have[id]){head=g.expenses.filter(function(x){return x.id===id;})[0];if(head.repeat!=="monthly")return;next=nextMonth(head.date,anchor);continue;}
      var copy=JSON.parse(JSON.stringify(head));
      copy.id=id;copy.date=next;copy.anchorDay=anchor;copy.imageId=null;copy.createdAt=Date.now();copy.seriesId=series;copy.repeat="monthly";
      if(stamp)copy.ts=now;
      g.expenses.push(copy);have[id]=1;head=copy;added++;
      next=nextMonth(head.date,anchor);
    }
  });
  return added;
}

/* Which member this phone's person is. Kept per person, never shared with the group. */
function myId(g){
  if(g.me&&g.members.some(function(m){return m.id===g.me;}))return g.me;
  var m=g.members.filter(function(x){return x.me;})[0];return m?m.id:null;
}

/* The few numbers a dashboard would want: per currency, what you owe and what you're owed. */
function summary(groups){
  var out={};
  groups.forEach(function(g){
    var meId=myId(g);
    if(!meId)return;
    var c=balances(g)[meId]||0,cur=g.currency||"CAD";
    if(!out[cur])out[cur]={owe:0,owed:0};
    if(c<0)out[cur].owe+=-c;else out[cur].owed+=c;
  });
  return out;
}

/* Read-only snapshot of one group, small enough to travel inside a link. */
function snapshot(g,max){
  var bal=balances(g),name={};
  g.members.forEach(function(m){name[m.id]=m.name;});
  var acts=(g.expenses||[]).map(function(e){
    var p=Object.keys(e.payers||{});
    return [e.date,e.desc||"Expense",e.cents,p.length===1?name[p[0]]||"?":"Several people"];
  }).sort(function(a,b){return a[0]<b[0]?1:-1;}).slice(0,max||25);
  return {v:1,n:g.name,c:g.currency||"CAD",d:(function(n){return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0");})(new Date()),
    b:g.members.map(function(m){return [m.name,bal[m.id]||0];}),
    p:simplify(bal).map(function(x){return [name[x.from],name[x.to],x.cents];}),
    x:acts,t:(g.expenses||[]).length};
}
/* Anything arriving in a link is untrusted, so rebuild it field by field. */
function cleanSnapshot(o){
  function str(v,n){return String(v==null?"":v).slice(0,n);}
  function int(v){v=Math.round(Number(v));return isFinite(v)?v:0;}
  if(!o||o.v!==1||!Array.isArray(o.b))return null;
  return {v:1,n:str(o.n,80),c:/^[A-Z]{3}$/.test(o.c)?o.c:"CAD",d:str(o.d,10),
    b:o.b.slice(0,60).map(function(r){return [str(r&&r[0],60),int(r&&r[1])];}),
    p:(Array.isArray(o.p)?o.p:[]).slice(0,60).map(function(r){return [str(r&&r[0],60),str(r&&r[1],60),int(r&&r[2])];}),
    x:(Array.isArray(o.x)?o.x:[]).slice(0,40).map(function(r){return [str(r&&r[0],10),str(r&&r[1],80),int(r&&r[2]),str(r&&r[3],60)];}),
    t:int(o.t)};
}

var api={allocate:allocate,sharesFor:sharesFor,checkPayers:checkPayers,balances:balances,simplify:simplify,
  nextMonth:nextMonth,runRepeats:runRepeats,repeatId:repeatId,myId:myId,summary:summary,snapshot:snapshot,cleanSnapshot:cleanSnapshot};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SplitCore=api;
})(typeof self!=="undefined"?self:this);
