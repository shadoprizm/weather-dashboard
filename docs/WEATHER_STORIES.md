# Weather stories: first production slice

WeatherView only asks AI to write after deterministic thresholds find a
material forecast event. This keeps a quiet weather day from becoming a thin
SEO page and makes the source of every claim reviewable.

## What ships in this slice

- A daily-data scan of a curated set of published cities using the existing
  Open-Meteo provider. It fetches seven daily values per city and no air-quality
  payloads.
- Deterministic candidate ranking for notable heat, cold, rain, snow, wind,
  thunderstorms and sharp temperature changes.
- One GPT-5.6 Luna request, either direct or through Vercel AI Gateway, with low
  reasoning, strict structured output, `store: false`, and a 1,600-token hard
  output cap.
- A version-controlled JSON draft. Nothing publishes automatically.
- Server-rendered `/weather-stories` and `/weather-stories/{slug}` pages with a
  visible evidence table, source timestamp, AI-assistance disclosure,
  canonical metadata and Article structured data.
- Automatic freshness control: expired stories remain readable as forecast
  snapshots but become `noindex` and leave the public index and sitemap.
- A schema-enforced human review record. A published story must name its
  reviewer and prove that facts, source, links and the rendered preview were
  checked.
- Conditional discovery. An active story appears beside the matching city,
  on the story index and in the sitemap; no permanent header link is added.
- A daily integrity audit in GitHub Actions. It validates every story and
  reports active, expired, archived and draft content without generating copy.

There is no database, queue, CMS or new recurring hosting service in this
slice. Vercel serves published JSON files with the existing app.

## Run it

First inspect the strongest candidate without using AI or writing a file:

```sh
npm run story:dry-run
```

To scan only one or more cities:

```sh
node scripts/generate-story.mjs --dry-run --city toronto --city montreal
```

When the selection looks useful, choose one server-side authentication route:

- Set `OPENAI_API_KEY` for a direct Luna request. When this is present, it takes
  precedence over Vercel's automatic OIDC token.
- Or run through the linked Vercel project environment for AI Gateway:

```sh
vercel env run -- npm run story:generate
```

On a Vercel deployment, `VERCEL_OIDC_TOKEN` is supplied and refreshed
automatically. For local or CI work outside Vercel, `AI_GATEWAY_API_KEY` is an
optional Gateway fallback. None of these credentials is included in an article
or browser bundle.

## Publish a draft

Open the new file under `content/stories/`. Verify the prose line by line
against `evidence.days`, edit as needed, then change:

```json
{
  "status": "published",
  "publishedAt": "2026-09-07T14:30:00.000Z",
  "review": {
    "reviewer": "Editor name",
    "reviewedAt": "2026-09-07T14:20:00.000Z",
    "factsChecked": true,
    "sourceChecked": true,
    "linksChecked": true,
    "previewed": true
  }
}
```

Run `npm run story:audit` and `npm test` before merging. CI repeats the audit;
an incomplete review, publication after expiry, missing event evidence, unsafe
source URL or unredacted provider key blocks release. Draft slugs return a real
404, so an accidental link cannot leak unreviewed copy.

## Cost guardrail

The generator makes at most one Luna request per run. Vercel AI Gateway mirrors
the provider list price with no markup. At $0.20 per million input tokens and
$1.20 per million output tokens, a representative 2,500-input/900-output-token
story costs about $0.0016 USD. One such story every day would be roughly $0.05
USD per 31-day month. The generator records actual token usage and an estimated
per-draft cost in the JSON file.

Vercel Pro hosting and paid AI Gateway access are separate. A live check on
August 22, 2026 confirmed that `openai/gpt-5.6-luna` is restricted to teams
with purchased Gateway credits. Vercel documents a $5 monthly free-credit tier,
but the first credit purchase moves the team to pay-as-you-go and ends that
monthly credit. Keep auto top-up disabled until real usage justifies it.

Pricing can change, so re-check [Vercel AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)
and the [GPT-5.6 Luna Gateway page](https://vercel.com/ai-gateway/models/gpt-5.6-luna)
before budgeting at scale. `STORY_MODEL` makes the model replaceable without a
code change, but cost estimation is intentionally reported only for Luna.

## Before scheduling generation

Keep generation manual until several real drafts have been evaluated for
factuality, usefulness, tone and edit time. Open-Meteo's hosted free API is
explicitly non-commercial, and its terms classify an app with subscriptions or
advertising as commercial. Before WeatherView monetizes, switch every weather
call to a commercially permitted provider or plan and confirm that its terms
permit publication and retention of forecast snapshots. Free endpoint access,
the data's CC BY licence and the hosted API's usage terms are separate issues.

Once those checks pass, schedule this same command to create a draft pull
request. Keep publication as a separate human decision until the measured edit
and factual-error rates justify changing that boundary.

The current scheduled workflow is deliberately audit-only: it makes no weather
or AI request and writes no content. Candidate scanning and draft generation
remain manual until the commercial data rights in `docs/WEATHER_DATA.md` cover
both forecast display and retained editorial evidence.
