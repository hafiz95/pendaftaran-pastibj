"use strict";
var n=2,$=function(id){return document.getElementById(id);};
$("tambah").onclick=function(){n=Math.min(10,n+1);$("bil").textContent=n;};
$("kurang").onclick=function(){n=Math.max(0,n-1);$("bil").textContent=n;};
$("hantar").onclick=async function(){
var button=$("hantar");button.disabled=true;$("err").textContent="";
try{
var d={tetamu:n};["nama","cawangan","kategori","penjaga","tel","khas"].forEach(function(k){d[k]=$(k).value.trim();});
Pasti.validate(d);
await Pasti.api("/rest/v1/registrations",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(d)});
$("ringkas").textContent=d.nama+" ("+d.cawangan+"), "+d.tetamu+" tetamu. Terima kasih, ibu bapa akan dihubungi melalui "+d.tel+".";
$("ok").classList.remove("hide");$("borang").classList.add("hide");
}catch(e){$("err").textContent=e.message;}finally{button.disabled=false;}
};
