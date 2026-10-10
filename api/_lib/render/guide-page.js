'use strict';

/**
 * `/weather-guide` — one substantial, sourced answer hub.
 *
 * A single useful guide is intentional. Splitting every question into a thin
 * keyword page would make the catalogue larger without making it better.
 */

const site = require('../site');
const seo = require('../seo');
const { renderDocument, escapeHtml } = require('./shell');

const UPDATED = '2026-09-07';
const MODIFIED = '2026-10-09';

const ANSWERS = [
  {
    id: 'chance-of-rain',
    question: 'What does a 40% chance of rain mean?',
    answer: 'A 40% chance of rain means there is a 40% probability that your specific forecast point will receive at least 0.01 inch (0.25 mm) of precipitation during the stated time window. It does not mean rain will fall for 40% of the day or over exactly 40% of the area.',
    detail: [
      'The time window matters. A 40% chance “this afternoon” describes that afternoon; an hourly 40% value describes that hour. It also says nothing about how long or how hard it will rain, so check the expected amount and the hourly timing as well as the percentage.',
      'WeatherView pairs the probability with expected accumulation and a plain-language start/stop estimate. That makes the number useful for a decision instead of leaving it as an isolated percentage.',
    ],
    source: { label: 'National Weather Service: probability of precipitation', href: 'https://www.weather.gov/ffc/pop' },
  },
  {
    id: 'forecast-accuracy',
    question: 'How far ahead is a weather forecast reliable?',
    answer: 'Forecast confidence generally drops with time. NOAA says a five-day forecast is accurate about 90% of the time, a seven-day forecast about 80%, and a forecast 10 days or farther out about half the time. Use later days as a trend, not a promise.',
    detail: [
      'The atmosphere is chaotic: a small error in today’s observations grows as a model projects farther into the future. Temperature trends and large weather systems may remain useful at longer ranges even when the exact timing of a shower changes.',
      'For a decision today, use the hourly forecast and radar together. For next week, watch whether several updates keep the same signal rather than anchoring on one exact icon or number.',
    ],
    source: { label: 'NOAA: how reliable weather forecasts are', href: 'https://www.nesdis.noaa.gov/about/k-12-education/weather-forecasting/how-reliable-are-weather-forecasts' },
  },
  {
    id: 'feels-like',
    question: 'What does “feels like” temperature mean?',
    answer: '“Feels like” is an apparent temperature, not a thermometer reading. In heat, humidity can slow the evaporation of sweat and make the body feel hotter. In cold weather, wind removes heat from exposed skin faster and makes it feel colder.',
    detail: [
      'Heat index values are designed around shade and light wind, so direct sun can feel hotter. Wind chill estimates exposed-skin heat loss; shelter, sunlight, clothing and activity all change what an individual actually experiences.',
      'Use the actual temperature for freezing and equipment decisions. Use feels-like temperature for clothing, exertion and exposure decisions, then give official heat or cold warnings priority over either number.',
    ],
    source: { label: 'National Weather Service: heat index and apparent temperature', href: 'https://www.weather.gov/safety/heat-index' },
  },
  {
    id: 'dew-point',
    question: 'Is dew point more useful than relative humidity?',
    answer: 'Dew point is usually the clearer measure of how muggy the air feels because it tracks the actual moisture in the air. Relative humidity changes when air temperature changes, even if the amount of water vapour stays the same.',
    detail: [
      'That is why a cool morning can show 100% relative humidity without feeling as oppressive as a hot afternoon at 55%. A higher dew point means more moisture is present and sweat evaporates less readily.',
      'WeatherView labels dew points from 16°C as noticeably humid, from 20°C as muggy and from 24°C as oppressive. Comfort varies by person and climate, so the labels are practical guidance rather than safety thresholds.',
    ],
    source: { label: 'National Weather Service: dew point versus humidity', href: 'https://www.weather.gov/arx/why_dewpoint_vs_humidity' },
  },
  {
    id: 'weather-alerts',
    question: 'What is the difference between a weather watch and a warning?',
    answer: 'A watch means hazardous weather is possible and it is time to prepare. A warning means hazardous weather is occurring, imminent or highly likely and it is time to act. An advisory covers less severe conditions that can still cause significant disruption or danger.',
    detail: [
      'Exact product names and thresholds vary by country and hazard. Read the affected area, timing and instructions in the official bulletin rather than relying on the label alone.',
      'WeatherView relays official alerts from Environment and Climate Change Canada and the US National Weather Service. Any locally calculated risk is labelled “computed” and is never presented as an official warning.',
    ],
    source: { label: 'National Weather Service: watch, warning and advisory explained', href: 'https://www.weather.gov/sjt/WatchWarningAdvisoryExplained' },
  },
  {
    id: 'weather-radar',
    question: 'How do you read weather radar?',
    answer: 'Radar reflectivity shows how strongly precipitation particles return the radar beam. Stronger returns and brighter colours usually mean heavier precipitation, but radar shows what is in the atmosphere—not a perfect measurement of what is reaching the ground.',
    detail: [
      'Snow, hail and melting ice can change the return. Mountains can block the beam, distant beams may pass above shallow precipitation, and birds or ground clutter can create false echoes. Rain can also evaporate before it reaches the surface.',
      'Use animation to judge direction and speed, then compare it with the hourly forecast at your exact point. Radar is excellent for short-range timing; an official warning is the authority for severe-weather action.',
    ],
    source: { label: 'National Weather Service: radar reflectivity basics', href: 'https://www.weather.gov/iwx/wsr_88d' },
  },
  {
    id: 'air-quality-index',
    question: 'What do Air Quality Index numbers mean?',
    answer: 'On the US AQI scale, 0–50 is Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive Groups, 151–200 Unhealthy, 201–300 Very Unhealthy and 301 or higher Hazardous. Higher numbers mean more pollution and greater health concern.',
    detail: [
      'AQI combines several pollutants into one health-oriented scale; the overall number is driven by the pollutant with the highest individual index. Sensitive groups can include people with heart or lung disease, older adults, children and people who are active outdoors, depending on the pollutant.',
      'WeatherView labels whether it is showing US AQI or European AQI because the scales are not interchangeable. If air quality is elevated, use the advice from your local public-health or environmental authority.',
    ],
    source: { label: 'US EPA: understanding the Air Quality Index', href: 'https://www.epa.gov/wildfire-smoke-course/communicating-air-quality-conditions-air-quality-index' },
  },
  {
    id: 'uv-index',
    question: 'What does the UV Index mean?',
    answer: 'The UV Index estimates the strength of sunburn-producing ultraviolet radiation: 0–2 is Low, 3–5 Moderate, 6–7 High, 8–10 Very High and 11 or more Extreme. Protection becomes increasingly important from a value of 3 upward.',
    detail: [
      'The daily peak is normally near solar noon, which is not always 12:00 on the clock. Clouds may reduce UV but do not always remove the risk, while snow, water and bright sand can increase exposure through reflection.',
      'Use the index to plan shade, clothing, eye protection and sunscreen. Individual burn time varies widely, so a generic countdown is less reliable than the exposure category and official sun-safety guidance.',
    ],
    source: { label: 'National Weather Service: UV Index scale and safety', href: 'https://www.weather.gov/abr/uv-index' },
  },
  {
    id: 'wind-and-gusts',
    question: 'What is the difference between wind speed and wind gusts?',
    answer: 'Wind speed describes air movement averaged over a short period; a gust is a brief maximum. A forecast of 25 km/h with gusts to 50 km/h therefore means the background wind is much lower than the strongest short bursts you may encounter.',
    detail: [
      'The US National Digital Forecast Database defines sustained wind as the expected 10-metre wind and a gust as the maximum three-second wind speed within a two-minute interval. Observation and warning conventions vary by weather service, so compare the two values on the same forecast rather than assuming every provider averages them identically.',
      'Gusts matter for loose objects, high-sided vehicles, branches and exposed activities. For boating, aviation or a wind warning, use the official local forecast because terrain, height and exposure can make conditions at your exact location different from a city forecast point.',
    ],
    source: { label: 'National Weather Service: digital forecast definitions', href: 'https://digital.weather.gov/staticpages/definitions.php' },
  },
  {
    id: 'barometric-pressure',
    question: 'What does rising or falling air pressure tell you?',
    answer: 'A falling pressure trend often accompanies an approaching or strengthening low-pressure system, while rising pressure often follows a system and accompanies more settled weather. The trend is context, not a stand-alone rain alarm.',
    detail: [
      'Pressure changes naturally through the day, and the same value means different things at different elevations. That is why WeatherView emphasizes the recent direction and rate rather than labelling one universal pressure number as “good” or “bad.”',
      'Use pressure alongside radar, wind and the hourly forecast. A sharp fall can support the story those other signals are telling, but it cannot identify the exact hazard or timing by itself.',
    ],
    source: { label: 'National Weather Service: pressure, fronts and weather', href: 'https://www.weather.gov/crp/weather_education' },
  },
  {
    id: 'visibility',
    question: 'What does weather visibility measure?',
    answer: 'Weather visibility is the horizontal distance at which a standard object can be seen and identified. Fog, heavy precipitation, smoke, haze and blowing snow can all reduce it, sometimes very locally.',
    detail: [
      'A forecast value describes a representative point or grid area, not every road, shoreline or runway nearby. Visibility can deteriorate abruptly in a fog bank or precipitation band even when the city-wide number looks acceptable.',
      'Treat visibility as one planning clue. For driving, slow down and use guidance from road and public-safety authorities; for aviation or marine decisions, use the specialized observations and forecasts for that activity.',
    ],
    source: { label: 'National Weather Service: National Digital Forecast Database definitions', href: 'https://digital.weather.gov/staticpages/definitions.php' },
  },
  {
    id: 'cloud-cover',
    question: 'What does cloud cover percentage mean?',
    answer: 'Cloud cover is the fraction of the visible sky expected to be covered by cloud. It does not tell you how thick the cloud is, whether it will rain, or whether one cloud layer is hiding another.',
    detail: [
      'National Weather Service terminology treats roughly one-eighth or less as clear, three-eighths to five-eighths as partly cloudy, and seven-eighths or more as cloudy. Automated models often show the underlying percentage instead of those broad labels.',
      'Cloud thickness and height matter for daylight, heat and stargazing, so the same 70% value can look very different under thin high cloud and dark low overcast. Check the condition label, precipitation and hourly changes with it.',
    ],
    source: { label: 'National Weather Service: forecast sky-condition terms', href: 'https://www.weather.gov/ppg/forecast_terms' },
  },
  {
    id: 'snowfall-uncertainty',
    question: 'Why can snowfall totals change so much?',
    answer: 'Snowfall depends on storm track, temperature, precipitation intensity and how efficiently liquid becomes snow. Small forecast changes can move the rain–snow line or the heaviest band and produce a large change in the total at one place.',
    detail: [
      'A single total is the most likely estimate, not a guarantee. The National Weather Service publishes probabilistic snowfall products in supported US areas to show reasonable lower and upper possibilities around its official forecast.',
      'For planning, check the total, hourly timing and temperature together, then revisit them as the event approaches. Official winter warnings and local road information should take priority over a model total.',
    ],
    source: { label: 'National Weather Service: probabilistic snowfall products', href: 'https://www.weather.gov/prob-snow' },
  },
  {
    id: 'forecast-changes',
    question: 'Why did the forecast change since the last update?',
    answer: 'Forecasts change when new observations give models a better estimate of the atmosphere and new model runs evolve that estimate forward. Small differences can grow with time, so later-day timing and amounts usually move more than the next few hours.',
    detail: [
      'Ensemble forecasting runs multiple plausible versions from slightly different starting conditions. When those members stay close together, confidence is generally higher; when they spread out, there is a wider range of plausible outcomes.',
      'A changed forecast is not automatically a mistake. Watch whether a signal persists across updates and focus on decision-relevant changes—such as rain moving into an event window—instead of every one-degree adjustment.',
    ],
    source: { label: 'Met Office: how ensemble forecasts show uncertainty', href: 'https://www.metoffice.gov.uk/research/weather/ensemble-forecasting/what-is-an-ensemble-forecast' },
  },
  {
    id: 'aqi-versus-aqhi',
    question: 'Are AQI and Canada’s AQHI the same scale?',
    answer: 'No. The US Air Quality Index reports 0–500 categories driven by the pollutant with the highest individual index. Canada’s Air Quality Health Index uses a 1–10+ scale built around the short-term health risk from a mixture of ozone, nitrogen dioxide and fine particles.',
    detail: [
      'The numbers are not directly convertible. An AQI of 80 and an AQHI of 8 do not describe equivalent air. Always read the scale name, category and health advice together.',
      'WeatherView currently labels US AQI and European AQI where those modelled values are available. In Canada, use Environment and Climate Change Canada for the official AQHI and its health messages.',
    ],
    source: { label: 'Government of Canada: About the Air Quality Health Index', href: 'https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index/about.html' },
  },
];

function renderAnswer(item) {
  return `
    <article class="guide-answer" id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.question)}</h2>
      <p class="answer-summary">${escapeHtml(item.answer)}</p>
      ${item.detail.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      <p class="guide-source">Source: <a href="${escapeHtml(item.source.href)}" rel="noopener">${escapeHtml(item.source.label)}</a>.</p>
    </article>`;
}

function renderGuidePage() {
  const title = `Weather Questions Answered — Rain, Wind, AQI & More | ${site.name}`;
  const description = 'Clear, sourced answers to common weather questions: rain probability, forecast accuracy, wind gusts, pressure, visibility, snowfall, radar, air quality and UV.';
  const path = '/weather-guide';

  const hero = `
    <section class="panel panel-hero panel-intro guide-intro">
      <p class="eyebrow">Weather guide</p>
      <h1>Weather questions, answered clearly</h1>
      <p class="lede">
        A forecast is only useful when its numbers make sense. These are direct,
        practical answers to the questions people most often ask about rain,
        forecast confidence, radar, air quality and outdoor risk.
      </p>
      <p>
        Reviewed against NOAA, the National Weather Service, Environment Canada,
        the Met Office and the US EPA on
        <time datetime="${UPDATED}">September 7, 2026</time>. For live conditions,
        <a href="/weather">choose a city forecast</a>.
      </p>
      <p>Need help using WeatherView? <a href="#app-support">Open app help or report a problem</a>.</p>
    </section>`;

  const contents = `
    <nav class="panel guide-contents" aria-labelledby="guide-contents-title">
      <header class="panel-head"><h2 id="guide-contents-title">In this guide</h2></header>
      <ol>
        ${ANSWERS.map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.question)}</a></li>`).join('')}
        <li><a href="#app-support">WeatherView app help and support</a></li>
      </ol>
    </nav>`;

  const support = `
    <section class="panel guide-method" id="app-support" aria-labelledby="app-support-title">
      <header class="panel-head"><h2 id="app-support-title">WeatherView app help and support</h2></header>
      <p>WeatherView is free, with no account, ads or subscription required.</p>
      <article class="guide-answer">
      <h3>Find a city and keep your preferences</h3>
      <p>On iPhone and iPad, open the places button at the top left to search for a city, save places and choose Celsius or Fahrenheit. On the website, use the city search and units control. Saved places and preferences stay on your device.</p>
      </article>
      <article class="guide-answer">
      <h3>Radar or forecasts are not updating</h3>
      <p>Check your internet connection and use Refresh. Radar needs an internet connection; an empty radar area can mean no rain or no radar coverage. In the app, a forecast labelled Saved is your last successful forecast, with its update time shown. Reconnect and refresh for current conditions and warnings.</p>
      </article>
      <article class="guide-answer">
      <h3>Add an outing to Calendar</h3>
      <p>Open Plan, choose an activity and duration, then select Add to calendar on a suggested window. Review the time and reminder in the calendar editor before saving. You can cancel without creating an event. WeatherView does not read your calendar.</p>
      </article>
      <article class="guide-answer">
      <h3>Report a problem or ask for help</h3>
      <p><a href="https://github.com/shadoprizm/weather-dashboard/issues/new" rel="noopener">Send a support report</a>. Tell us whether you are using the website, iPhone or iPad, the app version, the city you selected, and what you expected to happen.</p>
      <p>Reports are public and require a GitHub account. Include only information you are comfortable sharing publicly; leave out private addresses, contact details and personal calendar entries.</p>
      </article>
    </section>`;

  const methodology = `
    <section class="panel guide-method" id="how-we-build-the-forecast">
      <header class="panel-head"><h2>How WeatherView builds the forecast</h2></header>
      <p>
        WeatherView turns current conditions and forecast data from the configured
        provider into hourly and extended views. Environment Canada supplies observed
        and projected North American radar, including NOAA observations. Future frames
        project existing echoes up to 72 minutes from their starting observation;
        the available time ahead is shown on the map. RainViewer supplies recent
        radar outside that domain and when the government feed is unavailable;
        Environment and Climate Change Canada and the US National Weather Service
        supply official alerts. Forecast pages show when their data was refreshed
        and update automatically every few minutes.
      </p>
      <p>
        The plain-English briefing, activity windows and computed watches are derived
        from the same values visible on the page. They are decision aids, not official
        warnings. Weather can change quickly, so always follow your national or local
        authority when safety is at stake.
      </p>
      <p class="guide-source">
        Data sources: <a href="https://www.visualcrossing.com/" rel="noopener">Visual Crossing</a>,
        <a href="https://www.rainviewer.com/" rel="noopener">RainViewer</a>,
        <a href="https://eccc-msc.github.io/open-data/licence/readme_en/" rel="noopener">ECCC data licence</a>,
        <a href="https://www.weather.gc.ca/" rel="noopener">Environment Canada</a> and
        <a href="https://www.weather.gov/" rel="noopener">National Weather Service</a>.
      </p>
    </section>`;

  const faq = seo.faqJsonLd(ANSWERS.map(({ question, answer }) => ({ question, answer })));
  const head = seo.headTags({
    title,
    description,
    canonical: site.url(path),
    robots: 'index, follow',
    jsonLd: [
      seo.webPageJsonLd({
        name: 'Weather questions, answered clearly',
        description,
        path,
        datePublished: UPDATED,
        dateModified: MODIFIED,
        about: ANSWERS.map((item) => ({ '@type': 'Thing', name: item.question })),
      }),
      seo.breadcrumbJsonLd([
        { name: site.name, path: '/' },
        { name: 'Weather guide', path },
      ]),
      faq,
    ].filter(Boolean),
  });

  return renderDocument({
    head,
    mounts: {
      alerts: '',
      hero,
      hourly: '', details: '', air: '', daily: '', activities: '', astro: '',
      almanac: '', compare: '',
      'page-detail': `${contents}<section class="panel guide-answers" aria-label="Weather questions and answers">${ANSWERS.map(renderAnswer).join('')}</section>${support}`,
      'page-context': methodology,
    },
    tabs: false,
    heroPanel: false,
    bootstrap: { page: 'guide' },
  });
}

module.exports = { renderGuidePage, ANSWERS, UPDATED };
