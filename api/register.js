"use strict";
const { createHmac } = require("node:crypto");
const { isIP } = require("node:net");
const { validate } = require("../common.js");
const MAX_BYTES = 8192;

function createHandler(env = process.env, request = fetch) {
 return async function handler(req,res) {
  function reply(status,message) {
   res.setHeader("Cache-Control","no-store");
   res.setHeader("X-Content-Type-Options","nosniff");
   return res.status(status).json({message});
  }
  if(req.method !== "POST") { res.setHeader("Allow","POST"); return reply(405,"Kaedah tidak dibenarkan."); }
  const origins=(env.REGISTRATION_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  let origin=req.headers.origin;
  if(typeof origin!=="string"||!origins.includes(origin))return reply(403,"Permintaan tidak dibenarkan.");
  const ctype=req.headers["content-type"]||"";
  if(!/^application\/json(?:;|$)/i.test(ctype))return reply(415,"Format permintaan tidak sah.");
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL||"")||
   !env.SUPABASE_SERVER_KEY||!env.TURNSTILE_SECRET_KEY||(env.RATE_LIMIT_SECRET||"").length<32||
   !origins.length||origins.some(o=>{try{const u=new URL(o);return u.origin!==o||(env.VERCEL==="1"&&u.protocol!=="https:");}catch{return true;}}))return reply(503,"Pendaftaran belum tersedia. Hubungi penganjur.");
  // Production/Preview ONLY trust Vercel's overwritten X-Forwarded-For.
  // Never trust a client supplied remoteip or forwarded header on a local server.
  const ip=env.VERCEL==="1" ? req.headers["x-forwarded-for"] : req.socket?.remoteAddress;
  if(typeof ip!=="string"||!isIP(ip.trim()))return reply(503,"Pendaftaran belum tersedia.");
  let body;
  try {
   if(Number(req.headers["content-length"])>MAX_BYTES)return reply(413,"Permintaan terlalu besar.");
   body=typeof req.body==="string"?JSON.parse(req.body):req.body;
   if(Buffer.byteLength(JSON.stringify(body)||"")>MAX_BYTES)return reply(413,"Permintaan terlalu besar.");
   if(!body||typeof body!=="object"||Array.isArray(body))throw Error();
  }catch { return reply(400,"Data pendaftaran tidak sah."); }
  let data;
  try {
   data={}; for(const k of ["nama","cawangan","kategori","penjaga","tel","khas"]) {
    if(typeof body[k]!=="string")throw Error();
    data[k]=body[k].trim();
   }
   data.tetamu=body.tetamu; validate(data);
   if(typeof body.turnstileToken!=="string"||body.turnstileToken.length<1||body.turnstileToken.length>2048)throw Error();
  }catch { return reply(400,"Lengkapkan borang dan pengesahan keselamatan."); }
  async function rpc(name,payload) {
   const key=env.SUPABASE_SERVER_KEY;
   const headers={apikey:key,"Content-Type":"application/json"};
   if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
   const r=await request(env.SUPABASE_URL+"/rest/v1/rpc/"+name,{
    method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error("Database unavailable");return r.json();
  }
  try {
   const hash=createHmac("sha256",env.RATE_LIMIT_SECRET).update(ip.trim()).digest("hex");
   if(await rpc("consume_registration_rate",{p_key:hash})!==true) {
    res.setHeader("Retry-After","600");return reply(429,"Terlalu banyak cubaan. Cuba lagi selepas 10 minit.");
   }
   const verify=await request("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.turnstileToken,remoteip:ip.trim()}),
    signal:AbortSignal.timeout(8000)});
   if(!verify.ok)throw Error("Verification unavailable");
   const verdict=await verify.json();
   const timestamp=Date.parse(verdict.challenge_ts);
   if(verdict.success!==true||verdict.action!=="pasti_registration"||
    verdict.hostname!==new URL(origin).hostname||!Number.isFinite(timestamp)||
    Date.now()-timestamp>300000||timestamp>Date.now()+30000)
    return reply(400,"Pengesahan keselamatan gagal atau tamat. Sila cuba lagi.");
   // Cloudflare validates the token once; never retry Siteverify with a spent token.
   // Unique index makes simultaneous duplicate submissions atomic.
   const saved=await rpc("submit_registration",{p_data:data});
   if(typeof saved!=="boolean")throw Error("Invalid server response");
   return reply(202,"Permintaan diterima. Jika sudah berdaftar, rekod asal dikekalkan.");
  }catch { return reply(503,"Pendaftaran belum dapat diproses. Sila cuba lagi sebentar."); }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.config={api:{bodyParser:{sizeLimit:"8kb"}}};
