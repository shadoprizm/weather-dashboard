# WeatherView 2.3 — planning and organic discovery

WeatherView is an existing public app; this is an update, not its initial launch.

Promise: **Weather that helps you make plans.** Supporting copy: See what’s coming. Find a good time to get outside. Check the radar before you go.

## Visitor path

The forecast remains available. A visible preview uses the existing 48-hour planner, device preferences and current location. Find a time opens the planner. A selected result can be shared or downloaded as a calendar file. Shared planning links restore activity, duration and time of day and recalculate current suggestions; no expired window is restored. Snapshot images and calendar files do not update.

Public pages: `/outdoor-planning` explains walks, runs, cycling and gardening; `/launch` supplies the demonstration and three downloadable promotional images. Both appear in the sitemap and footer. City pages render a planning preview on the server.

## Measurement

Events: Planning CTA, Planning entered, Planning results (hasResults/status and choices), Plan calendar (download initiated, not proof of calendar import), Plan shared (native completion, clipboard copy or download initiated; cancelled shares excluded).

Campaign source is attached only for the predefined values launch, hackernews and reddit with campaign=planning. Page URLs omit all query parameters and hashes. Events exclude coordinates, city names, search text, plan times and individual identifiers. Result events are deduplicated per forecast/location/preferences in the current session; they are not a unique-person conversion rate.

Pre-release dashboard baseline, October 10: last 7 days 11 visitors, 30 page views, 45% bounce. Search Console overview: 9 total web search clicks, 153 indexed and 453 not indexed pages; report windows differ. These totals include possible owner/test traffic. The Vercel connector queries returned 404; figures were read from the authenticated dashboard, not inferred as zero.

## Distribution

No paid advertising or Reddit account dependency. Public demonstration and assets are owned distribution. Show HN submission is conditional on an existing authorized account, no duplicate prior launch and current rules. Never create an account, send email or invent a successful submission to satisfy a deadline.

Suggested Show HN title: Show HN: WeatherView — find a time for outdoor plans, free and ad-free

Destination URL: https://www.weatherview.cloud/?view=plan&utm_source=hackernews&utm_medium=community&utm_campaign=planning

Opening comment: I built WeatherView to make weather more useful for everyday plans. Choose an activity and how long you need, and it suggests suitable times over the next 48 hours, with the rain chance, wind and feels-like temperature behind each suggestion. It is free, ad-free and works without an account. You can also check recent and projected radar where coverage is available. Does it help you make a decision, and what would make you come back?

Search rankings, inclusion in AI answers and community acceptance are outcomes to observe, not release acceptance criteria. Apple submission and the Astra Devs Reddit presence remain separate work.
