/**
 * Scraper: Magyar Közlöny (Hungarian Official Gazette)
 * Source: https://magyarkozlony.hu/feed (RSS)
 *
 * Strategy:
 *   - Fetch RSS feed (XML)
 *   - Parse items with year, serial number, type, PDF URL
 *   - Much more reliable than HTML scraping
 *
 * No auth required. Low bot-detection risk (public RSS feed).
 */

import { log } from 'apify';
import { normalizeText } from '../utils/helpers.js';
import { fetchText } from '../utils/http.js';
import { parseStringPromise } from 'xml2js';

const RSS_URL = 'https://magyarkozlony.hu/feed';

export async function scrapeMagyarKozlony({ max_items_per_source = 100, date_from = null, proxyUrl = null }) {
    const results = [];

    try {
        // Fetch RSS feed
        const xml = await fetchText(RSS_URL, {
            proxyUrl: proxyUrl || undefined,
            timeoutMs: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ApifyBot/1.0; +https://apify.com/bots)',
                'Accept': 'application/xml,text/xml,application/rss+xml',
            },
        });

        if (!xml) {
            log.warning('Magyar Közlöny: Could not fetch RSS feed');
            return results;
        }

        // Parse XML
        const parsed = await parseStringPromise(xml, { explicitArray: false });
        const items = parsed?.rss?.channel?.item || [];
        
        log.info(`Magyar Közlöny: Found ${items.length} items in RSS feed`);

        // Process each item
        for (const item of items) {
            if (max_items_per_source > 0 && results.length >= max_items_per_source) break;

            try {
                const result = parseRssItem(item, date_from);
                if (result) {
                    results.push(result);
                }
            } catch (err) {
                log.warning(`Magyar Közlöny: Failed to parse RSS item`, { error: err.message });
            }
        }

    } catch (err) {
        log.error('Magyar Közlöny scraping failed', { error: err.message });
    }

    log.info(`Magyar Közlöny: ${results.length} items fetched`);
    return results;
}

function parseRssItem(item, date_from) {
    // Extract fields
    const title = normalizeText(item.title);
    const url = item.link;
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;
    
    // Custom mag: namespace fields
    const year = item['mag:year'];
    const serial = item['mag:serial'];
    const type = item['mag:type'];
    
    // PDF URL from enclosure
    const pdf_url = item.enclosure?.['$']?.url || null;

    // Build issue number
    const issue_number = year && serial ? `${year}/${serial}` : null;

    // Published date in YYYY-MM-DD format
    const published_date = pubDate ? pubDate.toISOString().split('T')[0] : null;

    // Filter by date_from if provided
    if (date_from && published_date && published_date < date_from) {
        return null;
    }

    return {
        source: 'magyar_kozlony',
        source_label: 'Magyar Közlöny',
        issue_number,
        title,
        event_type: type || null,
        published_date,
        url,
        pdf_url,
        id: generateId({ issue_number, title }),
        scraped_at: new Date().toISOString(),
    };
}

function generateId(fields) {
    const raw = `magyar_kozlony-${fields.issue_number}-${fields.title}`;
    return Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}
