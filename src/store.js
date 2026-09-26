import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from './auth.js';

const { Pool } = pg;
const demo = String(process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true';
export const pool = !demo && process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 20), idleTimeoutMillis: 30000 }) : null;
export const redis = !demo && process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true, enableOfflineQueue: false }) : null;

const now = Date.now();
const demoReports = [
  {id:1,kind:'jam',severity:4,description:'Heavy traffic near Mohakhali flyover',area:'Mohakhali',lat:23.7798,lng:90.3987,confirmations:31,created_at:new Date(now-9*60000).toISOString()},
  {id:2,kind:'flood',severity:3,description:'Waterlogging reported near Mirpur 10',area:'Mirpur 10',lat:23.8067,lng:90.3686,confirmations:14,created_at:new Date(now-18*60000).toISOString()},
  {id:3,kind:'accident',severity:4,description:'Slow lane after minor collision',area:'Airport Road',lat:23.8510,lng:90.4086,confirmations:22,created_at:new Date(now-5*60000).toISOString()},
  {id:4,kind:'jam',severity:3,description:'Slow moving traffic around Farmgate',area:'Farmgate',lat:23.7588,lng:90.3897,confirmations:18,created_at:new Date(now-13*60000).toISOString()}
];
const demoPrices = [
  {id:1,barcode:'8941100500011',name:'Soybean Oil 2L',brand:'Fresh',unit:'2 L',shop_name:'Local Market',shop_area:'Mohammadpur',price_bdt:360,observed_at:new Date(now-5*3600000).toISOString()},
  {id:2,barcode:'8941100500011',name:'Soybean Oil 2L',brand:'Fresh',unit:'2 L',shop_name:'Shwapno',shop_area:'Uttara',price_bdt:368,observed_at:new Date(now-24*3600000).toISOString()},
  {id:3,barcode:'8941100500011',name:'Soybean Oil 2L',brand:'Fresh',unit:'2 L',shop_name:'Agora',shop_area:'Dhanmondi',price_bdt:372,observed_at:new Date(now-48*3600000).toISOString()},
  {id:4,barcode:'8941100500012',name:'Miniket Rice 5kg',brand:'Local Select',unit:'5 kg',shop_name:'Local Market',shop_area:'Karwan Bazar',price_bdt:410,observed_at:new Date(now-4*3600000).toISOString()},
  {id:5,barcode:'8941100500012',name:'Miniket Rice 5kg',brand:'Local Select',unit:'5 kg',shop_name:'Shwapno',shop_area:'Dhanmondi',price_bdt:430,observed_at:new Date(now-30*3600000).toISOString()},
  {id:6,barcode:'8941100500013',name:'Pasteurized Milk 1L',brand:'Demo Dairy',unit:'1 L',shop_name:'Agora',shop_area:'Uttara',price_bdt:110,observed_at:new Date(now-3*3600000).toISOString()},
  {id:7,barcode:'8941100500013',name:'Pasteurized Milk 1L',brand:'Demo Dairy',unit:'1 L',shop_name:'Local Market',shop_area:'Mirpur',price_bdt:105,observed_at:new Date(now-6*3600000).toISOString()}
];
const demoUsers = new Map();
const demoConversations = new Map();
let userSeq = 1, convoSeq = 1, messageSeq = 1;

function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
function publicUser(u){ return u ? {id:u.id,name:u.name,email:u.email,created_at:u.created_at} : null; }

export async function pingStore(){
  if (!pool) return {mode:'demo',database:'memory'};
  await pool.query('SELECT 1');
  return {mode:'production',database:'postgres'};
}

export async function getRoadReports(){
  if (!pool) return demoReports;
  const { rows } = await pool.query(`SELECT id,kind,severity,description,COALESCE(area,'') area,lat,lng,confirmations,created_at FROM road_reports WHERE expires_at>NOW() ORDER BY created_at DESC LIMIT 500`);
  return rows;
}
export async function addRoadReport(r){
  if (!pool) { const x={id:Date.now(),...r,confirmations:0,created_at:new Date().toISOString()}; demoReports.unshift(x); return x; }
  const {rows}=await pool.query(`INSERT INTO road_reports(kind,severity,description,area,lat,lng) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,severity,description,area,lat,lng,confirmations,created_at`,[r.kind,r.severity,r.description,r.area||'',r.lat,r.lng]);
  return rows[0];
}
export async function confirmRoadReport(id){
  if (!pool){ const x=demoReports.find(r=>String(r.id)===String(id)); if(!x) return null; x.confirmations=(x.confirmations||0)+1; return x; }
  const {rows}=await pool.query(`UPDATE road_reports SET confirmations=confirmations+1 WHERE id=$1 AND expires_at>NOW() RETURNING id,kind,severity,description,area,lat,lng,confirmations,created_at`,[id]);
  return rows[0]||null;
}
export async function searchPrices(q='soybean'){
  const needle = String(q||'').trim().toLowerCase();
  if (!pool) return demoPrices.filter(x => !needle || (x.name+' '+x.brand+' '+x.shop_name+' '+x.shop_area+' '+x.barcode).toLowerCase().includes(needle));
  const {rows}=await pool.query(`SELECT po.id,p.barcode,p.name,p.brand,p.unit,po.shop_name,po.shop_area,po.price_bdt,po.observed_at FROM price_observations po JOIN products p ON p.id=po.product_id WHERE p.name ILIKE $1 OR p.brand ILIKE $1 OR p.barcode=$2 ORDER BY po.observed_at DESC LIMIT 100`,[`%${needle}%`,needle]);
  return rows;
}
export async function fareEstimate(origin,destination,mode='cng'){
  if (!pool) {
    const key=(origin+'|'+destination+'|'+mode).toLowerCase();
    const digest=crypto.createHash('sha256').update(key).digest();
    const variance=digest[0]%85;
    const base = mode==='rickshaw'?70:240;
    return {mode,origin,destination,low:base+variance,high:base+variance+(mode==='rickshaw'?45:90),samples:18+(digest[1]%35),confidence:'demo-community'};
  }
  const {rows}=await pool.query(`SELECT percentile_cont(.25) WITHIN GROUP (ORDER BY amount_bdt) low, percentile_cont(.75) WITHIN GROUP (ORDER BY amount_bdt) high, COUNT(*) samples FROM fare_reports WHERE mode=$1 AND lower(origin)=lower($2) AND lower(destination)=lower($3) AND created_at>NOW()-INTERVAL '30 days'`,[mode,origin,destination]);
  const r=rows[0];
  return {mode,origin,destination,low:Math.round(Number(r.low||0)),high:Math.round(Number(r.high||0)),samples:Number(r.samples||0),confidence:Number(r.samples||0)>=10?'community':'low-sample'};
}

export async function createUser({name,email,password}){
  email=normalizeEmail(email);
  if (!pool){
    if ([...demoUsers.values()].some(x=>x.email===email)) throw Object.assign(new Error('Email already registered'),{status:409});
    const {salt,hash}=hashPassword(password); const u={id:userSeq++,name,email,password_salt:salt,password_hash:hash,created_at:new Date().toISOString()}; demoUsers.set(String(u.id),u); return publicUser(u);
  }
  const {salt,hash}=hashPassword(password);
  try { const {rows}=await pool.query(`INSERT INTO users(name,email,password_salt,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,created_at`,[name,email,salt,hash]); return rows[0]; }
  catch(e){ if(e.code==='23505') throw Object.assign(new Error('Email already registered'),{status:409}); throw e; }
}
export async function authenticateUser(email,password){
  email=normalizeEmail(email);
  let u;
  if(!pool) u=[...demoUsers.values()].find(x=>x.email===email);
  else { const {rows}=await pool.query(`SELECT id,name,email,password_salt,password_hash,created_at FROM users WHERE lower(email)=lower($1) LIMIT 1`,[email]); u=rows[0]; }
  if(!u || !verifyPassword(password,u.password_salt,u.password_hash)) return null;
  return publicUser(u);
}
export async function getUserById(id){
  if(!pool) return publicUser(demoUsers.get(String(id)));
  const {rows}=await pool.query(`SELECT id,name,email,created_at FROM users WHERE id=$1`,[id]); return rows[0]||null;
}

export async function createConversation(userId,title='New chat'){
  if(!pool){ const c={id:String(convoSeq++),user_id:String(userId),title,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),messages:[]}; demoConversations.set(c.id,c); return {...c,messages:undefined}; }
  const {rows}=await pool.query(`INSERT INTO chat_conversations(user_id,title) VALUES($1,$2) RETURNING id,title,created_at,updated_at`,[userId,title]); return rows[0];
}
export async function listConversations(userId){
  if(!pool) return [...demoConversations.values()].filter(c=>c.user_id===String(userId)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(({messages,...c})=>c);
  const {rows}=await pool.query(`SELECT id,title,created_at,updated_at FROM chat_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100`,[userId]); return rows;
}
export async function getConversation(userId,id){
  if(!pool){ const c=demoConversations.get(String(id)); return c&&c.user_id===String(userId)?c:null; }
  const {rows}=await pool.query(`SELECT id,title,created_at,updated_at FROM chat_conversations WHERE id=$1 AND user_id=$2`,[id,userId]); if(!rows[0]) return null;
  const m=await pool.query(`SELECT id,role,content,created_at FROM chat_messages WHERE conversation_id=$1 ORDER BY id`,[id]); return {...rows[0],messages:m.rows};
}
export async function addMessage(userId,conversationId,role,content){
  if(!pool){ const c=demoConversations.get(String(conversationId)); if(!c||c.user_id!==String(userId)) return null; const m={id:String(messageSeq++),role,content,created_at:new Date().toISOString()}; c.messages.push(m); c.updated_at=new Date().toISOString(); return m; }
  const owns=await pool.query(`SELECT 1 FROM chat_conversations WHERE id=$1 AND user_id=$2`,[conversationId,userId]); if(!owns.rowCount) return null;
  const {rows}=await pool.query(`INSERT INTO chat_messages(conversation_id,role,content) VALUES($1,$2,$3) RETURNING id,role,content,created_at`,[conversationId,role,content]); await pool.query(`UPDATE chat_conversations SET updated_at=NOW() WHERE id=$1`,[conversationId]); return rows[0];
}
export async function renameConversation(userId,id,title){
  if(!pool){ const c=demoConversations.get(String(id)); if(!c||c.user_id!==String(userId)) return null; c.title=title; c.updated_at=new Date().toISOString(); return c; }
  const {rows}=await pool.query(`UPDATE chat_conversations SET title=$1,updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING id,title,created_at,updated_at`,[title,id,userId]); return rows[0]||null;
}
export async function deleteConversation(userId,id){
  if(!pool){ const c=demoConversations.get(String(id)); if(!c||c.user_id!==String(userId)) return false; demoConversations.delete(String(id)); return true; }
  const r=await pool.query(`DELETE FROM chat_conversations WHERE id=$1 AND user_id=$2`,[id,userId]); return r.rowCount>0;
}
