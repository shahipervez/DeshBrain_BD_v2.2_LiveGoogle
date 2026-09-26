import { getRoadReports, searchPrices, fareEstimate } from './store.js';

const places={
  uttara:[23.8759,90.3795], dhanmondi:[23.7465,90.3760], mohakhali:[23.7808,90.3997], farmgate:[23.7588,90.3897], bashundhara:[23.8197,90.4521], 'board bazar':[23.9444,90.3927], boardbazar:[23.9444,90.3927], mirpur:[23.8223,90.3654], 'mirpur 10':[23.8067,90.3686], banani:[23.7937,90.4066], gulshan:[23.7925,90.4078], 'karwan bazar':[23.7516,90.3930], mohammadpur:[23.7657,90.3589], airport:[23.8510,90.4086], 'airport road':[23.8510,90.4086], gazipur:[23.9999,90.4203], tongi:[23.8915,90.4023]
};
const bn=/[\u0980-\u09FF]/;
const lower=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
function hav(a,b){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(b[0]-a[0]),dLon=toRad(b[1]-a[1]);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function findPlaces(text){const t=lower(text);return Object.entries(places).filter(([k])=>t.includes(k)).sort((a,b)=>t.indexOf(a[0])-t.indexOf(b[0]));}
function fmtTime(min,bangla){const lo=Math.max(5,Math.round(min*.88/5)*5),hi=Math.max(lo+5,Math.round(min*1.15/5)*5);return bangla?`${lo}–${hi} মিনিট`:`${lo}–${hi} minutes`;}
function freshness(d){const m=Math.max(0,Math.round((Date.now()-new Date(d).getTime())/60000));return m<60?`${m}m ago`:`${Math.round(m/60)}h ago`;}
function productKey(t){
  if(/kacha\s*morich|green chili|কাঁচা মরিচ|morich/.test(t)) return 'green chili';
  if(/alu|potato|আলু/.test(t)) return 'potato';
  if(/peyaj|piyaj|onion|পেঁয়াজ/.test(t)) return 'onion';
  if(/dim|egg|ডিম/.test(t)) return 'egg';
  if(/rice|chal|চাল/.test(t)) return 'rice';
  if(/milk|dudh|দুধ/.test(t)) return 'milk';
  if(/soybean|soyabin|oil|তেল/.test(t)) return 'soybean';
  return t.replace(/\b(price|dam|koto|দাম|কত|er|ta|ki)\b/g,' ').trim().slice(0,80);
}
function webSourceList(rows=[],limit=4){
  return rows.slice(0,limit).map((x,i)=>`• ${x.priceBdt?`**৳${Math.round(x.priceBdt)}** — `:''}[${x.title}](${x.link})${x.displayLink?` — ${x.displayLink}`:''}`).join('\n');
}
function routeAnswer(route,bangla){
  if(!route) return '';
  return bangla
    ? `**Google Maps live traffic route**\n\n${route.origin} → ${route.destination}\n• Live ETA: **${route.durationMinutes} মিনিট**\n• Traffic-free/historical baseline: ${route.staticDurationMinutes} মিনিট\n• Current delay: প্রায় ${route.delayMinutes} মিনিট\n• Distance: ${route.distanceKm} km\n• Traffic: **${route.traffic}**\n\nSource: ${route.source}.`
    : `**Google Maps live traffic route**\n\n${route.origin} → ${route.destination}\n• Live ETA: **${route.durationMinutes} min**\n• Historical/static baseline: ${route.staticDurationMinutes} min\n• Current delay: about ${route.delayMinutes} min\n• Distance: ${route.distanceKm} km\n• Traffic: **${route.traffic}**\n\nSource: ${route.source}.`;
}

export async function localAnswer(message,{mode='balanced',webResults=[],routeInfo=null,webQuery=''}={}){
  const t=lower(message),bangla=bn.test(message)||/koto|jete|theke|vara|v[aâ]ra|kom|dam|akhon|ekhon|lagbe|pare|kacha|morich|peyaj|alu|dim/i.test(t);
  const reports=await getRoadReports();
  const named=findPlaces(t);
  const wantsFare=/cng|rickshaw|রিকশা|সিএনজি|ভাড়া|ভাড়া|fare|vara/.test(t);
  const wantsPrice=/price|dam|দাম|soybean|oil|rice|milk|তেল|চাল|দুধ|কম কোথায়|cheapest|kacha|morich|alu|peyaj|piyaj|dim|egg|potato|onion/.test(t);
  const wantsTraffic=/traffic|jam|জ্যাম|সময়|time|route|রাস্তা|road|বের|jete|যেতে|lagbe/.test(t);

  if(wantsTraffic && routeInfo){
    const base=routeAnswer(routeInfo,bangla);
    const high=routeInfo.traffic==='heavy'||routeInfo.delayMinutes>=15;
    return `${base}\n\n${bangla?(high?'সময় flexible হলে একটু পরে আবার check করা ভালো হতে পারে।':'এখনকার live traffic অনুযায়ী route unusually congested নয়।'):(high?'If your schedule is flexible, checking again shortly may help.':'The route is not unusually congested right now.')}`;
  }

  if(wantsPrice){
    const q=productKey(t);
    const livePriced=webResults.filter(x=>Number.isFinite(Number(x.priceBdt))).sort((a,b)=>Number(a.priceBdt)-Number(b.priceBdt));
    if(webResults.length){
      const list=webSourceList(livePriced.length?livePriced:webResults,mode==='deep'?6:4);
      if(livePriced.length){
        const best=livePriced[0];
        return bangla
          ? `**Live Google web results — ${q||'product'}**\n\n${list}\n\nSearch snippets/structured metadata-তে পাওয়া সর্বনিম্ন visible price: **৳${Math.round(best.priceBdt)}**।\n\nএটা Google-indexed web evidence; checkout বা shelf price বদলাতে পারে। কেনার আগে source page verify করো.`
          : `**Live Google web results — ${q||'product'}**\n\n${list}\n\nLowest visible price found in indexed snippets/structured metadata: **৳${Math.round(best.priceBdt)}**.\n\nThis is Google-indexed web evidence; checkout or shelf prices can change. Verify the source page before buying.`;
      }
      return bangla
        ? `**Google-এ fresh web results পেয়েছি**, কিন্তু snippets-এ নির্ভরযোগ্য structured price পাওয়া যায়নি।\n\n${list}\n\nSource page খুলে current price verify করো.`
        : `**Fresh Google web results are available**, but the snippets did not expose a reliable structured price.\n\n${list}\n\nOpen the source page to verify the current price.`;
    }

    const rows=await searchPrices(q);
    if(!rows.length) return bangla?'এই পণ্যের জন্য local/community observation নেই, এবং live Google Search configure করা নেই। `.env`-এ Google Search key + CX যোগ করো।':'No local/community observation exists for that product, and live Google Search is not configured. Add the Google Search key + CX in `.env`.';
    const sorted=[...rows].sort((a,b)=>Number(a.price_bdt)-Number(b.price_bdt)); const best=sorted[0];
    const list=sorted.slice(0,mode==='deep'?5:3).map(x=>`• ${x.shop_name} (${x.shop_area}): ৳${Number(x.price_bdt).toFixed(0)} — ${freshness(x.observed_at)}`).join('\n');
    return bangla?`**Asol Dam community data — ${best.name}**\n\n${list}\n\nসবচেয়ে কম reported price: **৳${Number(best.price_bdt).toFixed(0)} at ${best.shop_name}, ${best.shop_area}**।\n\nএগুলো community/demo observations—কেনার আগে দোকানের বর্তমান দাম verify করো।`:`**Asol Dam community data — ${best.name}**\n\n${list}\n\nLowest reported price: **৳${Number(best.price_bdt).toFixed(0)} at ${best.shop_name}, ${best.shop_area}**.\n\nThese are community/demo observations; verify the current shelf price before purchasing.`;
  }

  if(wantsFare && named.length>=2){
    const [a,b]=named; const modeName=/rickshaw|রিকশা/.test(t)?'rickshaw':'cng'; const f=await fareEstimate(a[0],b[0],modeName);
    return bangla?`${a[0]} থেকে ${b[0]} ${modeName==='cng'?'CNG':'রিকশা'}-র community-based fair range প্রায় **৳${f.low}–৳${f.high}**।\n\nSample signal: ${f.samples} • confidence: ${f.confidence}.\nTraffic, weather ও negotiation-এর কারণে actual fare বদলাতে পারে।`:`Community-based ${modeName.toUpperCase()} fair range from ${a[0]} to ${b[0]} is about **৳${f.low}–৳${f.high}**.\n\nSignal: ${f.samples} samples • ${f.confidence} confidence. Actual fare can vary with traffic, weather and negotiation.`;
  }

  if(wantsTraffic && named.length===1){
    const destination=named[0][0];
    return bangla?`তুমি **${destination}** যেতে চাচ্ছ—কিন্তু live route time বলতে তোমার **শুরুর জায়গা (origin)** দরকার।\n\nউদাহরণ: “Uttara থেকে ${destination} এখন বের হব?”`:`I can check live route timing for **${destination}**, but I need your **starting location (origin)** first.\n\nFor example: “Should I leave now from Uttara to ${destination}?”`;
  }

  if(wantsTraffic && named.length>=2){
    const [a,b]=named; const km=Math.max(2,hav(a[1],b[1])*1.25); const nearby=reports.filter(r=>named.some(([name])=>lower(r.area+' '+r.description).includes(name))||r.severity>=4);
    const pressure=Math.min(2.2,1+nearby.reduce((s,r)=>s+(Number(r.severity)||1),0)/35); const base=km/22*60; const eta=base*pressure+8;
    const top=nearby.slice(0,3).map(r=>`• ${r.area||r.kind}: ${r.description} (${freshness(r.created_at)})`).join('\n'); const wait=pressure>1.35;
    return bangla?`${a[0]} থেকে ${b[0]}-এর **community ETA প্রায় ${fmtTime(eta,true)}**।\n\n${top?`Relevant signals:\n${top}\n\n`:''}${wait?'সময় flexible হলে 20–30 মিনিট পরে আবার check করলে ভালো হতে পারে।':'Route pressure খুব বেশি দেখাচ্ছে না।'}\n\nGoogle Maps Routes API key দিলে এখানে live traffic ETA দেখাবে।`:`Community ETA from ${a[0]} to ${b[0]} is roughly **${fmtTime(eta,false)}**.\n\n${top?`Relevant signals:\n${top}\n\n`:''}${wait?'If your schedule is flexible, check again in 20–30 minutes.':'Current route pressure does not look unusually high.'}\n\nAdd a Google Maps Routes API key to get live-traffic ETA here.`;
  }

  if(/accident|flood|water|জল|দুর্ঘটনা|report|incident|জ্যাম/.test(t)){
    const top=reports.slice(0,mode==='deep'?6:4); const list=top.map(r=>`• **${r.area||r.kind}** — ${r.description} • severity ${r.severity}/5 • ${freshness(r.created_at)}`).join('\n');
    return bangla?`Road Brain-এ এখন ${reports.length}টি active community signal আছে।\n\n${list}\n\nCritical decision নেওয়ার আগে live map/official source দিয়ে verify করো।`:`Road Brain currently has ${reports.length} active community signals.\n\n${list}\n\nVerify critical decisions with a live map or official source.`;
  }

  if(webResults.length){
    const list=webResults.slice(0,mode==='deep'?6:4).map(x=>`• [${x.title}](${x.link})${x.snippet?` — ${x.snippet.slice(0,180)}`:''}`).join('\n');
    return bangla?`আমি Google-এর fresh indexed web results পেয়েছি${webQuery?` (“${webQuery}”)`:''}:\n\n${list}\n\nউপরের sources খুলে সবচেয়ে গুরুত্বপূর্ণ তথ্য verify করো।`:`I found fresh Google-indexed web results${webQuery?` for “${webQuery}”`:''}:\n\n${list}\n\nOpen the cited sources to verify the most important details.`;
  }

  return bangla?`আমি **Desh AI**—Bangladesh-focused traffic, fair-fare, essential-price আর live-web assistant।\n\nতুমি এভাবে জিজ্ঞেস করতে পারো:\n• “Uttara থেকে Board Bazar যেতে এখন কত সময়?”\n• “Farmgate থেকে Bashundhara CNG ভাড়া কত?”\n• “kacha morich er price koto?”\n• “Google-এ আজকের soybean oil price খুঁজে দাও”\n\nGoogle Search key configure করলে fresh web sources ব্যবহার করব।`:`I’m **Desh AI**, focused on Bangladesh traffic, fair fares, essential prices and live web evidence.\n\nTry:\n• “How long from Uttara to Board Bazar right now?”\n• “CNG fare from Farmgate to Bashundhara?”\n• “What is the current green chili price?”\n• “Search Google for today's soybean oil price in Bangladesh.”\n\nConfigure Google Search credentials to enable fresh web sources.`;
}
