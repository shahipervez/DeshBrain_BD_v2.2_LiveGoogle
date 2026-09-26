export function googleRoutesConfigured(){
  return Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY);
}

const routeStops=/\s+(?:now|today|ekhon|akhon|এখন|jete|jaite|যেতে|jabo|যাব|go|time|সময়|koto|কত|lagbe|লাগবে|fare|vara|ভাড়া|ভাড়া|traffic|jam|জ্যাম|should|would)\b.*$/i;
export function extractRouteEndpoints(message=''){
  const raw=String(message).replace(/\s+/g,' ').trim();
  let m=raw.match(/\bfrom\s+(.{2,70}?)\s+to\s+(.{2,100})$/i);
  if(!m) m=raw.match(/^(.{2,70}?)\s+(?:theke|থেকে)\s+(.{2,100})$/i);
  if(!m) return null;
  const clean=s=>String(s).replace(routeStops,'').replace(/[?.!,]+$/,'').trim();
  const origin=clean(m[1]),destination=clean(m[2]);
  return origin&&destination?{origin,destination}:null;
}

function qualify(place=''){
  const p=String(place).trim();
  if(/bangladesh|dhaka/i.test(p)) return p;
  return `${p}, Dhaka, Bangladesh`;
}
function seconds(v='0s'){ const n=Number(String(v).replace('s','')); return Number.isFinite(n)?n:0; }

export async function getLiveRoute(origin,destination,{optimal=true}={}){
  if(!googleRoutesConfigured()) return null;
  const key=process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  const body={
    origin:{address:qualify(origin)},
    destination:{address:qualify(destination)},
    travelMode:'DRIVE',
    routingPreference:optimal?'TRAFFIC_AWARE_OPTIMAL':'TRAFFIC_AWARE',
    computeAlternativeRoutes:false,
    languageCode:'en-US',
    regionCode:'BD',
    units:'METRIC'
  };
  const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description'
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(12_000)
  });
  if(!r.ok){
    let detail=''; try{detail=(await r.json())?.error?.message||'';}catch{}
    throw Object.assign(new Error(`Google Routes request failed (${r.status})${detail?`: ${detail}`:''}`),{status:502});
  }
  const data=await r.json();
  const route=data.routes?.[0];
  if(!route) return null;
  const liveSec=seconds(route.duration), staticSec=seconds(route.staticDuration||route.duration);
  const delaySec=Math.max(0,liveSec-staticSec);
  const ratio=staticSec?liveSec/staticSec:1;
  const traffic=ratio>=1.45?'heavy':ratio>=1.18?'moderate':'normal';
  return {
    source:'Google Maps Routes API',origin,destination,
    durationSeconds:liveSec,staticDurationSeconds:staticSec,
    durationMinutes:Math.max(1,Math.round(liveSec/60)),
    staticDurationMinutes:Math.max(1,Math.round(staticSec/60)),
    delayMinutes:Math.round(delaySec/60),
    distanceKm:Number(((route.distanceMeters||0)/1000).toFixed(1)),
    traffic,description:route.description||'',fetchedAt:new Date().toISOString()
  };
}
