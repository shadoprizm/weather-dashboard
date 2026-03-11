const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

// Weather API proxy endpoint with caching
app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;
  
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and longitude required' });
  }
  
  const cacheKey = `${lat},${lon}`;
  const cached = cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return res.json(cached.data);
  }
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    
    const data = await new Promise((resolve, reject) => {
      http.get(url, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          if (apiRes.statusCode === 200) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`API returned ${apiRes.statusCode}`));
          }
        });
      }).on('error', reject);
    });
    
    cache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (error) {
    console.error('Weather API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: cache.size });
});

app.listen(PORT, () => {
  console.log(`Weather dashboard server running on http://localhost:${PORT}`);
});
