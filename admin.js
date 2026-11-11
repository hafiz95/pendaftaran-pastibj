"use strict";
var $=function(id){return document.getElementById(id);},token=null,records=[],filtered=[],editing=null,expiry;
function clearSession(){clearTimeout(expiry);token=null;records=[];filtered=[];editing=null;$("rows").textContent="";$("edit").hidden=true;$("dashboard").hidden=true;$("login").hidden=false;$("password").value="";}
function message(s){$("status").textContent=s;}
async function authorized(){if(!token||!await Pasti.api("/rest/v1/rpc/is_admin",{method:"POST",body:"{}"},token)){clearSession();throw Error("Akses admin diperlukan.");}}
async function refresh(){
await authorized();var next=[],offset=0,page;
do{page=await Pasti.api("/rest/v1/registrations?select=*&order=masa.desc,id.asc&limit=500&offset="+offset,{},token);next=next.concat(page);offset+=page.length;}while(page.length===500);
records=next;render();message("Data dikemas kini.");
}
function render(){
var term=$("search").value.trim().toLocaleLowerCase();filtered=records.filter(function(r){return ["nama","cawangan","kategori","penjaga","tel","khas"].some(function(k){return r[k].toLocaleLowerCase().indexOf(term)>=0;});});
$("students").textContent=records.length;var guests=records.reduce(function(a,r){return a+r.tetamu;},0);$("guests").textContent=guests;$("total").textContent=records.length+guests;$("count").textContent=filtered.length+" daripada "+records.length+" pendaftaran. CSV mengikut carian.";
$("rows").textContent="";
filtered.forEach(function(r){var tr=document.createElement("tr");["nama","cawangan","kategori","penjaga","tel","tetamu","khas"].forEach(function(k){var td=document.createElement("td");td.textContent=r[k];tr.appendChild(td);});var td=document.createElement("td"),b=document.createElement("button");b.textContent="Kemas kini";b.onclick=function(){openEdit(r);};td.appendChild(b);tr.appendChild(td);$("rows").appendChild(tr);});
}
function openEdit(r){editing=r;$("fields").textContent="";["nama","cawangan","kategori","penjaga","tel","tetamu","khas"].forEach(function(k){var l=document.createElement("label"),i=document.createElement(k==="kategori"?"select":"input");i.id="edit-"+k;l.htmlFor=i.id;l.textContent=k;if(k==="kategori")Pasti.categories.forEach(function(c){var o=document.createElement("option");o.value=c;o.textContent=c;i.appendChild(o);});if(k==="tetamu"){i.type="number";i.min=0;i.max=10;i.step=1;}else if(k!=="kategori"){i.maxLength=k==="khas"?500:k==="tel"?15:150;}i.value=r[k];$("fields").appendChild(l);$("fields").appendChild(i);});$("edit").hidden=false;$("edit-nama").focus();}
$("login").onsubmit=async function(e){e.preventDefault();var b=$("login").querySelector("button");b.disabled=true;try{
var session=await Pasti.api("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});token=session.access_token;$("password").value="";await authorized();
expiry=setTimeout(function(){clearSession();message("Sesi tamat. Sila log masuk semula.");},Math.max(0,session.expires_in*1000-5000));
$("dashboard").hidden=false;$("login").hidden=true;await refresh();
}catch(err){clearSession();message("Log masuk gagal atau akaun tiada akses admin.");}finally{b.disabled=false;}};
$("search").oninput=render;
$("reload").onclick=async function(){this.disabled=true;try{await refresh();}catch(e){clearSession();message(e.message);}finally{this.disabled=false;}};
$("logout").onclick=async function(){var old=token;clearSession();message("Anda telah log keluar.");try{await Pasti.api("/auth/v1/logout",{method:"POST"},old);}catch(e){}};
$("cancel").onclick=function(){$("edit").hidden=true;editing=null;};
$("edit").onsubmit=async function(e){e.preventDefault();var b=$("edit").querySelector("button");b.disabled=true;try{
await authorized();var d={};["nama","cawangan","kategori","penjaga","tel","tetamu","khas"].forEach(function(k){d[k]=$("edit-"+k).value.trim();});d.tetamu=Number(d.tetamu);Pasti.validate(d);
var updated=await Pasti.api("/rest/v1/registrations?id=eq."+encodeURIComponent(editing.id)+"&updated_at=eq."+encodeURIComponent(editing.updated_at),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(d)},token);
if(updated.length!==1)throw Error("Rekod telah berubah. Muat semula dan cuba lagi.");
$("edit").hidden=true;await refresh();
}catch(err){message(err.message);}finally{b.disabled=false;}};
$("export").onclick=async function(){try{await authorized();var blob=new Blob([Pasti.csv(filtered)],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="pendaftaran-anugerah-pasti.csv";a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}catch(e){clearSession();message(e.message);}};
