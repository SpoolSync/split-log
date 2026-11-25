/* Pixora country: Canada, the US or India. It decides money format, the home currency and the
   country-specific parts of each app (account types, tax deadlines, renewals, first steps).
   One choice for the whole Pixora site, kept on this phone and inside each app's encrypted data
   (so it follows the person to a new phone). Never sent anywhere in readable form. */
(function(root){
"use strict";
var LIST=[["CA","Canada"],["US","United States"],["IN","India"]];
var INFO={
  CA:{name:"Canada",cur:"CAD",loc:"en-CA",sym:"$",flag:"🇨🇦"},
  US:{name:"United States",cur:"USD",loc:"en-US",sym:"$",flag:"🇺🇸"},
  IN:{name:"India",cur:"INR",loc:"en-IN",sym:"₹",flag:"🇮🇳"}
};
var KEY="pixora-country";
function ok(c){return !!INFO[c];}
/* A first guess from the phone's time zone and language; the person can change it in Settings. */
function guess(){
  var tz="",lang="";
  try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";}catch(e){}
  try{lang=(navigator.languages&&navigator.languages[0])||navigator.language||"";}catch(e){}
  if(/^Asia\/(Kolkata|Calcutta)$/.test(tz)||/-IN$/i.test(lang))return "IN";
  if(/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit|Glace_Bay|Goose_Bay|Swift_Current|Dawson_Creek|Fort_Nelson|Creston|Rankin_Inlet|Resolute|Cambridge_Bay|Inuvik|Atikokan|Blanc-Sablon|Thunder_Bay|Nipigon|Rainy_River|Dawson)$/.test(tz)||/-CA$/i.test(lang))return "CA";
  if(/^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Juneau|Sitka|Nome|Menominee|Adak|Yakutat|Metlakatla)|Pacific\/Honolulu)/.test(tz)||/-US$/i.test(lang))return "US";
  return "CA";
}
function read(){try{var o=JSON.parse(localStorage.getItem(KEY)||"null");if(o&&ok(o.c))return o;}catch(e){}return null;}
function get(){var o=read();return o?o.c:guess();}
function chosen(){return !!read();}
function stamp(){var o=read();return o?o.at||0:0;}
/* Called by the apps when the person picks a country, or when an app's synced data carries a newer choice. */
function set(c,at,quiet){
  if(!ok(c))return;at=at||Date.now();var o=read();
  if(o&&o.c===c&&(o.at||0)>=at)return;
  try{localStorage.setItem(KEY,JSON.stringify({c:c,at:at}));}catch(e){}
  if(!quiet){try{root.dispatchEvent(new CustomEvent("pixora-country",{detail:{c:c,at:at}}));}catch(e){}}
}
function info(c){return INFO[c||get()];}
/* Money in the person's own format: $1,234.56 in Canada and the US, ₹1,23,456 in India. */
var fmts={};
function money(v,o){
  o=o||{};var c=o.country||get(),cur=o.cur||INFO[c].cur,dec=o.dec!=null?o.dec:(cur==="INR"||cur==="JPY"?0:2),k=c+cur+dec;
  if(!fmts[k])fmts[k]=new Intl.NumberFormat(INFO[c].loc,{style:"currency",currency:cur,minimumFractionDigits:dec,maximumFractionDigits:dec});
  var s=fmts[k].format(+v||0);
  /* Show plain "$" for the home dollar; "US$" or "CA$" only when it isn't the home currency. */
  if(cur===INFO[c].cur)s=s.replace(/^(-?)(CA|US|A)\$/,"$1$");
  return s;
}
function locale(c){return INFO[c||get()].loc;}
function date(iso,opts,c){var p=String(iso).split("-");return new Date(+p[0],+p[1]-1,+(p[2]||1)).toLocaleDateString(locale(c),opts||{month:"short",day:"numeric"});}
/* A small Settings card. Pickers anywhere on the page are wired by the listener below. */
function picker(note){
  var c=get();
  return '<section class="card"><h2>Country</h2><p class="small muted">'+(note||"Sets money format and the country-specific parts of every Pixora app.")+'</p>'+
    '<select data-px-country aria-label="Country" style="max-width:280px">'+LIST.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===c?" selected":"")+'>'+INFO[x[0]].flag+' '+x[1]+'</option>';}).join("")+'</select></section>';
}
if(root.document)document.addEventListener("change",function(e){var t=e.target;if(t&&t.hasAttribute&&t.hasAttribute("data-px-country"))set(t.value);});
root.PixoraCountry={LIST:LIST,INFO:INFO,get:get,set:set,guess:guess,chosen:chosen,stamp:stamp,info:info,money:money,locale:locale,date:date,picker:picker,ok:ok};
})(typeof self!=="undefined"?self:this);
