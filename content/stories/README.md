# Weather story content

`npm run story:generate` writes one JSON draft into this directory. JSON files
are content, not runtime cache: keep them in Git so every edit and publishing
decision is reviewable.

A draft is never served publicly. To publish one:

1. Check every factual sentence against `evidence.days` and the linked source.
2. Edit the copy where needed without changing the evidence block.
3. Change `status` from `draft` to `published`.
4. Set `publishedAt` to an ISO 8601 timestamp, such as
   `2026-08-22T14:30:00.000Z`.
5. Run `npm test`, review the rendered page locally, and merge the change.

After `expiresAt`, the URL remains available as an archived forecast snapshot,
but it becomes `noindex` and leaves the story index and sitemap automatically.
Set `status` to `archived` to remove a story immediately.
