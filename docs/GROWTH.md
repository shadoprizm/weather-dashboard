# WeatherView growth plan

A weather site has one advantage nothing else does: **the habit already exists.**
Nobody has to be convinced they need a forecast. They check one most days, from
a search box, and the only question is whose page they land on.

So this is not a plan to build an audience. It is a plan to take a small slice
of an existing behaviour and then stop needing search engines for it.

The three things that compound, in order:

1. **Search finds a page worth ranking** — hundreds of real city pages, each a
   complete answer, server-rendered.
2. **The page earns a share or an embed** — a card someone forwards, a widget
   someone pastes into their site.
3. **The visitor stops arriving through search** — a saved location, a home
   screen icon.

Everything below is either shipped, or a job for a person. Both are marked.

---

## What is shipped

| Strategy point | Status | Where it lives |
|---|---|---|
| Indexable city pages | ✅ Shipped | `/weather/{city}` + `/hourly`, `/10-day`, `/radar` — 149 cities, 599 URLs |
| Titles and H1s around `[City] Weather` | ✅ Shipped | `api/_lib/seo.js` |
| XML sitemap | ✅ Shipped | `/sitemap.xml`, generated from the catalogue |
| `robots.txt` | ✅ Shipped | `/robots.txt` |
| Server-readable content | ✅ Shipped | Full forecast in the first HTTP response, no JS required |
| Structured data | ✅ Shipped | Breadcrumb, Place, FAQ — all generated from what the page shows |
| Interpretation, not just data | ✅ Already existed | `js/insights.js` briefing, plus the Q&A block |
| Dynamic share cards | ✅ Shipped | `/api/og` (link previews) and the in-app Share button |
| Free embeddable widget | ✅ Shipped | `/widget`, `/embed.js`, builder at `/widgets` |
| Saved locations / return visits | ✅ Shipped | The ★ in the header, `s` on the keyboard |
| PWA / Add to Home Screen | ✅ Shipped | `manifest.webmanifest`, `sw.js`, a prompt that waits for a second visit |
| Search Console verification | 🔲 **You** | See below |
| Analytics | 🔲 **You** | See below |
| Social accounts and event posting | 🔲 **You** | See below |
| Weather newsroom | 🔲 **You** | See below |
| Push notifications | 🔲 Not built | Needs a subscription store and a cron; see *Deliberately not built* |
| Paid advertising | 🔲 Deliberately none | See *Where not to spend* |

---

## Do these four things this week

Nothing in the codebase can do them for you.

### 1. Verify the domain in Google Search Console

Use the **DNS** verification method, not an HTML file — it survives redeploys
and covers every subdomain.

Then submit the sitemap: `https://weatherview.cloud/sitemap.xml`

Do the same in [Bing Webmaster Tools](https://www.bing.com/webmasters), which
also feeds DuckDuckGo. It takes five minutes and doubles your coverage.

### 2. Watch the right report

In Search Console, the report that matters is **Pages → Indexed**, not
Performance. For the first month the question is not "how much traffic" but
"how many of the 599 URLs did Google actually accept". Expect it to climb over
weeks, not days, and expect it to plateau below 599 — that is normal.

If pages come back as *Crawled – currently not indexed*, the fix is never more
pages. It is making the ones you have better, or removing cities nobody
searches for.

### 3. Add analytics that answer one question

The metric is not visitors. It is:

> **How many people come back tomorrow?**

Vercel Web Analytics is one script tag and is privacy-preserving. Whatever you
use, build the funnel as:

```
search impression → city page → second page → return visit within 7 days
```

The last arrow is the only one that compounds. If it is flat, more traffic will
not help; the product has to.

### 4. Claim the names

`weatherview` on X, Bluesky, Threads, Instagram, Reddit, and a Facebook page.
Claim them before you need them, even if you post nothing for a month.

---

## The city catalogue

`api/_lib/cities.js` is the list of places that have pages. It is a curated
list on purpose.

**Why not every city on Earth?** Because that is the exact pattern search
engines treat as spam: hundreds of thousands of near-identical pages generated
to capture keyword variations. The dashboard already covers everywhere — you
can search any place on the planet — but a *published page* is a promise that
somebody looked at it.

**Phase 1 (shipped): 149 cities.** 50 Canadian, 79 US, 20 international.

**Phase 2: grow to ~500.** Add cities the way you would add features — because
something in Search Console says people are looking for them:

1. In Search Console, look at **Queries** with impressions but no matching page
   (`"<city> weather"` where you have no `/weather/<city>`).
2. Add the row to `api/_lib/cities.js`. Coordinates go in the city centre.
3. Ship. The sitemap, the directory, the widget's location list and the nearby
   links all pick it up automatically — there is nothing else to update.

**Phase 3: everywhere the data provider reaches.** Only worth doing once
Phase 2 pages are indexing and holding rankings. If Phase 2 pages are not
indexing, Phase 3 makes it worse, not better.

### Do not add a city that

- has no distinct forecast from one already listed (a suburb 8 km away);
- you cannot name a plausible searcher for;
- would make the directory page unreadable.

---

## Owning weather events

This is the highest-leverage unpaid channel, and it is entirely manual.

**Never post this:**

> Come check out my new weather website!

**Post this:**

> Ottawa could see thunderstorms between 4 and 8 PM today. Here's how the
> timing looks right now.
> [share card]

The difference: the first asks for attention, the second gives information and
happens to be sourced. Only the second gets shared.

### How to do it in under a minute

1. Open the city page — say `/weather/ottawa`.
2. Press the share button in the header. It renders the current conditions as a
   PNG and hands it to your OS share sheet (or saves it and copies the link).
3. Post the image with one sentence of timing. The link preview on the URL uses
   the same card, so the post carries it either way.

### Where

| Place | What works | What gets you removed |
|---|---|---|
| Local subreddits | Answering a storm thread with specific timing | Posting your link unprompted |
| Local Facebook groups | The same, in the comments | Any post that is mostly a link |
| X / Bluesky / Threads | Event timing with the card | Anything daily and routine |
| Community forums | Being the person who knows when it stops | Signature-link spam |

**The rule that keeps you welcome:** post about the *weather*, not about the
site, and only when the weather is worth posting about. A quiet Tuesday needs
no post. Two or three genuinely useful posts during a storm beat thirty
scheduled ones.

---

## Widget outreach

`/widgets` is the page; getting it installed is the work. Every install is a
link, a credit, and a stream of people who see the name repeatedly.

Best targets, roughly in order of how likely they are to say yes:

1. **Campgrounds, marinas, ski hills, golf courses** — weather *is* their
   business, and their sites are usually self-managed.
2. **Cottage and cabin rental sites** — guests check the forecast before
   arriving.
3. **Community associations and small municipalities** — often looking for
   useful content and unable to pay for it.
4. **Local blogs and event pages** — a festival page with a live forecast.
5. **Tourism boards** — slower, but a single install can be a strong link.

A cold email that works is short, specific, and already done:

> Subject: A free weather panel for the <name> site
>
> I built a small forecast widget and made one pointed at <their town>:
> https://weatherview.cloud/widget?city=<slug>
>
> If it is useful, it is one line to embed and it is free — no account, no key,
> no tracking, and it stays free. If not, no reply needed.
>
> — <you>

Send it with the widget already configured for *their* location. The thing that
makes this work is that they can see it working before they answer.

---

## The newsroom, if you do one

**Not 300 AI articles a day.** Mass-generated low-value pages are the single
fastest way to lose the rankings the city pages earn.

Two to five pieces, published only when the weather actually warrants:

- *Major snowstorm expected across Ontario Thursday*
- *Heat warning: temperatures approaching 38 °C in southern Ontario*
- *When will tonight's thunderstorms reach Chicago?*

Each one needs: a specific timing claim, a chart or radar image at least
1200 px wide, and a publish time close to when people start searching. That
combination is what Google Discover surfaces, and Discover can deliver more
traffic in a day than Search does in a month — sporadically, and never on
demand.

If you cannot write one that a local news desk would not be embarrassed by, do
not publish it. The city pages are worth more than a thin article is.

---

## Where not to spend

**Not on search ads for weather terms.** You would be bidding against The
Weather Network, AccuWeather and IBM for a click worth a fraction of a cent to
you and a lot to them. You will lose, expensively.

Spend instead on:

- making the pages faster than the competition (they are enormous; you are not);
- more cities, chosen from real query data;
- one genuinely good weather event post per storm.

---

## Deliberately not built

**Push notifications** ("notify me when rain is approaching"). This is the
right idea and the strategy is correct that it is where habit really forms. It
is not in this change because it needs infrastructure this project does not
have: a Web Push subscription store, VAPID keys, a cron function to evaluate
thresholds per subscriber, and a way to unsubscribe. That is a database and a
scheduled job, not a page. It is the obvious next build.

**A "weather decision engine" chat** ("Can I cut my lawn tonight?"). The
underlying answers already exist — `js/insights.js` scores every hour of the
next two days for eight activities, and the Q&A block on each city page answers
the five most common questions from the real forecast. A free-text interface on
top of that is a product decision with an ongoing per-query cost, so it is left
to you.

---

## First 30 days, as a checklist

**Week 1 — make it findable**
- [ ] Verify `weatherview.cloud` in Google Search Console (DNS method)
- [ ] Submit `/sitemap.xml`
- [ ] Same in Bing Webmaster Tools
- [ ] Add analytics; build the return-visitor funnel
- [ ] Claim the social handles

**Week 2 — make it spread**
- [ ] Post a weather event with a share card in one local community
- [ ] Send ten widget emails, each pre-configured for the recipient's town
- [ ] Write the launch post (below)

**Week 3 — measure and correct**
- [ ] Check Search Console: how many of the 599 URLs are indexed?
- [ ] Pull queries with impressions and no page → add those cities
- [ ] Check the return-visitor number. It is the only one that matters.

**Week 4 — deepen**
- [ ] Phase 2 cities from real query data
- [ ] Follow up on widget emails once, then stop
- [ ] Decide whether push notifications are the next build

### The launch post

Make it about the problem, not the product:

> Weather websites have become ridiculous.
>
> Ads. Popups. Autoplay video. A news story between you and the forecast. More ads.
>
> Sometimes you just want to know whether it is going to rain.
>
> So I built WeatherView. Fast, clean, no nonsense.
>
> weatherview.cloud

That claim is only worth making because the site delivers on it. It is worth
re-checking before you post: open a competitor on a phone, then open
`weatherview.cloud`. If the difference is not obvious in two seconds, fix that
before promoting anything.
