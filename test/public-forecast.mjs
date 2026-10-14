import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const met = require('../api/_lib/weather-providers/met-no');
const handlers = require('../api/_lib/handlers');
const geo = require('../api/_lib/geonames');
const { resolvePlan, planActivity } = await import('../js/planning.js');

const raw = { geometry: {coordinates:[-75.6972,45.4215,80]}, properties:{meta:{updated_at:'2026-10-13T12:00:00Z'},timeseries:[
  {time:'2026-10-13T13:00:00Z',data:{instant:{details:{air_temperature:8,apparent_air_temperature:6,wind_speed:2,cloud_area_fraction:40,relative_humidity:60}},next_1_hours:{summary:{symbol_code:'lightrain'},details:{precipitation_amount:0.3}}}},
  {time:'2026-10-13T14:00:00Z',data:{instant:{details:{air_temperature:9,wind_speed:3}},next_1_hours:{summary:{symbol_code:'cloudy'},details:{precipitation_amount:0}}}},
  {time:'2026-10-14T00:00:00Z',data:{instant:{details:{air_temperature:5,wind_speed:4}},next_6_hours:{summary:{symbol_code:'rain'},details:{precipitation_amount:3,probability_of_precipitation:80}}}},
]}};
const n=met.normalize(raw,{lat:45.4215,lon:-75.6972,now:Date.parse('2026-10-13T13:00Z')});
assert.equal(n.weatherProvider,'met-no'); assert.equal(n.location.timezone,'America/Toronto');
assert.equal(n.current.time,'2026-10-13T09:00'); assert.equal(n.current.wind_speed_10m,7.2);
assert.equal(n.currentIsForecast,true); assert.equal(n.hourly.precipitation[2],0.5);
assert.deepEqual(n.hourly.precipitation_probability,[null,null,null]);
assert.deepEqual(n.daily.precipitation_probability_max,[null]);
assert(n.daily.sunrise[0].startsWith('2026-10-13T')); assert(n.forecastNote.includes('six-hourly'));
assert.equal(met._internals.offset(new Date('2026-11-01T06:00Z'),'America/Toronto'),-18000);
assert.equal(met._internals.solarDay('2026-06-21',78.2,15.6,'Arctic/Longyearbyen').daylight,86400);
assert.equal(met._internals.solarDay('2026-12-21',78.2,15.6,'Arctic/Longyearbyen').daylight,0);

const originalFetch=globalThis.fetch, originalPrivate=handlers.planningForecast;
let calls=0, requests=[];
globalThis.fetch=async(url,options)=>{ calls++; requests.push({url:String(url),headers:options.headers}); assert.equal(new URL(url).host,'api.met.no');
  return new Response(calls===2?null:JSON.stringify(raw),{status:calls===2?304:200,headers:{Expires:new Date(Date.now()+1800000).toUTCString(),'Last-Modified':'Tue, 13 Oct 2026 12:00:00 GMT'}}); };
try {
  met._internals.records.clear();
  await Promise.all(Array.from({length:6},()=>met.fetchForecast({lat:45.4215,lon:-75.6972})));
  assert.equal(calls,1,'Concurrent requests must coalesce');
  await met.fetchForecast({lat:45.4215,lon:-75.6972}); assert.equal(calls,1,'Respect source Expires');
  met._internals.records.get('45.4215,-75.6972').expires=Date.now()-1;
  await met.fetchForecast({lat:45.4215,lon:-75.6972}); assert.equal(calls,2);
  assert.equal(requests[1].headers['If-Modified-Since'],'Tue, 13 Oct 2026 12:00:00 GMT');
  assert(requests[0].headers['User-Agent'].includes('weatherview.cloud'));
  const privateData={...n,weatherProvider:'visual-crossing',secretProviderPayload:'DO_NOT_RETURN_PROVIDER_ROWS'};
  handlers.planningForecast=async()=>({status:200,body:privateData});
  process.env.WEATHER_PROVIDER='visual-crossing';
  const response=await handlers.forecast({lat:'45.4215',lon:'-75.6972'});
  assert.equal(response.body.weatherProvider,'met-no');
  assert.equal(response.body.activityPlan.weatherProvider,'visual-crossing');
  assert(!JSON.stringify(response.body).includes('DO_NOT_RETURN_PROVIDER_ROWS'));
  assert(!('hourly' in response.body.activityPlan)); assert(!('daily' in response.body.activityPlan));
  const before=calls; const search=await handlers.geocode({q:'Summerside PEI'});
  assert.equal(search.body.results[0].countryCode,'CA'); assert.equal(calls,before,'Local city search must not call a hosted free API');
  const radar=await handlers.radar({v:'2',region:'global'});
  assert.equal(radar.body.available,false); assert.equal(calls,before,'Unlicensed RainViewer must never be called');
  handlers.planningForecast=originalPrivate;
  const fallback=await handlers.planningForecast({lat:'45.4215',lon:'-75.6972'});
  assert.equal(fallback.body.weatherProvider,'met-no');
  assert.equal(fallback.body.weatherProviderFallback,true,'Missing private provider credentials must leave a licensed planning fallback');
} finally { globalThis.fetch=originalFetch; handlers.planningForecast=originalPrivate; delete process.env.WEATHER_PROVIDER; }
assert.equal(geo.search('Vancouver BC')[0].admin1,'British Columbia');
assert.equal(geo.search('New York NY')[0].countryCode,'US');

const preferences={activity:'run',duration:60,timeOfDay:'daylight'};
const result={preferences,activity:{id:'run'},windows:[{start:'2099-01-01T12:00',end:'2099-01-01T13:00'}],status:'available'};
const resolved=resolvePlan({planResult:result,utcOffsetSeconds:0},preferences);
assert.equal(resolved.windows.length,1); assert.equal(resolved.activity.id,'run');
const expired=resolvePlan({planResult:{...result,windows:[{start:'2000-01-01T12:00'}]},utcOffsetSeconds:0},preferences);
assert.equal(expired.windows.length,0); assert.equal(expired.status,'unavailable');
const amountModel={weatherProvider:'met-no',utcOffsetSeconds:0,timezone:'UTC',nowIndex:0,planNow:'2026-10-14T09:00',
  days:[{time:'2026-10-14',sunrise:'2026-10-14T07:00',sunset:'2026-10-14T19:00'}],
  series:Array.from({length:8},(_,i)=>({time:`2026-10-14T${String(10+i).padStart(2,'0')}:00`,temp:16,feels:16,wind:8,cloud:20,precip:0.1,pop:null,isDay:1}))};
const amountPlan=planActivity(amountModel,preferences);
assert(amountPlan.windows.length>0); assert.equal(amountPlan.windows[0].maxRainChance,null);
assert.equal(amountPlan.windows[0].rainBasis,'amount'); assert.equal(amountPlan.windows[0].maxPrecipMmPerHour,0.1);
assert.equal(planActivity({...amountModel,weatherProvider:undefined},preferences).windows.length,0);
assert.equal(planActivity({...amountModel,series:amountModel.series.map(r=>({...r,precip:4}))},preferences).windows.length,0);
console.log('Public forecast licensing boundary, missing measurements, cache validators, local geocoding and server plans: passed');
