export function weatherSource(provider) {
  if (provider === 'visual-crossing') return { text: 'Weather Data Provided by Visual Crossing', url: 'https://www.visualcrossing.com/' };
  if (provider === 'met-no') return { text: 'Forecast data from MET Norway, normalized by WeatherView', url: 'https://api.met.no/doc/License' };
  return { text: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' };
}
