# Weather Now project memory

## Preferences
- Treat a feature as launched only when a normal visitor can discover and use it in the production UI; deployment reports must clearly separate visible product features from hidden routes, internal infrastructure, tests, documentation and planned work.
- With real traffic arriving, prioritize production reliability and clear feature discovery before expanding the roadmap.

## Decisions
- [2026-08-19] Treat organic search and generative-engine visibility as core product requirements: keep public forecast content crawlable, server-rendered, directly answerable, well-sourced, and included in the sitemap without creating thin keyword pages.
- [2026-08-22] Keep WeatherView Free genuinely useful and complete; monetize AI personalization, persistent monitoring, and proactive delivery rather than withholding essential weather information or public-safety alerts.
- [2026-08-22] Explore background AI-assisted weather stories as a free, shared feature that benefits all users and supports SEO/GEO, with new pages published only when they add distinct user value.
- [2026-08-22] Bootstrap WeatherView with minimal new fixed costs because paid adoption may be gradual; Vercel Pro is already paid for, and expensive weather-data/database tiers should wait until revenue justifies them.
- [2026-08-22] Use GPT-5.6 Luna as WeatherView's initial AI model; keep the integration portable and validate it on WeatherView-specific story and assistant workloads.
- [2026-08-22] Keep normal WeatherView use anonymous. Introduce an account only when a customer asks WeatherView to monitor, synchronize, deliver personalized updates, or subscribe to Pro; the first paid workflow is persistent weather monitoring rather than a gated forecast or generic chatbot.
- [2026-08-22] Prefer Supabase Auth + Postgres, Stripe, Resend and the existing Vercel Pro project for the first account backend, but validate the paid feature and commercial weather provider before provisioning them.
- [2026-08-22] Do not launch subscriptions on Open-Meteo's hosted free API: its terms classify subscription-supported apps as commercial, and the existing historical Almanac would require the Professional rather than Standard plan. Run a commercial-provider bake-off before account implementation.
- [2026-08-22] Run Visual Crossing as WeatherView's primary live forecast provider for a multi-day user trial, with `WEATHER_PROVIDER=visual-crossing` and the API key configured in all Vercel environments; retain Open-Meteo as the automatic forecast fallback and, during the noncommercial prototype, for geocoding, air quality, Almanac, and story generation.
- [2026-08-22] Visual Crossing's Timeline adapter preserves the existing forecast contract and displays required attribution. Before subscriptions or advertising launch, confirm that WeatherView's public same-origin JSON proxy and consumer weather UI comply with Visual Crossing's commercial licence, and replace or license the remaining Open-Meteo uses.
- [2026-08-22] Rate-limit provider evaluation calls: a five-location parallel comparison burst produced two upstream HTTP 429s, while immediate sequential retries succeeded. Shared location/time-bucket caching is required before monitoring fan-out.
