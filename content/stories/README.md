# Weather story content

`npm run story:generate` writes one JSON draft into this directory. JSON files
are content, not runtime cache: keep them in Git so every edit and publishing
decision is reviewable.

A draft is never served publicly. To publish one:

1. Check every factual sentence against `evidence.days` and the linked source.
2. Edit the copy where needed without changing the evidence block.
3. Record the named reviewer, review time, and all four completed review checks
   in `review` (facts, source, links and local preview).
4. Change `status` from `draft` to `published` and set `publishedAt` to an ISO
   8601 timestamp no earlier than `reviewedAt`.
5. Run `npm run story:audit` and `npm test`, then merge the change.

After `expiresAt`, the URL remains available as an archived forecast snapshot,
but it becomes `noindex` and leaves the story index and sitemap automatically.
Set `status` to `archived` to remove a story immediately.

An active reviewed story is linked only from its matching city forecast, the
story index and the sitemap. No active story means no story link in the city,
no story URLs in the sitemap, and a `noindex` story index. Stories never occupy
the permanent top navigation.
