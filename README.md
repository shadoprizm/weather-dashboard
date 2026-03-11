# Weather Dashboard

A responsive weather dashboard displaying current conditions and 5-day forecasts for multiple cities. Built with vanilla JavaScript, Express, and the Open-Meteo API.

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open your browser to: `http://localhost:3000`

## Project Structure

```
weather-dashboard/
├── index.html          # Main HTML structure
├── style.css           # Design system with CSS custom properties
├── app.js              # Frontend logic (clock, card rendering, WMO mapping)
├── server.js           # Express server with API proxy and caching
├── package.json        # Project manifest
└── README.md           # This file
```

## Features

- **Live Clock**: Real-time updating time and date display
- **Multi-City Weather**: Displays weather for NYC, London, Tokyo, and Sydney
- **Current Conditions**: Temperature, humidity, feels-like, wind speed/direction
- **5-Day Forecast**: Daily high/low temperatures with weather icons
- **Weather Icons**: 27 WMO weather code mappings to emoji icons
- **Responsive Design**: CSS Grid layout adapts to desktop (3-col), tablet (2-col), and mobile (1-col)
- **API Caching**: 10-minute in-memory cache for weather data
- **Auto-Refresh**: Weather data refreshes automatically every 10 minutes

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serves the dashboard HTML |
| `GET /api/weather?lat={lat}&lon={lon}` | Proxied weather data from Open-Meteo |
| `GET /api/health` | Server health check with cache stats |

## Attribution

Weather data provided by [Open-Meteo](https://open-meteo.com).  
Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

MIT
