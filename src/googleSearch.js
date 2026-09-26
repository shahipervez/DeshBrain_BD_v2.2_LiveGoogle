const cache = new Map();
const CACHE_TTL_MS = Math.max(30_000, Number(process.env.GOOGLE_SEARCH_CACHE_MS || 300_000));

const productAliases = new Map([
  ['kacha morich','green chili'],['kachamorich','green chili'],['কাঁচা মরিচ','green chili'],
  ['morich','green chili'],['alu','potato'],['আলু','potato'],['peyaj','onion'],['piyaj','onion'],['পেঁয়াজ','onion'],
  ['dim','egg'],['ডিম','egg'],['chal','rice'],['চাল','rice'],['dal','lentil'],['ডাল','lentil'],
  ['soybean tel','soybean oil'],['soyabin tel','soybean oil'],['তেল','oil'],['dudh','milk'],['দুধ','milk']
]);

export function googleSearchConfigured(){
  return Boolean((process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY) && process.env.GOOGLE_SEARCH_CX);
}

function cleanText(v=''){ return String(v).replace(/\s+/g,' ').trim(); }
function normalizeAliases(text=''){
  let out = cleanText(text).toLowerCase();
  for(const [from,to] of productAliases){ out = out.replaceAll(from,to); }
  return out;
}

export function shouldUseGoogleSearch(message=''){
  const mode=(process.env.GOOGLE_SEARCH_MODE||'auto').toLowerCase();
  if(mode==='off') return false;
  if(mode==='always') return true;
  const t=normalizeAliases(message);
  return /\b(latest|current|today|now|live|realtime|real time|search|google|price|cost|cheapest|where can i buy|dam|koto|bazar|market|news|update)\b|দাম|কত|আজ|এখন|কোথায়|বাজার/.test(t);
}

export function buildGoogleQuery(message='', kind='general'){
  let q=normalizeAliases(message)
    .replace(/\b(koto|dam|dame|kothay|ase|ache|er|ta|ki|bolen|bolo)\b/g,' ')
    .replace(/[?!.]+/g,' ')
    .replace(/\s+/g,' ').trim();
  if(kind==='price' || /price|cost|cheapest|দাম|bazar|market/.test(normalizeAliases(message))){
    if(!/price|cost/.test(q)) q += ' price';
    q += ' Bangladesh';
  } else if(!/bangladesh|dhaka/.test(q)) {
    q += ' Bangladesh';
  }
  return q.slice(0,240);
}

function parseNumber(v){
  if(v===null || v===undefined) return null;
  const m=String(v).replace(/,/g,'').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function extractPrice(item={}){
  const pm=item.pagemap||{};
  const candidates=[];
  for(const offer of pm.offer||[]){ candidates.push(offer.price, offer.lowprice, offer.highprice); }
  for(const product of pm.product||[]){ candidates.push(product.price, product.lowprice, product.highprice); }
  for(const meta of pm.metatags||[]){
    candidates.push(meta['product:price:amount'],meta['og:price:amount'],meta['price'],meta['twitter:data1']);
  }
  for(const c of candidates){ const n=parseNumber(c); if(Number.isFinite(n) && n>0 && n<10000000) return n; }
  const snippet=`${item.title||''} ${item.snippet||''}`;
  const m=snippet.match(/(?:৳|BDT|Tk\.?|Taka)\s*([\d,]+(?:\.\d+)?)/i) || snippet.match(/([\d,]+(?:\.\d+)?)\s*(?:৳|BDT|Tk\.?|Taka)/i);
  return m ? parseNumber(m[1]) : null;
}
function safeLink(v=''){ try{ const u=new URL(v); return /^https?:$/.test(u.protocol)?u.href:''; }catch{return '';} }

export async function googleSearch(query,{num=6,kind='general'}={}){
  if(!googleSearchConfigured()) return [];
  const key=process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY;
  const cx=process.env.GOOGLE_SEARCH_CX;
  const q=cleanText(query).slice(0,300);
  const n=Math.min(10,Math.max(1,Number(num)||6));
  const cacheKey=`${kind}|${n}|${q.toLowerCase()}`;
  const cached=cache.get(cacheKey);
  if(cached && cached.expires>Date.now()) return cached.value;

  const url=new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key',key);
  url.searchParams.set('cx',cx);
  url.searchParams.set('q',q);
  url.searchParams.set('num',String(n));
  url.searchParams.set('gl','bd');
  url.searchParams.set('hl','en');
  url.searchParams.set('safe','active');

  const r=await fetch(url,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10_000)});
  if(!r.ok){
    let detail=''; try{ detail=(await r.json())?.error?.message||''; }catch{}
    throw Object.assign(new Error(`Google Search request failed (${r.status})${detail?`: ${detail}`:''}`),{status:502});
  }
  const data=await r.json();
  const value=(data.items||[]).map((item,index)=>({
    rank:index+1,
    title:cleanText(item.title||''),
    link:safeLink(item.link||''),
    displayLink:cleanText(item.displayLink||''),
    snippet:cleanText(item.snippet||''),
    priceBdt:extractPrice(item),
    image:safeLink(item.pagemap?.cse_image?.[0]?.src||item.pagemap?.cse_thumbnail?.[0]?.src||''),
    source:'Google Programmable Search',
    fetchedAt:new Date().toISOString()
  })).filter(x=>x.link);
  cache.set(cacheKey,{value,expires:Date.now()+CACHE_TTL_MS});
  return value;
}
