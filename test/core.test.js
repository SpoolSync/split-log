/* Run with: node test/core.test.js */
var C=require("../split-core.js"),assert=require("assert"),n=0;
function t(name,fn){fn();n++;console.log("ok  "+name);}
function sum(o){return Object.values(o).reduce(function(a,b){return a+b;},0);}
var ids=0;function id(){return "id"+(++ids);}

t("equal split of $100 three ways keeps every cent",function(){
  var s=C.sharesFor({cents:10000,mode:"equal",parts:{a:1,b:1,c:1}});
  assert.deepStrictEqual(s,{a:3334,b:3333,c:3333});assert.strictEqual(sum(s),10000);
});
t("equal split leaves out unticked people",function(){
  assert.deepStrictEqual(C.sharesFor({cents:901,mode:"equal",parts:{a:1,c:1}}),{a:451,c:450});
});
t("exact amounts must add up",function(){
  assert.deepStrictEqual(C.sharesFor({cents:5000,mode:"exact",parts:{a:2000,b:3000}}),{a:2000,b:3000});
  assert.throws(function(){C.sharesFor({cents:5000,mode:"exact",parts:{a:2000,b:2500}});},/short/);
  assert.throws(function(){C.sharesFor({cents:5000,mode:"exact",parts:{a:2000,b:3500}});},/over/);
});
t("percent split",function(){
  assert.deepStrictEqual(C.sharesFor({cents:12000,mode:"percent",parts:{a:50,b:30,c:20}}),{a:6000,b:3600,c:2400});
  var s=C.sharesFor({cents:1000,mode:"percent",parts:{a:33.33,b:33.33,c:33.34}});assert.strictEqual(sum(s),1000);
  assert.throws(function(){C.sharesFor({cents:1000,mode:"percent",parts:{a:50,b:40}});},/not 100/);
});
t("shares: 2x pays twice 1x",function(){
  assert.deepStrictEqual(C.sharesFor({cents:9000,mode:"shares",parts:{a:2,b:1}}),{a:6000,b:3000});
  assert.strictEqual(sum(C.sharesFor({cents:1000,mode:"shares",parts:{a:1.5,b:1,c:1}})),1000);
});
t("itemized: tax and tip follow what each person ordered",function(){
  var e={cents:6900,mode:"items",items:[{name:"Pizza",cents:4000,who:["a","b"]},{name:"Wine",cents:2000,who:["a"]}]};
  var s=C.sharesFor(e);/* subtotals a=4000 b=2000, extra 900 split 2:1 */
  assert.deepStrictEqual(s,{a:4600,b:2300});
  assert.throws(function(){C.sharesFor({cents:1000,mode:"items",items:[{name:"x",cents:1200,who:["a"]}]});},/more than the total/);
  assert.throws(function(){C.sharesFor({cents:1000,mode:"items",items:[{name:"x",cents:500,who:[]}]});},/Choose who/);
});
t("payers must cover the total",function(){
  C.checkPayers({cents:1000,payers:{a:600,b:400}});
  assert.throws(function(){C.checkPayers({cents:1000,payers:{a:600}});},/short/);
});
function group(){
  return {members:[{id:"a",name:"Ann",me:true},{id:"b",name:"Bo"},{id:"c",name:"Cy"}],currency:"CAD",settlements:[],expenses:[
    {id:"e1",date:"2026-11-01",desc:"Cabin",cents:30000,mode:"equal",parts:{a:1,b:1,c:1},payers:{a:30000}},
    {id:"e2",date:"2026-11-02",desc:"Food",cents:9000,mode:"shares",parts:{a:1,b:2},payers:{b:9000}},
    {id:"e3",date:"2026-11-03",desc:"Gas",cents:6000,mode:"equal",parts:{b:1,c:1},payers:{c:4000,a:2000}}]};
}
t("balances always net to zero",function(){
  var b=C.balances(group());
  /* a: paid 32000, owes 10000+3000 = +19000; b: paid 9000, owes 10000+6000+3000 = -10000; c: paid 4000, owes 10000+3000 = -9000 */
  assert.deepStrictEqual(b,{a:19000,b:-10000,c:-9000});assert.strictEqual(sum(b),0);
});
t("simplify clears everyone in the fewest payments",function(){
  var g=group(),p=C.simplify(C.balances(g));
  assert.deepStrictEqual(p,[{from:"b",to:"a",cents:10000},{from:"c",to:"a",cents:9000}]);
  p.forEach(function(x){g.settlements.push({from:x.from,to:x.to,cents:x.cents});});
  assert.deepStrictEqual(C.balances(g),{a:0,b:0,c:0});
  assert.strictEqual(C.simplify(C.balances(g)).length,0);
});
t("simplify handles a chain (a owes b owes c)",function(){
  assert.deepStrictEqual(C.simplify({a:-500,b:0,c:500}),[{from:"a",to:"c",cents:500}]);
});
t("random groups: shares add up, balances net to zero, settling clears",function(){
  var seed=7;function r(k){seed=(seed*1103515245+12345)&0x7fffffff;return seed%k;}
  for(var round=0;round<400;round++){
    var m=["a","b","c","d","e"].slice(0,2+r(4)),g={members:m.map(function(x){return {id:x,name:x};}),expenses:[],settlements:[]};
    for(var i=0;i<1+r(12);i++){
      var cents=1+r(50000),mode=["equal","shares","percent"][r(3)],parts={};
      if(mode==="percent"){var left=100;m.forEach(function(x,j){var v=j===m.length-1?left:r(left+1);left-=v;if(v)parts[x]=v;});}
      else m.forEach(function(x){if(mode==="shares")parts[x]=1+r(4);else if(r(3))parts[x]=1;});
      if(!Object.keys(parts).length)parts[m[0]]=mode==="percent"?100:1;
      var e={cents:cents,mode:mode,parts:parts,payers:{}};e.payers[m[r(m.length)]]=cents;
      assert.strictEqual(sum(C.sharesFor(e)),cents);g.expenses.push(e);
    }
    var b=C.balances(g);assert.strictEqual(sum(b),0);
    var pays=C.simplify(b);assert.ok(pays.length<=m.length-1);
    pays.forEach(function(x){g.settlements.push(x);});
    assert.ok(Object.values(C.balances(g)).every(function(v){return v===0;}));
  }
});
t("monthly repeat: catches up, keeps the 31st sensible, only the newest keeps repeating",function(){
  assert.strictEqual(C.nextMonth("2026-01-31"),"2026-02-28");
  assert.strictEqual(C.nextMonth("2026-02-28",31),"2026-03-31");
  assert.strictEqual(C.nextMonth("2026-12-15"),"2027-01-15");
  var g={members:[],expenses:[{id:"r1",date:"2026-08-31",desc:"Rent",cents:100,mode:"equal",parts:{a:1},payers:{a:100},repeat:"monthly",imageId:"img123"}]};
  assert.strictEqual(C.runRepeats(g,"2026-11-17"),2);
  assert.deepStrictEqual(g.expenses.map(function(e){return e.date;}),["2026-08-31","2026-09-30","2026-10-31"]);
  assert.deepStrictEqual(g.expenses.map(function(e){return e.repeat;}),[null,null,"monthly"]);
  assert.strictEqual(g.expenses[2].imageId,null);
  assert.strictEqual(C.runRepeats(g,"2026-11-17"),0);
  assert.strictEqual(C.runRepeats(g,"2026-11-30"),1);
  assert.deepStrictEqual(g.expenses.map(function(e){return e.id;}),["r1","r1m20260930","r1m20261031","r1m20261130"]);
});
t("two phones make identical repeat copies",function(){
  function mk(){return {members:[],expenses:[{id:"rent01",date:"2026-09-01",desc:"Rent",cents:100,mode:"equal",parts:{a:1},payers:{a:100},repeat:"monthly"}]};}
  var a=mk(),b=mk();C.runRepeats(a,"2026-11-05");C.runRepeats(b,"2026-11-20");
  assert.deepStrictEqual(a.expenses.map(function(e){return e.id;}),b.expenses.map(function(e){return e.id;}));
  /* a phone that already received the copies from the other one adds nothing */
  var c=JSON.parse(JSON.stringify(a));c.expenses[0].repeat="monthly";c.expenses[2].repeat="monthly";
  assert.strictEqual(C.runRepeats(c,"2026-11-20"),0);
});
t("which member is me: per-person field wins, old flag still read",function(){
  assert.strictEqual(C.myId({me:"b",members:[{id:"a",me:true},{id:"b"}]}),"b");
  assert.strictEqual(C.myId({members:[{id:"a",me:true},{id:"b"}]}),"a");
  assert.strictEqual(C.myId({me:"zz",members:[{id:"a"}]}),null);
});
t("dashboard summary",function(){
  assert.deepStrictEqual(C.summary([group()]),{CAD:{owe:0,owed:19000}});
  var g2=group();g2.members[0].me=false;g2.members[1].me=true;g2.currency="USD";
  assert.deepStrictEqual(C.summary([group(),g2]),{CAD:{owe:0,owed:19000},USD:{owe:10000,owed:0}});
});
t("shared-link snapshot survives a round trip and rejects junk",function(){
  var g=group();g.name="Cabin";var s=C.cleanSnapshot(JSON.parse(JSON.stringify(C.snapshot(g,25))));
  assert.strictEqual(s.n,"Cabin");assert.deepStrictEqual(s.b,[["Ann",19000],["Bo",-10000],["Cy",-9000]]);
  assert.deepStrictEqual(s.p,[["Bo","Ann",10000],["Cy","Ann",9000]]);assert.strictEqual(s.x.length,3);
  assert.strictEqual(C.cleanSnapshot({v:2}),null);assert.strictEqual(C.cleanSnapshot(null),null);
  var odd=C.cleanSnapshot({v:1,n:{},c:"<b>",b:[null,["x","9e999"]],p:"no",x:[[1,2,"z"]]});
  assert.strictEqual(odd.c,"CAD");assert.deepStrictEqual(odd.b,[["",0],["x",0]]);assert.deepStrictEqual(odd.p,[]);
});
console.log("\n"+n+" tests passed");
