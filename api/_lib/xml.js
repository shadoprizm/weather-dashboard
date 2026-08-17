'use strict';

/**
 * A deliberately small XML reader.
 *
 * Environment Canada's citypage warnings block is a handful of flat elements
 * with attributes, so a full parser would add ~100 KB to every serverless
 * function to solve a problem we do not have. This extracts elements and
 * attributes tolerantly and gives up quietly on anything it does not
 * understand, which is the right failure mode for third-party XML.
 *
 * Known limitation: `findTags` uses a non-greedy match, so it cannot handle an
 * element nested inside another of the SAME name. Nothing in the schemas we
 * read does that. Differently-named nesting is fine.
 */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
};

function decodeEntities(value) {
  if (!value) return '';
  return value
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (match) => ENTITIES[match])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripCdata(value) {
  if (!value) return '';
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * Collapse markup and whitespace down to a plain readable string.
 *
 * Order matters: strip tags BEFORE decoding entities. Decoding first would
 * turn `&lt;ok&gt;` into `<ok>` and the tag-stripper would then eat it, losing
 * text the document had deliberately escaped.
 */
function clean(value) {
  return decodeEntities(
    stripCdata(value || '').replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const ATTR_PATTERN = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttributes(raw) {
  const attributes = {};
  if (!raw) return attributes;

  let match;
  ATTR_PATTERN.lastIndex = 0;
  while ((match = ATTR_PATTERN.exec(raw)) !== null) {
    // Namespace prefixes are noise for our purposes: `cap:sent` -> `sent`.
    const name = match[1].includes(':') ? match[1].split(':').pop() : match[1];
    attributes[name] = decodeEntities(match[2] !== undefined ? match[2] : match[3]);
  }
  return attributes;
}

/**
 * Every occurrence of `<tag …>…</tag>` plus self-closing `<tag …/>`.
 * @returns {Array<{attributes: Object, inner: string, text: string}>}
 */
function findTags(xml, tagName) {
  if (!xml || !tagName) return [];
  const safe = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Optional namespace prefix, then either a paired or a self-closing element.
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${safe}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${safe}\\s*>)`,
    'gi'
  );

  const results = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const inner = match[2] === undefined ? '' : match[2];
    results.push({
      attributes: parseAttributes(match[1]),
      inner,
      text: clean(inner),
    });
  }
  return results;
}

/** The first matching element, or null. */
function findTag(xml, tagName) {
  const [first] = findTags(xml, tagName);
  return first || null;
}

/** Plain text of the first matching element, or ''. */
function textOf(xml, tagName) {
  const node = findTag(xml, tagName);
  return node ? node.text : '';
}

module.exports = { findTags, findTag, textOf, clean, decodeEntities, stripCdata };
