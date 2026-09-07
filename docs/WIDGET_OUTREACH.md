# Weather widget outreach pack

The widget stays genuinely tracking-free. Conversion is measured at the
organization level—qualified, contacted, replied, installed—not by adding
analytics, cookies, campaign IDs or referrer collection to the iframe.

## Before contacting anyone

Make a private working copy:

```sh
cp outreach/widget-targets.example.json outreach/widget-targets.local.json
```

For each target, record why the widget is relevant, the page it would improve,
the appropriate business-role contact, and the lawful basis for contacting
them. Do not scrape personal addresses or send a bulk sequence.

For Canadian recipients, review the CRTC's current
[CASL requirements](https://crtc.gc.ca/eng/internet/anti/reg.htm) before sending.
Commercial electronic messages generally require consent, sender identification
and contact details, and an unsubscribe mechanism. A conspicuously published
business address may support implied consent only when there is no no-contact
statement and the message is relevant to that person's business role; keep the
evidence because the sender bears the burden of proof. This checklist is not
legal advice.

## Qualification order

Start with ten individually reviewed organizations, in this order:

1. Campgrounds, marinas, paddling clubs and ski hills whose visitors plan around
   local conditions.
2. Cottage rentals, inns, golf courses and outdoor attractions with a practical
   visitor-information page.
3. Community associations, local event pages and small municipalities that
   maintain their own website.

Skip a site that already has a good forecast, has no maintained visitor page,
prohibits unsolicited contact, or has no clearly relevant role address.

## Initial note

Subject: `A free weather panel for [organization]`

> Hi [name],
>
> I noticed visitors to [specific page or activity] may want the [town]
> forecast before they arrive. I made a small panel already configured for it:
> https://www.weatherview.cloud/widget?city=[slug]&days=3&theme=auto
>
> It is free, needs no account or API key, sets no cookies, and carries no
> visitor analytics. If it is useful, the one-line embed is here:
> https://www.weatherview.cloud/widgets
>
> [Your full name / WeatherView]
> [Required mailing address]
> [Valid email, phone, or website]
>
> If you would rather not hear from me again, reply “no thanks” and I will not
> follow up.

Replace every bracket. The specific relevance sentence is mandatory; if it
cannot be written honestly, the target is not qualified.

## One follow-up

Send at most one follow-up, only when the original contact basis still applies:

> Hi [name] — one quick follow-up on the free [town] weather panel below. I can
> send a paste-ready snippet matched to the width and colours of [specific
> page]. If it is not useful, no action is needed and I will close the loop.
>
> [Identification, contact details and unsubscribe line]

Record any opt-out immediately as `do-not-contact`.

## Installation handoff

Before calling an install complete:

- Open the host page on desktop and mobile.
- Confirm the correct town, units, theme and 0–7-day layout.
- Confirm the full WeatherView and weather-provider credits remain visible.
- Confirm the frame does not clip after a refresh.
- Put the public page URL in `embedPageUrl` and mark the target `installed`.

## Reporting

The local ledger is ignored by Git. Generate the stage report with:

```sh
npm run widget:report
```

To re-fetch only the public pages listed in `embedPageUrl` and verify that a
WeatherView iframe or loader is still present:

```sh
npm run widget:report -- --verify
```

This check runs from the developer's machine and retains no response body. It
does not execute the host page, identify visitors, or change the widget. The
useful early metric is installed organizations divided by individually
contacted organizations; page views are intentionally outside this system.
