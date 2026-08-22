/**
 * Vercel Web Analytics integration
 */

import { inject } from './vercel-analytics.js';

/**
 * Initialize Vercel Web Analytics
 */
export function initAnalytics() {
  inject({
    mode: 'auto',
    debug: false,
  });
}
