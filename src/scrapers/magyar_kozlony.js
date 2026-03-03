/**
 * Scraper: Magyar Közlöny (Hungarian Official Gazette)
 * Source: https://magyarkozlony.hu/
 *
 * Strategy:
 *   - Fetch the main listing page (HTML) to get the latest issues
 *   - For each issue, extract: issue number, date, title list, PDF URL, TOC items
 *   - Parse document titles to detect type (rendelet, törvény, határozat, etc.)
 *
 * No auth required. Low bot-detection risk (public government site).
 */

import fetch from 'node-fetch';
import { log } from 'apify';
import { parseDate, normalizeText, extractDocumentType } from '../utils/helpers.js';

const BASE_URL = 'https://magyarkozlony.hu';
const LISTING_URL = `${BASE_URL}/`;

// CSS selectors for the listing page
const ISSUE_LINK_PATTERN = /\/hivatalos-lapok\/[A-Za-z0-9]+/;

export async function scrapeMagyarKozlony({ max_items_per_source = 100, date_from = null }) {
    const results = [];

    // Step 1: Fetch main listing page
    const html = await fetchHTML(LISTING_URL);
    if (!html) {
        log.warning('Magyar Közlöny: Could not fetch listing page');
        return results;
    }

    // Step 2: Extract issue links from the listing
    const issueLinks = extractIssueLinks(html);
    log.info(`Magyar Közlöny: Found ${issueLinks.length} issues on listing page`);

    // Step 3: For each issue, fetch details
    let count = 0;
    for (const issueLink of issueLinks) {
        if (max_items_per_source > 0 && count >= max_items_per_source) break;

        try {
            const issueUrl = `${BASE_URL}${issueLink}`;
            const issueHtml = await fetchHTML(issueUrl);
            if (!issueHtml) continue;

            const items = parseIssueItems(issueHtml, issueUrl, date_from);
            for (const item of items) {
                if (max_items_per_source > 0 && count >= max_items_per_source) break;
                results.push(item);
                count++;
            }
        } catch (err) {
            log.warning(`Magyar Közlöny: Failed to parse issue ${issueLink}`, { error: err.message });
        }

        // Polite delay
        await sleep(300);
    }

    return results;
}

function extractIssueLinks(html) {
    const links = [];
    // Match all issue hrefs — pattern: /hivatalos-lapok/{id}
    const regex = /href="(\/hivatalos-lapok\/[A-Za-z0-9_\-]+)"/g;
    let match;
    const seen = new Set();
    while ((match = regex.exec(html)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            links.push(match[1]);
        }
    }
    return links.slice(0, 15); // Max 15 recent issues per run
}

function parseIssueItems(html, issueUrl, date_from) {
    const items = [];

    // Extract issue number and year
    const issueMatch = html.match(/(\d{4})\.\s*évi\s*(\d+)\.\s*szám/);
    const year   = issueMatch ? issueMatch[1] : null;
    const number = issueMatch ? issueMatch[2] : null;

    // Extract issue date
    const dateMatch = html.match(/(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s*(\d{1,2})\./i);
    const published_date = dateMatch ? parseHungarianDate(dateMatch[0]) : null;

    // Skip if before date_from
    if (date_from && published_date && published_date < date_from) return items;

    // Extract PDF download link
    const pdfMatch = html.match(/href="([^"]*letoltes[^"]*)"/i);
    const pdf_url = pdfMatch ? `${BASE_URL}${pdfMatch[1]}` : null;

    // Extract individual document titles from TOC
    // Documents appear as list items with title + type classification
    const docRegex = /class="[^"]*cim[^"]*"[^>]*>([^<]+)</gi;
    let docMatch;
    const docTitles = [];
    while ((docMatch = docRegex.exec(html)) !== null) {
        const title = normalizeText(docMatch[1]);
        if (title && title.length > 5) docTitles.push(title);
    }

    // Fallback: extract all <h2> and <h3> as document titles
    if (docTitles.length === 0) {
        const hRegex = /<h[23][^>]*>([^<]{10,200})<\/h[23]>/gi;
        while ((match = hRegex.exec(html)) !== null) {
            docTitles.push(normalizeText(match[1]));
        }
    }

    // Build one item per document in this issue
    if (docTitles.length > 0) {
        for (const title of docTitles) {
            items.push(buildItem({
                source:          'magyar_kozlony',
                source_label:    'Magyar Közlöny',
                issue_number:    number ? `${year}/${number}` : null,
                title,
                event_type:      extractDocumentType(title),
                published_date:  published_date ?? `${year}-01-01`,
                url:             issueUrl,
                pdf_url,
            }));
        }
    } else {
        // If no individual titles found, push one item for the whole issue
        items.push(buildItem({
            source:         'magyar_kozlony',
            source_label:   'Magyar Közlöny',
            issue_number:   number ? `${year}/${number}` : null,
            title:          `Magyar Közlöny ${year}. évi ${number}. szám`,
            event_type:     null,
            published_date: published_date ?? `${year}-01-01`,
            url:            issueUrl,
            pdf_url,
        }));
    }

    return items;
}

function parseHungarianDate(dateStr) {
    const months = {
        'január': '01', 'február': '02', 'március': '03', 'április': '04',
        'május': '05', 'június': '06', 'július': '07', 'augusztus': '08',
        'szeptember': '09', 'október': '10', 'november': '11', 'december': '12',
    };
    const m = dateStr.match(/(\d{4})\.\s*(\w+)\s*(\d{1,2})\./i);
    if (!m) return null;
    const month = months[m[2].toLowerCase()];
    if (!month) return null;
    return `${m[1]}-${month}-${m[3].padStart(2, '0')}`;
}

async function fetchHTML(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ApifyBot/1.0; +https://apify.com/bots)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.5',
            },
            timeout: 30000,
        });
        if (!response.ok) {
            log.warning(`HTTP ${response.status} for ${url}`);
            return null;
        }
        return await response.text();
    } catch (err) {
        log.warning(`Fetch failed: ${url}`, { error: err.message });
        return null;
    }
}

function buildItem(fields) {
    return {
        ...fields,
        id: generateId(fields),
        scraped_at: new Date().toISOString(),
    };
}

function generateId(fields) {
    const raw = `${fields.source}-${fields.issue_number}-${fields.title}`;
    return Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
