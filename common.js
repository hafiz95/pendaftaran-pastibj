(function(root){
"use strict";
var categories=["Pelajar cemerlang","Hafazan terbaik","Sahsiah terpuji","Hadir sahaja"];
function validate(d){
["nama","cawangan","penjaga"].forEach(function(k){if(typeof d[k]!=="string"||!d[k].trim()||d[k].length>150)throw Error("Lengkapkan nama dan cawangan (maksimum 150 aksara).");});
if(categories.indexOf(d.kategori)<0)throw Error("Pilih kategori yang sah.");
if(!/^[0-9+\-\s]{9,15}$/.test(d.tel))throw Error("No. telefon tidak sah.");
if(!Number.isInteger(d.tetamu)||d.tetamu<0||d.tetamu>10)throw Error("Bilangan tetamu mestilah 0 hingga 10.");
if(typeof d.khas!=="string"||d.khas.length>500)throw Error("Keperluan khas maksimum 500 aksara.");
return d;
}
function csv(rows){
function q(v){var s=String(v==null?"":v);if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
return "\uFEFF"+[["Pelajar","Cawangan","Kategori","Penjaga","Telefon","Tetamu","Keperluan khas"]].concat(rows.map(function(r){return [r.nama,r.cawangan,r.kategori,r.penjaga,r.tel,r.tetamu,r.khas];})).map(function(r){return r.map(q).join(",");}).join("\r\n");
}
function config(){
var c=root.PASTI_CONFIG||{};
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)||!c.key)throw Error("Sistem belum dikonfigurasi. Hubungi penganjur.");
if(c.key.indexOf("sb_secret_")===0)throw Error("Konfigurasi tidak selamat.");
if(c.key.split(".").length===3){try{if(JSON.parse(atob(c.key.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).role!=="anon")throw Error("key");}catch(e){throw Error("Gunakan publishable atau anon key sahaja.");}}
return c;
}
async function api(path,options,token){
var c=config(),o=options||{};o.headers=Object.assign({"apikey":c.key,"Content-Type":"application/json"},o.headers||{});
if(token)o.headers.Authorization="Bearer "+token;else if(c.key.split(".").length===3)o.headers.Authorization="Bearer "+c.key;
var r=await fetch(c.url+path,o);if(!r.ok)throw Error(r.status===401||r.status===403?"Sesi atau akses tidak sah. Log masuk semula.":"Permintaan gagal. Semak sambungan dan cuba lagi.");
if(r.status===204||r.headers.get("content-length")==="0")return null;
var t=await r.text();return t?JSON.parse(t):null;
}
root.Pasti={validate:validate,csv:csv,api:api,categories:categories};
if(typeof module!=="undefined")module.exports=root.Pasti;
})(typeof window!=="undefined"?window:global);
