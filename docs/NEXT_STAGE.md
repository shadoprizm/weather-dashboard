# WeatherView next stage — October 8, 2026

Recommendation: improve the useful free product and measure real visitor behaviour before building accounts or adding a broad new feature set. The clearest promise is a fast forecast that helps someone decide when to be outside.

## Current evidence

Live production matched main commit f19046e at the start of this review. Both the Mac checkout and Astra's shared MacBook checkout were clean and on that commit; changes were prepared in an isolated worktree.

Google Search Console's selected three-month Web report showed 1,245 impressions, 9 clicks, 0.7% CTR and average position 23.8. Its available chart spanned August 18 through October 6. These are Google search figures, not total visitors. Other traffic sources and repeat visits could not be measured from the previously deployed client because its Web Analytics integration was still an unmerged PR.

The indexing report, last updated October 3, showed 153 indexed URLs and 453 exclusions: 446 discovered but not yet indexed, four soft 404s for homepage host/protocol variants, and three deliberate noindex URLs. There were zero crawled-but-not-indexed examples. The submitted sitemap was successful, last read October 2, with 600 discovered pages. Discovered-but-unindexed is not evidence of a penalty, and publishing hundreds more cities will not by itself solve it.

Pittsburgh radar had 185 impressions and one click, the most impressions among the leading landing pages shown. Google’s Generative AI report showed two impressions: Chicago hourly and Virginia Beach hourly. Other answer engines' citations and referrals remain unmeasured.

## This quality release

- Fix direct city radar and extended-forecast links adopting the wrong client tab. Previously a direct radar landing showed a selected Radar tab but no initialized map until the visitor changed tabs.
- Fix narrow-screen overflow in the hero and radar controls, and keep all five forecast tabs visible.
- Show the ending weekday on overnight planning windows.
- Use the next 24 hourly probabilities for next-24-hour precipitation answers, rather than a daily maximum that could include rain earlier that morning. Forecast-based briefing text no longer claims to have checked radar.
- Keep official US/Canadian warning coverage accurate when the secondary alert request times out.
- Give the homepage useful text and crawlable city links in its initial HTML. Search Console must recrawl before the existing soft-404 classification can be considered resolved.
- Add Vercel Web Analytics and aggregate events for tab use, saving locations, opening sharing and saving a device watch. Remove URL query parameters and fragments before sending measurements; no precise location or user-entered place names are event properties. Preview/local environments do not collect production analytics. Add a factual privacy page.
- Update vulnerable compatible dependency versions; the dependency audit reports zero known vulnerabilities.

## Next product work, in order

1. **Match the landing page to the search.** Radar and hourly visitors should reach the requested information immediately on a phone. Compact the current-conditions card on section pages while keeping active official alerts prominent. Measure successful map loads and forecast engagement, not only requests.
2. **Make Plan a reason to return.** Let visitors choose an activity and duration, then show a bounded two- or three-hour window with reasons: rain probability, temperature and wind. Explain the scoring and uncertainty; a 48-hour favourable stretch is not a useful running appointment. Save the preference on this device without an account.
3. **Measure the effect.** Inspect landing pages, referrers and feature events after enough real visits accumulate. Standard Vercel visitor identifiers expire after 24 hours, so do not claim precise seven-day retention from its unique-visitor chart. Any later return-visit measurement should be a disclosed local date bucket without a persistent visitor identifier.
4. **Improve pages that show demand.** Start with radar and hourly routes already earning impressions. Keep human-readable sources, timestamps, direct answers and meaningful internal links. Add new city pages only when evidence supports them. Do not promote empty Stories or generate interchangeable AI articles.
5. **Validate monitoring before monetizing it.** The current Watch beta runs only while this browser is open. Persistent monitoring and opt-in delivery could eventually justify paid accounts, but require useful real examples, reliable evaluation and completion of the existing commercial weather-data gates first.

## SEO and GEO assessment

The foundation is sound: 149 curated cities with server-rendered forecast sections, individual canonicals, a working sitemap, crawlable navigation, visible source-backed answers, structured data and permitted search-crawler access. The observed issues are discovery, homepage content, useful landing-page behaviour and limited authority/traffic, rather than missing special AI markup.

Google's current guidance says ordinary SEO fundamentals apply to generative search. Unique useful content and clear technical structure matter; special AI text files and special schema are not required. Eligibility does not guarantee a ranking or citation.

## Sources and live examples

- [Search performance](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aweatherview.cloud)
- [Indexing](https://search.google.com/search-console/index?resource_id=sc-domain%3Aweatherview.cloud)
- [Generative AI performance](https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Aweatherview.cloud)
- [Pittsburgh radar](https://www.weatherview.cloud/weather/pittsburgh/radar)
- [Toronto forecast and answers](https://www.weatherview.cloud/weather/toronto)
- [Weather guide](https://www.weatherview.cloud/weather-guide)
- [Google generative AI optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Vercel analytics privacy](https://vercel.com/docs/analytics/privacy-policy)
