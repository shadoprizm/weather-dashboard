'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
let index;
const provinces = { Ontario:'ON', Quebec:'QC', Alberta:'AB', 'British Columbia':'BC', Manitoba:'MB',
  'New Brunswick':'NB', 'Newfoundland and Labrador':'NL', 'Nova Scotia':'NS', 'Prince Edward Island':'PEI',
  Saskatchewan:'SK', Yukon:'YT', Nunavut:'NU', 'Northwest Territories':'NT' };
function normalize(value) { return String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(); }
function load() {
  if (index) return index;
  const rows = JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,'../../data/geonames-cities.json.gz'))));
  index = new Map();
  for (const row of rows) {
    const names = [...new Set([row[1],...row[10]].map(normalize))];
    const entry = { row, names, region: normalize([row[5],row[6],row[7],row[8],provinces[row[7]]||''].join(' ')) };
    for (const prefix of new Set(names.map(name=>name.slice(0,2)))) {
      const bucket = index.get(prefix) || [];
      bucket.push(entry); index.set(prefix,bucket);
    }
  }
  return index;
}
function search(value) {
  const query = normalize(value);
  if (query.length < 2) return [];
  const words = query.split(' ');
  return (load().get(query.slice(0,2)) || []).map(entry => {
    const match = entry.names.filter(name=>name.startsWith(words[0]) && words.every(word=>`${name} ${entry.region}`.split(' ').some(part=>part.startsWith(word))));
    const score = match.some(name=>name===query) ? 10000 : match.some(name=>name.startsWith(query)) ? 5000 : match.length ? 1000 : 0;
    return { entry, score: score + (score ? Math.log10(Math.max(1,entry.row[4])) : 0) };
  }).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score || a.entry.row[0]-b.entry.row[0]).slice(0,10).map(({entry:{row:r}})=>({
    id:r[0],name:r[1],latitude:r[2],longitude:r[3],population:r[4],countryCode:r[5],country:r[6],admin1:r[7],timezone:r[9],
  }));
}
module.exports = { search, _internals:{normalize} };
