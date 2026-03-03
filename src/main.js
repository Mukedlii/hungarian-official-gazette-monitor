/**
 * Hungarian Official Gazette Monitor
 * Apify Actor — main.js
 *
 * Sources:
 *   1. Magyar Közlöny   – magyarkozlony.hu  (HTML listing + RSS)
 *   2. Cégközlöny       – e-cegjegyzek.hu   (HTML search)
 *   3. Pályázati Portál – palyazat.gov.hu   (RSS feed)
 */

import { Actor, log } from 'apify';
import { scrapeMagyarKozlony } from './scrapers/magyar_kozlony.js';
import { scrapeCegkozlony }    from './scrapers/cegkozlony.js';
import { scrapePalyazat }      from './scrapers/palyazat.js';
import { sendWebhook }         from './utils/webhook.js';
import { filterItems }         from './utils/filter.js';
import { deduplicateItems }    from './utils/dedup.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
    sources             = ['magyar_kozlony', 'cegkozlony', 'palyazati_portal'],
    keywords            = [],
    cegkozlony_event_types = [],
    delta_mode          = true,
    max_items_per_source = 100,
    date_from           = null,
    output_language     = 'en',
    webhook_url         = null,
    // If true, use Apify Proxy for requests. Useful when sites block Apify data center IPs.
    // NOTE: Free plan typically doesn't include RESIDENTIAL proxies.
    use_apify_proxy     = false,
    apify_proxy_groups  = ['RESIDENTIAL'],
} = input;

const proxyConfiguration = use_apify_proxy
  ? await Actor.createProxyConfiguration({ groups: apify_proxy_groups })
  : null;

const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : null;

log.info('Hungarian Official Gazette Monitor starting', {
    sources,
    keywords,
    delta_mode,
    date_from,
});

const dataset = await Actor.openDataset();
const kvStore = await Actor.openKeyValueStore();

let allResults = [];

// ─── 1. Magyar Közlöny ───────────────────────────────────────────────────────
if (sources.includes('magyar_kozlony')) {
    log.info('Scraping Magyar Közlöny...');
    try {
        const items = await scrapeMagyarKozlony({ max_items_per_source, date_from, proxyUrl });
        log.info(`Magyar Közlöny: ${items.length} raw items fetched`);
        allResults.push(...items);
    } catch (err) {
        log.error('Magyar Közlöny scrape failed', { error: err.message });
    }
}

// ─── 2. Cégközlöny ───────────────────────────────────────────────────────────
if (sources.includes('cegkozlony')) {
    log.info('Scraping Cégközlöny...');
    try {
        const items = await scrapeCegkozlony({
            max_items_per_source,
            date_from,
            event_types: cegkozlony_event_types,
            proxyUrl,
        });
        log.info(`Cégközlöny: ${items.length} raw items fetched`);
        allResults.push(...items);
    } catch (err) {
        log.error('Cégközlöny scrape failed', { error: err.message });
    }
}

// ─── 3. Pályázati Portál ─────────────────────────────────────────────────────
if (sources.includes('palyazati_portal')) {
    log.info('Scraping Pályázati Portál RSS...');
    try {
        const items = await scrapePalyazat({ max_items_per_source, date_from, proxyUrl });
        log.info(`Pályázati Portál: ${items.length} raw items fetched`);
        allResults.push(...items);
    } catch (err) {
        log.error('Pályázati Portál scrape failed', { error: err.message });
    }
}

// ─── Filter by keywords ───────────────────────────────────────────────────────
if (keywords.length > 0) {
    const before = allResults.length;
    allResults = filterItems(allResults, keywords);
    log.info(`Keyword filter: ${before} → ${allResults.length} items`);
}

// ─── Delta deduplication ──────────────────────────────────────────────────────
let newItems = allResults;
if (delta_mode) {
    const { newItems: deduped, seenCount } = await deduplicateItems(allResults, kvStore);
    log.info(`Delta dedup: ${allResults.length} total → ${deduped.length} new (${seenCount} already seen)`);
    newItems = deduped;
}

// ─── Translate field names if English requested ───────────────────────────────
if (output_language === 'en') {
    newItems = newItems.map(translateToEnglish);
}

// ─── Save to dataset ──────────────────────────────────────────────────────────
log.info(`Saving ${newItems.length} items to dataset`);
for (const item of newItems) {
    await dataset.pushData(item);
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
if (webhook_url && newItems.length > 0) {
    log.info(`Sending webhook to ${webhook_url}`);
    try {
        await sendWebhook(webhook_url, newItems);
    } catch (err) {
        log.error('Webhook delivery failed', { error: err.message });
    }
}

log.info(`✅ Done. ${newItems.length} new items saved.`);

await Actor.exit();

// ─── Helper: translate field names to English ─────────────────────────────────
function translateToEnglish(item) {
    const eventTypeMap = {
        'felszámolás':        'liquidation',
        'végelszámolás':      'voluntary_liquidation',
        'csődeljárás':        'bankruptcy',
        'cégbejegyzés':       'company_registration',
        'törlés':             'deletion',
        'változásbejegyzés':  'change_registration',
        'végrehajtás':        'enforcement',
        'rendelet':           'decree',
        'törvény':            'act',
        'határozat':          'resolution',
        'közlemény':          'announcement',
        'pályázat':           'grant',
        'felhívás':           'call_for_applications',
    };

    return {
        ...item,
        event_type: item.event_type
            ? (eventTypeMap[item.event_type.toLowerCase()] ?? item.event_type)
            : null,
    };
}
