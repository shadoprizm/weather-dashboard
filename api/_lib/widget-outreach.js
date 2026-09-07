'use strict';

/**
 * Outreach conversion reporting without instrumenting widget visitors.
 *
 * The ledger records the owner's outreach stages. Optional verification reads
 * only the public page an organization says contains the embed and looks for a
 * WeatherView URL. It collects no visitor events, cookies, IP addresses or
 * referrers and sends nothing to the widget runtime.
 */

const STATUSES = new Set([
  'researching', 'qualified', 'contacted', 'replied', 'installed', 'declined', 'do-not-contact',
]);
const CONTACTED = new Set(['contacted', 'replied', 'installed', 'declined', 'do-not-contact']);
const RESPONDED = new Set(['replied', 'installed', 'declined', 'do-not-contact']);

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function assertLedger(ledger) {
  if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.targets)) {
    throw new Error('Widget outreach ledger must have version 1 and a targets array');
  }
  const ids = new Set();
  for (const target of ledger.targets) {
    if (!target.id || ids.has(target.id)) throw new Error(`Duplicate or missing target id: ${target.id || '(empty)'}`);
    ids.add(target.id);
    if (!target.organization) throw new Error(`${target.id} is missing organization`);
    if (!STATUSES.has(target.status)) throw new Error(`${target.id} has invalid status: ${target.status}`);
    if (!validUrl(target.website)) throw new Error(`${target.id} has an invalid website URL`);
    if (target.embedPageUrl && !validUrl(target.embedPageUrl)) {
      throw new Error(`${target.id} has an invalid embedPageUrl`);
    }
    if (CONTACTED.has(target.status) && !target.contactedAt) {
      throw new Error(`${target.id} is marked ${target.status} without contactedAt`);
    }
    if (CONTACTED.has(target.status) && !target.contactBasis) {
      throw new Error(`${target.id} is marked ${target.status} without a recorded contactBasis`);
    }
  }
  return ledger;
}

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function summarizeLedger(ledger) {
  assertLedger(ledger);
  const count = (predicate) => ledger.targets.filter(predicate).length;
  const contacted = count((target) => CONTACTED.has(target.status));
  const responded = count((target) => RESPONDED.has(target.status));
  const installed = count((target) => target.status === 'installed');
  return {
    campaign: ledger.campaign || null,
    targets: ledger.targets.length,
    qualified: count((target) => !['researching'].includes(target.status)),
    contacted,
    responded,
    installed,
    declined: count((target) => target.status === 'declined'),
    doNotContact: count((target) => target.status === 'do-not-contact'),
    responseRatePct: percentage(responded, contacted),
    installRatePct: percentage(installed, contacted),
  };
}

function containsWeatherViewEmbed(html) {
  return /(?:https?:)?\/\/(?:www\.)?weatherview\.cloud\/(?:widget(?:\?|["'])|embed\.js(?:[?"']))/i.test(String(html));
}

async function verifyInstallPages(ledger, { fetchImpl = fetch } = {}) {
  assertLedger(ledger);
  const results = [];
  for (const target of ledger.targets.filter((item) => item.embedPageUrl)) {
    try {
      const response = await fetchImpl(target.embedPageUrl, {
        headers: { 'User-Agent': 'WeatherView-Widget-Install-Audit/1.0 (+https://www.weatherview.cloud/widgets)' },
        redirect: 'follow',
      });
      const html = await response.text();
      results.push({
        id: target.id,
        organization: target.organization,
        url: target.embedPageUrl,
        reachable: response.ok,
        status: response.status,
        embedFound: response.ok && containsWeatherViewEmbed(html),
      });
    } catch (error) {
      results.push({
        id: target.id,
        organization: target.organization,
        url: target.embedPageUrl,
        reachable: false,
        status: null,
        embedFound: false,
        error: error.message,
      });
    }
  }
  return results;
}

module.exports = { STATUSES, assertLedger, summarizeLedger, containsWeatherViewEmbed, verifyInstallPages };
