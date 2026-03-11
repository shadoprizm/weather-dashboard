/**
 * Weather Dashboard Frontend
 * Handles clock, weather card rendering, and Open-Meteo API integration
 */

// WMO Weather Icon Code Mapping
const WMO_ICONS = {
  0: { icon: '☀️', label: 'Clear sky', bg: 'clear' },
  1: { icon: '🌤️', label: 'Mainly clear', bg: 'clear' },
  2: { icon: '⛅', label: 'Partly cloudy', bg: 'cloudy' },
  3: { icon: '☁️', label: 'Overcast', bg: 'cloudy' },
  45: { icon: '🌫️', label: 'Foggy', bg: 'fog' },
  48: { icon: '🌫️', label: 'Depositing rime fog', bg: 'fog' },
  51: { icon: '🌦️', label: 'Light drizzle', bg: 'rain' },
  53: { icon: '🌦️', label: 'Moderate drizzle', bg: 'rain' },
  55: { icon: '🌧️', label: 'Dense drizzle', bg: 'rain' },
  56: { icon: '🌨️', label: 'Light freezing drizzle', bg: 'snow' },
  57: { icon: '🌨️', label: 'Dense freezing drizzle', bg: 'snow' },
  61: { icon: '🌦️', label: 'Slight rain', bg: 'rain' },
  63: { icon: '🌧️', label: 'Moderate rain', bg: 'rain' },
  65: { icon: '🌧️', label: 'Heavy rain', bg: 'rain' },
  66: { icon: '🌨️', label: 'Light freezing rain', bg: 'snow' },
  67: { icon: '🌨️', label: 'Heavy freezing rain', bg: 'snow' },
  71: { icon: '🌨️', label: 'Slight snow fall', bg: 'snow' },
  73: { icon: '❄️', label: 'Moderate snow fall', bg: 'snow' },
  75: { icon: '❄️', label: 'Heavy snow fall', bg: 'snow' },
  77: { icon: '🌨️', label: 'Snow grains', bg: 'snow' },
  80: { icon: '🌦️', label: 'Slight rain showers', bg: 'rain' },
  81: { icon: '🌧️', label: 'Moderate rain showers', bg: 'rain' },
  82: { icon: '🌧️', label: 'Violent rain showers', bg: 'rain' },
  85: { icon: '🌨️', label: 'Slight snow showers', bg: 'snow' },
  86: { icon: '❄️', label: 'Heavy snow showers', bg: 'snow' },
  95: { icon: '⛈️', label: 'Thunderstorm', bg: 'storm' },
  96: { icon: '⛈️', label: 'Thunderstorm with hail', bg: 'storm' },
  99: { icon: '⛈️', label: 'Thunderstorm with heavy hail', bg: 'storm' }
};

// Default weather data
const DEFAULT_LOCATIONS = [
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 }
];

/**
 * Clock functionality
 */
class Clock {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.update();
    setInterval(() => this.update(), 1000);
  }
  
  update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });
    const dateStr = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (this.element) {
      this.element.innerHTML = `<div class="time">${timeStr}</div><div class="date">${dateStr}</div>`;
    }
  }
}

/**
 * Weather Card Renderer
 */
class WeatherCard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }
  
  getWeatherInfo(code) {
    return WMO_ICONS[code] || { icon: '❓', label: 'Unknown', bg: 'clear' };
  }
  
  formatTemp(temp) {
    return `${Math.round(temp)}°C`;
  }
  
  formatWind(speed, direction) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(direction / 45) % 8;
    return `${Math.round(speed)} km/h ${directions[index]}`;
  }
  
  renderCurrent(location, data) {
    const current = data.current;
    const weather = this.getWeatherInfo(current.weather_code);
    
    return `
      <div class="weather-card current ${weather.bg}">
        <div class="location">${location.name}</div>
        <div class="weather-main">
          <span class="weather-icon">${weather.icon}</span>
          <span class="temperature">${this.formatTemp(current.temperature_2m)}</span>
        </div>
        <div class="weather-label">${weather.label}</div>
        <div class="weather-details">
          <div class="detail">
            <span class="detail-icon">💧</span>
            <span>${current.relative_humidity_2m}% humidity</span>
          </div>
          <div class="detail">
            <span class="detail-icon">🌡️</span>
            <span>Feels like ${this.formatTemp(current.apparent_temperature)}</span>
          </div>
          <div class="detail">
            <span class="detail-icon">💨</span>
            <span>${this.formatWind(current.wind_speed_10m, current.wind_direction_10m)}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderForecast(location, data) {
    const daily = data.daily;
    const days = [];
    
    for (let i = 0; i < Math.min(5, daily.time.length); i++) {
      const weather = this.getWeatherInfo(daily.weather_code[i]);
      const date = new Date(daily.time[i]);
      const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
      
      days.push(`
        <div class="forecast-day">
          <span class="day-name">${dayName}</span>
          <span class="day-icon">${weather.icon}</span>
          <span class="day-temps">
            <span class="high">${this.formatTemp(daily.temperature_2m_max[i])}</span>
            <span class="low">${this.formatTemp(daily.temperature_2m_min[i])}</span>
          </span>
        </div>
      `);
    }
    
    return `
      <div class="weather-card forecast">
        <div class="forecast-header">5-Day Forecast - ${location.name}</div>
        <div class="forecast-days">
          ${days.join('')}
        </div>
      </div>
    `;
  }
  
  renderLoading(location) {
    return `
      <div class="weather-card loading">
        <div class="location">${location.name}</div>
        <div class="loading-spinner">Loading...</div>
      </div>
    `;
  }
  
  renderError(location, message) {
    return `
      <div class="weather-card error">
        <div class="location">${location.name}</div>
        <div class="error-message">${message}</div>
      </div>
    `;
  }
}

/**
 * Weather Dashboard Controller
 */
class WeatherDashboard {
  constructor() {
    this.clock = new Clock('clock');
    this.cardRenderer = new WeatherCard('weather-grid');
    this.locations = [...DEFAULT_LOCATIONS];
    this.weatherGrid = document.getElementById('weather-grid');
    
    this.init();
  }
  
  async init() {
    await this.loadAllWeather();
    
    // Refresh every 10 minutes
    setInterval(() => this.loadAllWeather(), 10 * 60 * 1000);
  }
  
  async loadAllWeather() {
    if (!this.weatherGrid) return;
    
    // Show loading state
    this.weatherGrid.innerHTML = this.locations
      .map(loc => this.cardRenderer.renderLoading(loc))
      .join('');
    
    // Load weather for all locations
    const results = await Promise.all(
      this.locations.map(loc => this.fetchWeather(loc))
    );
    
    // Render results
    this.weatherGrid.innerHTML = results
      .map(result => {
        if (result.error) {
          return this.cardRenderer.renderError(result.location, result.error);
        }
        return this.cardRenderer.renderCurrent(result.location, result.data) +
               this.cardRenderer.renderForecast(result.location, result.data);
      })
      .join('');
  }
  
  async fetchWeather(location) {
    try {
      const response = await fetch(`/api/weather?lat=${location.lat}&lon=${location.lon}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      return { location, data };
    } catch (error) {
      return { location, error: error.message };
    }
  }
  
  addLocation(name, lat, lon) {
    this.locations.push({ name, lat, lon });
    this.loadAllWeather();
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new WeatherDashboard();
});
