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
  try { track(name, { ...properties, ...campaign }); } catch { /* Measurement never blocks the forecast. */ }
}

const campaign = (() => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source');
  return ['launch', 'hackernews', 'reddit'].includes(source) && params.get('utm_campaign') === 'planning'
    ? { campaign: 'planning', source } : {};
})();

const enabled = typeof window !== 'undefined' && window.location.hostname === 'www.weatherview.cloud';
if (enabled) inject({ mode: 'production', debug: false, beforeSend: sanitizeEvent });

if (enabled && campaign.source) trackAction('Planning campaign visit');
