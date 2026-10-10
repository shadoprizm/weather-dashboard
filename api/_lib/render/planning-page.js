'use strict';
const site = require('../site');
const seo = require('../seo');
const { renderDocument } = require('./shell');

function contentPage(path, title, description, body) {
  return renderDocument({
    head: seo.headTags({ title: `${title} | ${site.name}`, description, canonical: site.url(path),
      image: site.url('/media/weather-planning.png'), imageAlt: 'WeatherView: weather that helps you make plans',
      jsonLd: [seo.webPageJsonLd({ name: title, description, path, datePublished: '2026-10-10', dateModified: '2026-10-10' }),
        seo.breadcrumbJsonLd([{ name: site.name, path: '/' }, { name: title, path }])].filter(Boolean) }),
    mounts: { alerts: '', hero: `<section class="panel panel-intro">${body}</section>`, 'page-detail': '', 'page-context': '' },
    tabs: false, heroPanel: false, bootstrap: { page: 'planning-guide' },
  });
}

function renderPlanningPage() {
  return contentPage('/outdoor-planning', 'Find a good time to get outside',
    'Plan walks, runs, bike rides and gardening with hourly rain chance, wind and feels-like temperature. Find suitable windows in WeatherView’s free 48-hour planner.', `
    <p class="eyebrow">Weather that helps you make plans · Updated October 10, 2026</p>
    <h1>Find a good time to get outside.</h1>
    <p class="lede">You have an activity in mind and a little time to spare. WeatherView helps you compare suitable times over the next 48 hours, with the conditions behind each suggestion. Free, ad-free and no account needed.</p>
    <p><a href="/?view=plan">Find a time in the planner →</a> · <a href="/weather">Choose your city</a></p>
    <h2>Start with the time you actually need</h2>
    <p>Choose an activity, a duration from 30 minutes to three hours, and daylight, night or any time. Suggestions use your selected location’s local time. Every forecast hour in an outing must meet the activity’s minimum fit, and the highest average fit comes first.</p>
    <p>A suggestion is a comparison of forecast conditions, not a promise of dry weather or a safety assessment. No suitable result means no complete window fits your choices in the available forecast. Try a shorter duration or another time of day; missing data never counts as good weather.</p>
    <h2 id="walks">Walks and dog walks</h2>
    <p>For a walk, compare feels-like temperature, rain chance and wind for the whole outing. A dry-looking starting hour is less useful if rain becomes more likely before you get home. Choose a shorter duration when your schedule is tight.</p>
    <p><a href="/?view=plan&amp;activity=walk&amp;duration=30&amp;timeOfDay=daylight">Find time for a 30-minute walk →</a></p>
    <h2 id="runs">Running</h2>
    <p>A run uses a different comfort range from a relaxed walk. Compare the coolest-looking hours with feels-like temperature and wind, then choose the duration you need. The planner explains the highest hourly rain chance and wind within each result so you can judge the tradeoff.</p>
    <p><a href="/?view=plan&amp;activity=run&amp;duration=60&amp;timeOfDay=daylight">Compare times for a one-hour run →</a></p>
    <h2 id="cycling">Cycling</h2>
    <p>Wind matters alongside temperature and precipitation. The planner shows the highest forecast wind within a suggested ride. It does not evaluate your route, traffic, road surface, exposure or riding ability; check those separately.</p>
    <p><a href="/?view=plan&amp;activity=cycle&amp;duration=90&amp;timeOfDay=daylight">Find time for a 90-minute bike ride →</a></p>
    <h2 id="gardening">Gardening and outdoor chores</h2>
    <p>Garden work needs daylight in WeatherView’s planner. Choose enough time to complete the task, then compare rain chance, wind and feels-like temperature across the full window. Soil conditions and the requirements of a particular job remain your own checks.</p>
    <p><a href="/?view=plan&amp;activity=garden&amp;duration=120&amp;timeOfDay=daylight">Compare two-hour gardening windows →</a></p>
    <h2>Planning ahead and checking radar do different jobs</h2>
    <p>The activity planner uses hourly forecasts for the next 48 hours. Radar shows precipitation echoes recently observed, and—where the North American government feed is available—projects their movement up to 72 minutes from the starting observation. The actual remaining future time is shown in the radar controls.</p>
    <p>Radar projections do not predict new storms or how existing precipitation will grow or fade. Check the latest radar shortly before heading out, and read any official warnings. Elsewhere, or when projections are unavailable, the app explains the available recent radar.</p>
    <p><a href="/?view=radar">Check precipitation radar →</a> · <a href="/weather-guide">Read the sourced weather guide</a></p>
    <h2>Save a plan, then check it again</h2>
    <p>Each result can be downloaded as a calendar file for you to review, or shared as a planning link. Shared links restore the activity, duration and time-of-day choices and calculate new suggestions using the latest available forecast. A downloaded image or calendar event is a snapshot and does not update itself.</p>
    <h2>Try it in your city</h2>
    <p><a href="/weather/ottawa?view=plan">Ottawa</a> · <a href="/weather/toronto?view=plan">Toronto</a> · <a href="/weather/vancouver?view=plan">Vancouver</a> · <a href="/weather/new-york?view=plan">New York</a> · <a href="/weather">All published cities</a>. Search the app for other locations.</p>
    <p>Method: WeatherView’s forecast-based <a href="/?view=plan">activity planner</a>. Radar method and limitations: <a href="https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/">ECCC radar data documentation</a>. Forecast interpretation: <a href="/weather-guide">weather questions and sources</a>.</p>`);
}

function renderLaunchPage() {
  return contentPage('/launch', 'Weather that helps you make plans',
    'Try WeatherView’s free activity planner, everyday forecast and precipitation radar. See the latest improvements and share the demonstration.', `
    <p class="eyebrow">WeatherView · Free · Ad-free · No account needed</p>
    <h1>Weather that helps you make plans.</h1>
    <p class="lede">See what’s coming. Find a good time to get outside. Check the radar before you go.</p>
    <p>Choose an activity and how long you need. Compare suitable times in the next 48 hours, see the reasons, and save or share a plan. Keep current conditions, hourly forecasts, air quality and official alerts close at hand.</p>
    <p><a href="/?view=plan&amp;utm_source=launch&amp;utm_medium=owned&amp;utm_campaign=planning">Try the planner →</a> · <a href="/outdoor-planning">How it works</a></p>
    <h2>See it in action</h2>
    <p>These are real product captures from this release. Weather and suggested times change; open the app for the latest conditions.</p>
    <video controls preload="metadata" playsinline poster="/media/weather-planning.png" style="width:100%;border-radius:16px" aria-label="WeatherView planning, forecast and radar demonstration"><source src="/media/weatherview-demo.mp4" type="video/mp4"></video>
    <div class="launch-media">
      <figure><img src="/media/weather-planning.png" alt="WeatherView activity planner with suggested times and reasons" width="1200" height="630"><figcaption><a href="/media/weather-planning.png" download>Download the planning image</a></figcaption></figure>
      <figure><img src="/media/weather-forecast.png" alt="WeatherView’s everyday forecast and planning preview" width="1200" height="630" loading="lazy"><figcaption><a href="/media/weather-forecast.png" download>Download the forecast image</a></figcaption></figure>
      <figure><img src="/media/weather-radar.png" alt="WeatherView precipitation radar with recent and future controls" width="1200" height="630" loading="lazy"><figcaption><a href="/media/weather-radar.png" download>Download the radar image</a></figcaption></figure>
    </div>
    <h2>What changed in this update?</h2>
    <p>The planning preview is now easy to find alongside your forecast. Share a selected plan and reopen it with fresh suggestions. Our new <a href="/outdoor-planning">outdoor-planning guide</a> explains how to use the results.</p>
    <p>North American radar includes short-range projections where coverage and data are available. This is separate from the planner’s hourly forecast. Official warnings take priority.</p>
    <p><a href="/">Open WeatherView</a> · <a href="/weather-guide#app-support">Contact and feedback</a></p>`);
}
module.exports = { renderPlanningPage, renderLaunchPage };
