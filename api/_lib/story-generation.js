'use strict';

/**
 * Low-cost weather-story pipeline.
 *
 * Numbers decide whether a story is worth writing. Luna only turns the chosen
 * evidence into readable copy; it never chooses the event or supplies facts.
 * That separation makes the spend predictable and gives an editor a compact
 * evidence block to verify before publishing.
 */

const { buildUrl, fetchJson } = require('./upstream');
const { assertStory } = require('./stories');

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const AI_GATEWAY_RESPONSES = 'https://ai-gateway.vercel.sh/v1/responses';
const OPENAI_RESPONSES = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_OUTPUT_TOKENS = 1600;
const PRICING_AS_OF = '2026-08-22';
const LUNA_USD_PER_MILLION = { input: 0.20, output: 1.20 };

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'rain_sum',
  'snowfall_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
];

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'dek', 'summary', 'whyItMatters', 'whatToWatch', 'seoTitle', 'seoDescription'],
  properties: {
    headline: { type: 'string', minLength: 12, maxLength: 100 },
    dek: { type: 'string', minLength: 30, maxLength: 180 },
    summary: { type: 'string', minLength: 50, maxLength: 500 },
    whyItMatters: {
      type: 'array', minItems: 1, maxItems: 3,
      items: { type: 'string', minLength: 35, maxLength: 500 },
    },
    whatToWatch: {
      type: 'array', minItems: 1, maxItems: 3,
      items: { type: 'string', minLength: 35, maxLength: 500 },
    },
    seoTitle: { type: 'string', minLength: 12, maxLength: 54 },
    seoDescription: { type: 'string', minLength: 50, maxLength: 155 },
  },
};

const EVENT_LABELS = {
  extreme_heat: 'notable heat',
  extreme_cold: 'notable cold',
  heavy_rain: 'heavy rain',
  heavy_snow: 'heavy snow',
  strong_wind: 'strong wind',
  thunderstorm: 'thunderstorms',
  temperature_swing: 'a sharp temperature change',
};

function numberAt(values, index) {
  const value = Array.isArray(values) ? Number(values[index]) : NaN;
  return Number.isFinite(value) ? value : null;
}

async function fetchStoryForecast(city, { fetchJsonImpl = fetchJson } = {}) {
  const url = buildUrl(OPEN_METEO, {
    latitude: city.latitude,
    longitude: city.longitude,
    daily: DAILY_FIELDS,
    timezone: 'auto',
    forecast_days: 7,
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
  });
  const data = await fetchJsonImpl(url);
  const daily = data && data.daily;
  if (!daily || !Array.isArray(daily.time) || !daily.time.length) {
    throw new Error(`No daily forecast returned for ${city.label}`);
  }

  return {
    city: {
      slug: city.slug,
      name: city.name,
      label: city.label,
      region: city.region,
      country: city.country,
      countryCode: city.countryCode,
      latitude: city.latitude,
      longitude: city.longitude,
    },
    timezone: data.timezone || null,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url,
    days: daily.time.map((date, index) => ({
      date,
      weatherCode: numberAt(daily.weather_code, index),
      highC: numberAt(daily.temperature_2m_max, index),
      lowC: numberAt(daily.temperature_2m_min, index),
      precipMm: numberAt(daily.precipitation_sum, index),
      rainMm: numberAt(daily.rain_sum, index),
      snowCm: numberAt(daily.snowfall_sum, index),
      precipChancePct: numberAt(daily.precipitation_probability_max, index),
      maxWindKmh: numberAt(daily.wind_speed_10m_max, index),
      maxGustKmh: numberAt(daily.wind_gusts_10m_max, index),
    })),
  };
}

function eventsForDay(forecast, day, index) {
  const events = [];
  const add = (eventType, score, metric, value, unit, threshold) => events.push({
    eventType,
    eventLabel: EVENT_LABELS[eventType],
    score: Number(score.toFixed(2)),
    metric,
    value,
    unit,
    threshold,
    eventDate: day.date,
    city: forecast.city,
    timezone: forecast.timezone,
    fetchedAt: forecast.fetchedAt,
    sourceUrl: forecast.sourceUrl,
    days: forecast.days,
  });

  if (day.highC !== null && day.highC >= 35) {
    add('extreme_heat', 65 + (day.highC - 35) * 5, 'daily high', day.highC, '°C', 35);
  }
  if (day.lowC !== null && day.lowC <= -20) {
    add('extreme_cold', 65 + (-20 - day.lowC) * 4, 'daily low', day.lowC, '°C', -20);
  }
  if (day.rainMm !== null && day.rainMm >= 25) {
    add('heavy_rain', 65 + (day.rainMm - 25) * 2, 'rainfall', day.rainMm, 'mm', 25);
  }
  if (day.snowCm !== null && day.snowCm >= 10) {
    add('heavy_snow', 65 + (day.snowCm - 10) * 3, 'snowfall', day.snowCm, 'cm', 10);
  }
  if (day.maxGustKmh !== null && day.maxGustKmh >= 75) {
    add('strong_wind', 65 + (day.maxGustKmh - 75), 'maximum wind gust', day.maxGustKmh, 'km/h', 75);
  }
  if ([95, 96, 99].includes(day.weatherCode)) {
    add('thunderstorm', 70 + (day.weatherCode - 95), 'forecast condition', day.weatherCode, 'WMO code', 95);
  }

  const previous = forecast.days[index - 1];
  if (previous && previous.highC !== null && day.highC !== null) {
    const change = Number((day.highC - previous.highC).toFixed(1));
    if (Math.abs(change) >= 12) {
      add('temperature_swing', 60 + Math.abs(change), 'day-over-day high change', change, '°C', 12);
    }
  }
  return events;
}

function rankStoryCandidates(forecasts) {
  const candidates = [];
  for (const forecast of forecasts) {
    if (!forecast || !forecast.city || !Array.isArray(forecast.days)) continue;
    forecast.days.forEach((day, index) => candidates.push(...eventsForDay(forecast, day, index)));
  }
  return candidates.sort((a, b) =>
    b.score - a.score ||
    a.eventDate.localeCompare(b.eventDate) ||
    a.city.slug.localeCompare(b.city.slug) ||
    a.eventType.localeCompare(b.eventType)
  );
}

function selectStoryCandidate(forecasts) {
  return rankStoryCandidates(forecasts)[0] || null;
}

function slugForCandidate(candidate) {
  return `${candidate.eventDate}-${candidate.city.slug}-${candidate.eventType.replace(/_/g, '-')}`;
}

function responseText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function generationRequest(candidate, { model = DEFAULT_MODEL } = {}) {
  return {
    model,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    instructions:
      'You are the WeatherView editorial assistant. Write a concise weather story using only the supplied JSON evidence. ' +
      'Do not invent records, impacts, alerts, causes, quotations, or certainty. Describe these values as a forecast, not as observed weather. ' +
      'Never call a computed threshold an official warning. Use Canadian English, metric units, sentence-case headings, and practical language. ' +
      'The page will display the underlying evidence and source separately, so do not add citations or a data table.',
    input: JSON.stringify({
      assignment: `Explain why ${candidate.eventLabel} forecast for ${candidate.city.label} is worth noticing.`,
      selectedEvent: {
        type: candidate.eventType,
        date: candidate.eventDate,
        metric: candidate.metric,
        value: candidate.value,
        unit: candidate.unit,
        selectionThreshold: candidate.threshold,
      },
      location: candidate.city,
      forecastTimezone: candidate.timezone,
      forecastFetchedAt: candidate.fetchedAt,
      forecastDays: candidate.days,
    }),
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'weatherview_story',
        description: 'A concise weather story grounded only in supplied forecast evidence.',
        strict: true,
        schema: STORY_SCHEMA,
      },
    },
  };
}

function generationTarget({
  gatewayKey = process.env.AI_GATEWAY_API_KEY,
  openAIKey = process.env.OPENAI_API_KEY,
  oidcToken = process.env.VERCEL_OIDC_TOKEN,
  model = process.env.STORY_MODEL || DEFAULT_MODEL,
} = {}) {
  // An explicit Gateway key means the team intentionally chose Gateway. A
  // direct OpenAI key comes next so a Vercel deployment's automatic OIDC token
  // does not force traffic through Gateway when Luna is restricted there.
  if (gatewayKey) {
    return {
      backend: 'vercel-ai-gateway',
      token: gatewayKey,
      url: AI_GATEWAY_RESPONSES,
      model: model.includes('/') ? model : `openai/${model}`,
    };
  }
  if (openAIKey) {
    return {
      backend: 'openai',
      token: openAIKey,
      url: OPENAI_RESPONSES,
      model: model.replace(/^openai\//, ''),
    };
  }
  if (oidcToken) {
    return {
      backend: 'vercel-ai-gateway',
      token: oidcToken,
      url: AI_GATEWAY_RESPONSES,
      model: model.includes('/') ? model : `openai/${model}`,
    };
  }
  throw new Error(
    'AI authentication is required. Set OPENAI_API_KEY, run through `vercel env run` ' +
    'for Gateway OIDC, or set AI_GATEWAY_API_KEY.'
  );
}

async function generateCopy(candidate, {
  gatewayKey = process.env.AI_GATEWAY_API_KEY,
  openAIKey = process.env.OPENAI_API_KEY,
  oidcToken = process.env.VERCEL_OIDC_TOKEN,
  model = process.env.STORY_MODEL || DEFAULT_MODEL,
  fetchImpl = fetch,
} = {}) {
  const target = generationTarget({ gatewayKey, openAIKey, oidcToken, model });

  const response = await fetchImpl(target.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(generationRequest(candidate, { model: target.model })),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const errorPayload = await response.json();
      detail = errorPayload && errorPayload.error
        ? String(errorPayload.error.message || errorPayload.error.code || errorPayload.error)
        : '';
    } catch (error) {
      // Some gateway errors have no JSON body. The status still gives the
      // caller a safe, actionable failure without ever logging credentials.
    }
    const label = target.backend === 'openai' ? 'OpenAI Responses API' : 'Vercel AI Gateway';
    throw new Error(`${label} returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const payload = await response.json();
  if (payload.status && payload.status !== 'completed') {
    throw new Error(`AI response did not complete (${payload.status})`);
  }
  const output = responseText(payload);
  if (!output) throw new Error('AI response did not contain output text');

  let copy;
  try {
    copy = JSON.parse(output);
  } catch (error) {
    throw new Error(`AI response contained invalid structured JSON: ${error.message}`);
  }
  return {
    copy,
    backend: target.backend,
    model: target.model,
    responseId: payload.id || null,
    usage: payload.usage || null,
  };
}

function estimateLunaCost(usage, model = DEFAULT_MODEL) {
  if ((!String(model).endsWith(`/${DEFAULT_MODEL}`) && model !== DEFAULT_MODEL) || !usage) return null;
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  return Number(((inputTokens * LUNA_USD_PER_MILLION.input + outputTokens * LUNA_USD_PER_MILLION.output) / 1_000_000).toFixed(6));
}

function expiryForEvent(eventDate) {
  const date = new Date(`${eventDate}T23:59:59.999Z`);
  date.setUTCDate(date.getUTCDate() + 2);
  return date.toISOString();
}

function composeDraft(candidate, generation, { generatedAt = new Date().toISOString() } = {}) {
  const { copy, backend, model, usage } = generation;
  const story = {
    schemaVersion: 1,
    status: 'draft',
    slug: slugForCandidate(candidate),
    headline: copy.headline,
    dek: copy.dek,
    summary: copy.summary,
    sections: [
      { heading: 'Why this matters', paragraphs: copy.whyItMatters },
      { heading: 'What to watch', paragraphs: copy.whatToWatch },
    ],
    seoTitle: copy.seoTitle,
    seoDescription: copy.seoDescription,
    generatedAt,
    publishedAt: null,
    expiresAt: expiryForEvent(candidate.eventDate),
    evidence: {
      eventType: candidate.eventType,
      eventLabel: candidate.eventLabel,
      eventDate: candidate.eventDate,
      selectedMetric: {
        label: candidate.metric,
        value: candidate.value,
        unit: candidate.unit,
        threshold: candidate.threshold,
      },
      location: candidate.city,
      timezone: candidate.timezone,
      days: candidate.days,
    },
    source: {
      provider: 'Open-Meteo',
      url: 'https://open-meteo.com/',
      requestUrl: candidate.sourceUrl,
      fetchedAt: candidate.fetchedAt,
    },
    disclosure: 'AI-assisted draft based on the forecast evidence shown on this page; reviewed before publication.',
    generation: {
      backend,
      model,
      reasoningEffort: 'low',
      usage,
      estimatedCostUsd: estimateLunaCost(usage, model),
      pricingAsOf: model === DEFAULT_MODEL ? PRICING_AS_OF : null,
    },
  };
  return assertStory(story);
}

module.exports = {
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  PRICING_AS_OF,
  LUNA_USD_PER_MILLION,
  STORY_SCHEMA,
  fetchStoryForecast,
  rankStoryCandidates,
  selectStoryCandidate,
  slugForCandidate,
  generationRequest,
  generationTarget,
  generateCopy,
  estimateLunaCost,
  composeDraft,
};
