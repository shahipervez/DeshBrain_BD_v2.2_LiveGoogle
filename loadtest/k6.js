import http from 'k6/http';
import { check, sleep } from 'k6';
export const options={stages:[{duration:'30s',target:100},{duration:'1m',target:500},{duration:'1m',target:1000},{duration:'30s',target:0}],thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1200']}};
export default function(){const base=__ENV.BASE_URL||'http://localhost:3000';const r=http.get(`${base}/api/road/reports`);check(r,{'status 200':x=>x.status===200});if(__ITER%5===0)http.get(`${base}/api/prices?q=soybean`);sleep(1);}
