import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getRoadReports, addRoadReport, confirmRoadReport, searchPrices, fareEstimate, createUser, authenticateUser, getUserById, createConversation, listConversations, getConversation, addMessage, renameConversation, deleteConversation, pingStore } from './store.js';
import { createSessionToken, readSessionToken, parseCookies, cookieName, sessionMaxAge } from './auth.js';
import { localAnswer } from './localBrain.js';
import { googleSearch, googleSearchConfigured, shouldUseGoogleSearch, buildGoogleQuery } from './googleSearch.js';
import { getLiveRoute, googleRoutesConfigured, extractRouteEndpoints } from './googleRoutes.js';

const app=express();
const port=Number(process.env.PORT||3000);
const allowed=(process.env.ALLOWED_ORIGINS||'http://localhost:3000').split(',').map(x=>x.trim()).filter(Boolean);
if(process.env.RENDER_EXTERNAL_URL)allowed.push(process.env.RENDER_EXTERNAL_URL);
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({credentials:true,origin(origin,cb){if(!origin||allowed.includes(origin)||process.env.NODE_ENV!=='production')return cb(null,true);cb(new Error('Origin not allowed'));}}));
app.use(express.json({limit:'1mb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:240,standardHeaders:'draft-7',legacyHeaders:false}));
app.use(express.static('public',{maxAge:process.env.NODE_ENV==='production'?'1h':0}));

const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const sessionCookie=(res,token)=>res.cookie(cookieName,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:sessionMaxAge*1000,path:'/'});
const auth=asyncRoute(async(req,res,next)=>{const token=parseCookies(req.headers.cookie||'')[cookieName];const data=readSessionToken(token);if(!data)return res.status(401).json({error:'Please sign in'});const user=await getUserById(data.sub);if(!user)return res.status(401).json({error:'Session expired'});req.user=user;next();});

app.get('/healthz',asyncRoute(async(_req,res)=>res.json({
  ok:true,time:new Date().toISOString(),
  googleSearch:googleSearchConfigured(),googleRoutes:googleRoutesConfigured(),
  ...(await pingStore())
})));
app.get('/api/meta',(_req,res)=>res.json({
  name:'DeshBrain',version:'2.2.0',
  demo:String(process.env.DEMO_MODE??'true')==='true',
  aiProviderConfigured:Boolean(process.env.AI_API_KEY&&process.env.AI_MODEL),
  googleSearchConfigured:googleSearchConfigured(),
  googleRoutesConfigured:googleRoutesConfigured(),
  webMode:(process.env.GOOGLE_SEARCH_MODE||'auto').toLowerCase()
}));

const authSchema=z.object({email:z.string().email().max(160),password:z.string().min(8).max(128)});
app.post('/api/auth/register',rateLimit({windowMs:60_000,limit:12}),asyncRoute(async(req,res)=>{const b=authSchema.extend({name:z.string().trim().min(2).max(80)}).parse(req.body);const user=await createUser(b);sessionCookie(res,createSessionToken(user));res.status(201).json({user});}));
app.post('/api/auth/login',rateLimit({windowMs:60_000,limit:20}),asyncRoute(async(req,res)=>{const b=authSchema.parse(req.body);const user=await authenticateUser(b.email,b.password);if(!user)return res.status(401).json({error:'Invalid email or password'});sessionCookie(res,createSessionToken(user));res.json({user});}));
app.post('/api/auth/logout',(_req,res)=>{res.clearCookie(cookieName,{path:'/'});res.json({ok:true});});
app.get('/api/auth/me',asyncRoute(async(req,res)=>{const token=parseCookies(req.headers.cookie||'')[cookieName];const data=readSessionToken(token);if(!data)return res.json({user:null});res.json({user:await getUserById(data.sub)});}));

const reportSchema=z.object({kind:z.enum(['jam','accident','flood','roadblock','police','rickshaw','other']),severity:z.coerce.number().int().min(1).max(5),description:z.string().trim().min(3).max(300),area:z.string().trim().max(80).optional().default(''),lat:z.coerce.number().min(-90).max(90),lng:z.coerce.number().min(-180).max(180)});
app.get('/api/road/reports',asyncRoute(async(_req,res)=>res.json(await getRoadReports())));
app.post('/api/road/reports',asyncRoute(async(req,res)=>res.status(201).json(await addRoadReport(reportSchema.parse(req.body)))));
app.post('/api/road/reports/:id/confirm',asyncRoute(async(req,res)=>{const r=await confirmRoadReport(req.params.id);if(!r)return res.status(404).json({error:'Report not found'});res.json(r);}));
app.get('/api/fare',asyncRoute(async(req,res)=>{const q=z.object({origin:z.string().trim().min(2).max(80),destination:z.string().trim().min(2).max(80),mode:z.enum(['cng','rickshaw']).default('cng')}).parse(req.query);res.json(await fareEstimate(q.origin,q.destination,q.mode));}));
app.get('/api/prices',asyncRoute(async(req,res)=>{const q=z.string().trim().max(80).catch('soybean').parse(req.query.q);res.json(await searchPrices(q));}));

app.get('/api/web/search',rateLimit({windowMs:60_000,limit:30}),asyncRoute(async(req,res)=>{
  if(!googleSearchConfigured()) return res.status(503).json({error:'Google Search is not configured. Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX to .env.'});
  const q=z.string().trim().min(2).max(240).parse(req.query.q);
  const kind=z.enum(['general','price']).catch('general').parse(req.query.kind);
  const query=buildGoogleQuery(q,kind);
  const results=await googleSearch(query,{kind,num:kind==='price'?8:6});
  res.json({query,results,fetchedAt:new Date().toISOString(),source:'Google Programmable Search'});
}));

app.get('/api/route/live',rateLimit({windowMs:60_000,limit:40}),asyncRoute(async(req,res)=>{
  if(!googleRoutesConfigured()) return res.status(503).json({error:'Google Maps Routes is not configured. Add GOOGLE_MAPS_API_KEY to .env.'});
  const q=z.object({origin:z.string().trim().min(2).max(100),destination:z.string().trim().min(2).max(100)}).parse(req.query);
  const route=await getLiveRoute(q.origin,q.destination,{optimal:true});
  if(!route) return res.status(404).json({error:'No route returned by Google Maps Routes API'});
  res.json(route);
}));

app.get('/api/conversations',auth,asyncRoute(async(req,res)=>res.json(await listConversations(req.user.id))));
app.post('/api/conversations',auth,asyncRoute(async(req,res)=>{const title=z.string().trim().min(1).max(120).catch('New chat').parse(req.body?.title);res.status(201).json(await createConversation(req.user.id,title));}));
app.get('/api/conversations/:id',auth,asyncRoute(async(req,res)=>{const c=await getConversation(req.user.id,req.params.id);if(!c)return res.status(404).json({error:'Chat not found'});res.json(c);}));
app.patch('/api/conversations/:id',auth,asyncRoute(async(req,res)=>{const title=z.string().trim().min(1).max(120).parse(req.body?.title);const c=await renameConversation(req.user.id,req.params.id,title);if(!c)return res.status(404).json({error:'Chat not found'});res.json(c);}));
app.delete('/api/conversations/:id',auth,asyncRoute(async(req,res)=>{const ok=await deleteConversation(req.user.id,req.params.id);res.status(ok?204:404).end();}));

const chatSchema=z.object({conversationId:z.union([z.string(),z.number()]).nullable().optional(),messages:z.array(z.object({role:z.enum(['user','assistant','system']),content:z.string().trim().min(1).max(6000)})).min(1).max(60),mode:z.enum(['quick','balanced','deep']).default('balanced')});
function reqSafeClose(res,fn){res.on('close',fn);}
function streamText(res,text){res.status(200);res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');const chunks=text.match(/.{1,28}(?:\s|$)|.{1,28}/g)||[text];let i=0;const timer=setInterval(()=>{if(i>=chunks.length){clearInterval(timer);return res.end();}res.write(chunks[i++]);},18);reqSafeClose(res,()=>clearInterval(timer));}
function priceIntent(t=''){return /price|cost|dam|দাম|kacha|morich|alu|peyaj|piyaj|dim|egg|rice|milk|oil|soybean|cheapest|কম কোথায়|বাজার দর/.test(String(t).toLowerCase());}

app.post('/api/chat',rateLimit({windowMs:60_000,limit:45}),asyncRoute(async(req,res)=>{
  const body=chatSchema.parse(req.body);const last=body.messages.at(-1)?.content||'';
  let user=null,conversationId=body.conversationId??undefined;
  const token=parseCookies(req.headers.cookie||'')[cookieName];const data=readSessionToken(token);if(data)user=await getUserById(data.sub);
  if(user){if(!conversationId){const c=await createConversation(user.id,last.slice(0,60)||'New chat');conversationId=c.id;}await addMessage(user.id,conversationId,'user',last);res.setHeader('X-Conversation-Id',String(conversationId));}

  // 1) Fetch live Google Maps traffic when a route can be extracted.
  let routeInfo=null;
  const routePair=extractRouteEndpoints(last);
  if(routePair&&googleRoutesConfigured()){
    try{routeInfo=await getLiveRoute(routePair.origin,routePair.destination,{optimal:body.mode==='deep'});}catch(e){console.warn('Google Routes fallback:',e.message);}
  }

  // 2) Fetch fresh indexed web evidence when the query looks current, price-related, or web-seeking.
  let webResults=[],webQuery='';
  const pIntent=priceIntent(last);
  if(googleSearchConfigured() && (pIntent || (!routeInfo && shouldUseGoogleSearch(last)))){
    try{
      webQuery=buildGoogleQuery(last,pIntent?'price':'general');
      webResults=await googleSearch(webQuery,{kind:pIntent?'price':'general',num:body.mode==='deep'?8:5});
    }catch(e){console.warn('Google Search fallback:',e.message);}
  }
  res.setHeader('X-Web-Grounded',webResults.length?'google':'none');
  res.setHeader('X-Live-Route',routeInfo?'google':'none');

  let answer='';let providerUsed=false;
  if(process.env.AI_API_KEY&&process.env.AI_MODEL){
    try{
      const road=(await getRoadReports()).slice(0,40);const prices=(await searchPrices('')).slice(0,30);
      const liveEvidence={route:routeInfo,googleSearchQuery:webQuery,googleSearchResults:webResults.map(x=>({title:x.title,link:x.link,snippet:x.snippet,priceBdt:x.priceBdt,displayLink:x.displayLink}))};
      const context=`You are Desh AI, a Bangladesh-focused assistant. Answer in the user's language (Bangla, English, or Banglish). You may reason internally, but never reveal hidden chain-of-thought. Give concise conclusions and a short evidence summary when useful. Never fabricate live data. Distinguish community/demo data from Google-indexed web evidence and Google Maps live traffic. If Google web results are supplied, cite useful sources using Markdown links [Source title](URL). If a route object is supplied, treat its duration as live traffic-aware Google Maps Routes API data. Community road reports: ${JSON.stringify(road)}. Community price observations: ${JSON.stringify(prices)}. Live evidence: ${JSON.stringify(liveEvidence)}.`;
      const payload={model:process.env.AI_MODEL,stream:true,messages:[{role:'system',content:context},...body.messages]};
      if(body.mode==='deep')payload.reasoning_effort='high';else if(body.mode==='quick')payload.reasoning_effort='low';
      const upstream=await fetch(process.env.AI_API_URL||'https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45_000)});
      if(upstream.ok&&upstream.body){
        providerUsed=true;res.status(200);res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');
        const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;try{const j=JSON.parse(raw);const text=j.choices?.[0]?.delta?.content;if(text){answer+=text;res.write(text);}}catch{}}}
        if(user&&answer)await addMessage(user.id,conversationId,'assistant',answer);return res.end();
      }
    }catch(e){console.warn('AI provider fallback:',e.message);}
  }
  if(!providerUsed){answer=await localAnswer(last,{mode:body.mode,webResults,routeInfo,webQuery});if(user)await addMessage(user.id,conversationId,'assistant',answer);return streamText(res,answer);}
}));

app.use((err,_req,res,_next)=>{console.error(err);if(res.headersSent)return;if(err?.name==='ZodError')return res.status(400).json({error:'Validation failed',details:err.issues});res.status(err?.status||500).json({error:err?.message||'Internal server error'});});
app.listen(port,()=>console.log(`DeshBrain 2.2 running on http://localhost:${port}`));
