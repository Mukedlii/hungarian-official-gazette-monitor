/**
 * Scraper: Pályázati Portál (Hungarian Grant Portal)
 * Source: https://www.palyazat.gov.hu/
 *
 * Strategy:
 *   - Fetch RSS feed(s) from palyazat.gov.hu
 *   - Parse grant titles, deadlines, target groups, funding amounts
 *   - Output clean structured data per grant item
 */

import { parseStringPromise } from 'xml2js';
import { log } from 'apify';
import { normalizeText, stripHTML } from '../utils/helpers.js';
import { fetchText } from '../utils/http.js';

const RSS_URLS = [
    'https://www.palyazat.gov.hu/rss.php',
    'https://www.palyazat.gov.hu/feed',
    'https://www.palyazat.gov.hu/?rss',
];

export async function scrapePalyazat({ max_items_per_source = 100, date_from = null, proxyUrl = null }) {
    const results = [];

    // Try each RSS URL until one works
    for (const rssUrl of RSS_URLS) {
        log.info(`Pályázati Portál: Trying RSS at ${rssUrl}`);
        const items = await fetchRSSItems(rssUrl, max_items_per_source, date_from, proxyUrl);
        if (items.length > 0) {
            log.info(`Pályázati Portál: Got ${items.length} items from ${rssUrl}`);
            results.push(...items);
            break;
        }
    }

    // Fallback: scrape HTML listing if RSS fails
    if (results.length === 0) {
        log.info('Pályázati Portál: RSS failed, falling back to HTML scrape');
        const htmlItems = await scrapePalyazatHTML(max_items_per_source, date_from, proxyUrl);
        results.push(...htmlItems);
    }

    return results;
}

async function fetchRSSItems(rssUrl, maxItems, date_from, proxyUrl) {
    const items = [];
    try {
        const xml = await fetchText(rssUrl, {
            proxyUrl: proxyUrl || undefined,
            timeoutMs: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ApifyBot/1.0; +https://apify.com/bots)',
                'Accept': 'application/rss+xml, application/xml, text/xml',
            },
        });

        if (!xml) return items;
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        const channel = parsed?.rss?.channel ?? parsed?.feed;
        if (!channel) return items;

        const entries = channel.item ?? channel.entry ?? [];
        const entryList = Array.isArray(entries) ? entries : [entries];

        let count = 0;
        for (const entry of entryList) {
            if (maxItems > 0 && count >= maxItems) break;

            const title       = normalizeText(entry.title ?? entry['a10:title'] ?? '');
            const link        = entry.link ?? entry.guid ?? '';
            const description = stripHTML(entry.description ?? entry.summary ?? entry['content:encoded'] ?? '');
            const pub_date    = entry.pubDate ?? entry.published ?? entry.updated ?? null;
            const published_date = pub_date ? formatDate(pub_date) : null;

            if (date_from && published_date && published_date < date_from) continue;
            if (!title) continue;

            // Extract grant-specific fields
            const amount    = extractAmount(description);
            const deadline  = extractDeadline(description);
            const category  = extractCategory(title, description);

            items.push({
                source:         'palyazati_portal',
                source_label:   'Pályázati Portál',
                issue_number:   null,
                title,
                event_type:     'pályázat',
                description:    description.substring(0, 500),
                category,
                funding_amount: amount,
                deadline,
                published_date,
                url:            typeof link === 'object' ? link._ ?? '' : link,
                pdf_url:        null,
                id:             generateId(link, title),
                scraped_at:     new Date().toISOString(),
            });
            count++;
        }
    } catch (err) {
        log.debug(`RSS parse failed for ${rssUrl}: ${err.message}`);
    }

    return items;
}

async function scrapePalyazatHTML(maxItems, date_from, proxyUrl) {
    const items = [];
    const BASE = 'https://www.palyazat.gov.hu';
    const LISTING = `${BASE}/palyazatok`;

    try {
        const html = await fetchText(LISTING, {
            proxyUrl: proxyUrl || undefined,
            timeoutMs: 25000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ApifyBot/1.0; +https://apify.com/bots)',
                'Accept-Language': 'hu-HU,hu;q=0.9',
            },
        });
        if (!html) return items;

        // Parse grant listing items
        const linkRegex = /href="(\/palyazat\/[^"]+)"/gi;
        const titleRegex = /<(?:h[1-4]|a)[^>]*>([^<]{10,150})<\/(?:h[1-4]|a)>/gi;

        const links  = [...html.matchAll(linkRegex)].map(m => m[1]);
        const titles = [...html.matchAll(titleRegex)].map(m => normalizeText(m[1]));

        let count = 0;
        for (let i = 0; i < Math.min(links.length, titles.length, maxItems || 999); i++) {
            const title = titles[i];
            const url   = `${BASE}${links[i]}`;
            if (!title || title.length < 5) continue;

            items.push({
                source:         'palyazati_portal',
                source_label:   'Pályázati Portál',
                issue_number:   null,
                title,
                event_type:     'pályázat',
                description:    null,
                category:       extractCategory(title, ''),
                funding_amount: null,
                deadline:       null,
                published_date: null,
                url,
                pdf_url:        null,
                id:             generateId(url, title),
                scraped_at:     new Date().toISOString(),
            });
            count++;
            if (maxItems > 0 && count >= maxItems) break;
        }
    } catch (err) {
        log.warning(`Pályázati Portál HTML fallback failed: ${err.message}`);
    }

    return items;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractAmount(text) {
    // Match Hungarian amount patterns: "500 millió", "2 milliárd", "100 000 000 Ft"
    const patterns = [
        /(\d[\d\s]*)\s*milliárd\s*(?:forint|Ft)?/i,
        /(\d[\d\s]*)\s*millió\s*(?:forint|Ft)?/i,
        /(\d[\d\s,\.]+)\s*(?:forint|Ft)\b/i,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[0].trim();
    }
    return null;
}

function extractDeadline(text) {
    // Match date patterns in descriptions: "2025. március 31." or "2025-03-31"
    const m = text.match(/(\d{4}[-\.]\s*\w+[-\.]\s*\d{1,2}\.?)/);
    return m ? m[1].trim() : null;
}

function extractCategory(title, desc) {
    const combined = `${title} ${desc}`.toLowerCase();
    if (combined.includes('kkv') || combined.includes('kis- és középvállalkozás')) return 'KKV';
    if (combined.includes('önkormányzat')) return 'önkormányzat';
    if (combined.includes('oktatás') || combined.includes('képzés')) return 'oktatás';
    if (combined.includes('egészség')) return 'egészségügy';
    if (combined.includes('energia') || combined.includes('megújuló')) return 'energia';
    if (combined.includes('vidékfejlesztés') || combined.includes('agrár')) return 'agrár';
    if (combined.includes('digitalizáció') || combined.includes('informatika')) return 'digitalizáció';
    return 'egyéb';
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    } catch { return null; }
}

function generateId(url, title) {
    const raw = `palyazat-${url}-${title}`;
    return Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}
