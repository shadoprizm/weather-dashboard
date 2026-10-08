import { inject, track } from './vercel-analytics.js';

// Deep links can contain device coordinates and a visitor's chosen place name.
// Measure public pages and feature use without sending those query parameters.
export function sanitizeEvent(event) {
  try {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  } catch {
    return null;
  }
}

export function trackAction(name, properties) {
  if (typeof window === 'undefined' || !enabled) return;
  try { track(name, properties); } catch { /* Measurement never blocks the forecast. */ }
}

const enabled = typeof window !== 'undefined' && window.location.hostname === 'www.weatherview.cloud';
if (enabled) inject({ mode: 'production', debug: false, beforeSend: sanitizeEvent });
