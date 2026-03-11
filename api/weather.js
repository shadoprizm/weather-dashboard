const https = require('https');

module.exports = (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and longitude required' });
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

  https.get(url, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => body += chunk);
    apiRes.on('end', () => {
      if (apiRes.statusCode === 200) {
        res.setHeader('Cache-Control', 's-maxage=600');
        res.status(200).json(JSON.parse(body));
      } else {
        res.status(apiRes.statusCode).json({ error: `API returned ${apiRes.statusCode}` });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ error: 'Failed to fetch weather data' });
  });
};
