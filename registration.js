"use strict";
var n=2,$=function(id){return document.getElementById(id);},turnstileWidget=null;
$("tambah").onclick=function(){n=Math.min(10,n+1);$("bil").textContent=n;};
$("kurang").onclick=function(){n=Math.max(0,n-1);$("bil").textContent=n;};
window.pastiTurnstileReady=function(){
 var key=(window.PASTI_CONFIG||{}).turnstileSiteKey;
 if(!key){$("err").textContent="Pendaftaran belum tersedia. Hubungi penganjur.";return;}
 turnstileWidget=turnstile.render("#security-widget",{sitekey:key,action:"pasti_registration",size:"compact",
  "expired-callback":function(){$("err").textContent="Pengesahan tamat. Sila sahkan semula.";},
  "error-callback":function(){$("err").textContent="Pengesahan keselamatan gagal dimuatkan. Sila cuba lagi.";return true;}});
};
$("hantar").onclick=async function(){
 var button=$("hantar");button.disabled=true;$("err").textContent="";
 try{
  var d={tetamu:n};["nama","cawangan","kategori","penjaga","tel","khas"].forEach(function(k){d[k]=$(k).value.trim();});
  Pasti.validate(d);
  if(turnstileWidget===null||!window.turnstile)throw Error("Lengkapkan pengesahan keselamatan dahulu.");
  d.turnstileToken=turnstile.getResponse(turnstileWidget);
  if(!d.turnstileToken)throw Error("Lengkapkan pengesahan keselamatan dahulu.");
  var response=await fetch("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
  if(!response.ok){
   if(response.status===429)throw Error("Terlalu banyak cubaan. Cuba lagi selepas 10 minit.");
   if(response.status===400)throw Error("Pengesahan keselamatan gagal atau tamat. Sila cuba lagi.");
   throw Error("Pendaftaran belum dapat diproses. Sila cuba lagi sebentar.");
  }
  $("ringkas").textContent=d.nama+" ("+d.cawangan+"), "+d.tetamu+" tetamu. Jika sudah berdaftar, rekod asal dikekalkan.";
  $("ok").classList.remove("hide");$("borang").classList.add("hide");
 }catch(e){$("err").textContent=e.message;}
 finally{if(turnstileWidget!==null&&window.turnstile)turnstile.reset(turnstileWidget);button.disabled=false;}
};
