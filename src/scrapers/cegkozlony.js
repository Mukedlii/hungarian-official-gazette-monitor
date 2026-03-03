/**
 * Scraper: Cégközlöny (Hungarian Company Gazette)
 * Source: https://www.e-cegjegyzek.hu/
 *
 * Strategy:
 *   - Fetch latest Cégközlöny issues listing
 *   - Parse company events: felszámolás, végelszámolás, csőd, cégbejegyzés, törlés, etc.
 *   - Output: company name, tax/registration number (if visible), event type, date, URL
 *
 * Note: e-cegjegyzek.hu serves structured HTML with minimal JS; low anti-bot risk.
 */

import { log } from 'apify';
import { normalizeText, stripHTML } from '../utils/helpers.js';
import { fetchText } from '../utils/http.js';

const BASE_URL = 'https://www.e-cegjegyzek.hu';

// Cégközlöny is published on the same domain under /cegkozlony
const CEGKOZLONY_URL = `${BASE_URL}/?cegkozlony`;

// Known event type keywords (Hungarian)
const EVENT_TYPE_PATTERNS = [
    { pattern: /felszámolás/i,       type: 'felszámolás' },
    { pattern: /végelszámolás/i,     type: 'végelszámolás' },
    { pattern: /csőd/i,              type: 'csődeljárás' },
    { pattern: /cégbejegyzés/i,      type: 'cégbejegyzés' },
    { pattern: /törlés/i,            type: 'törlés' },
    { pattern: /változásbejegyzés/i, type: 'változásbejegyzés' },
    { pattern: /végrehajtás/i,       type: 'végrehajtás' },
    { pattern: /hirdetmény/i,        type: 'hirdetmény' },
];

export async function scrapeCegkozlony({ max_items_per_source = 100, date_from = null, event_types = [], proxyUrl = null }) {
    const results = [];

    // Fetch the Cégközlöny listing
    const html = await fetchHTML(CEGKOZLONY_URL, proxyUrl);
    if (!html) {
        log.warning('Cégközlöny: Could not fetch listing page. Trying alternative URL...');
        return await scrapeCegkozlonyAlternative({ max_items_per_source, date_from, event_types, proxyUrl });
    }

    // Extract issue links
    const issueLinks = extractCegkozlonyIssueLinks(html);
    log.info(`Cégközlöny: Found ${issueLinks.length} recent issues`);

    let count = 0;
    for (const link of issueLinks) {
        if (max_items_per_source > 0 && count >= max_items_per_source) break;

        try {
            const issueUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
            const issueHtml = await fetchHTML(issueUrl, proxyUrl);
            if (!issueHtml) continue;

            const items = parseCegkozlonyIssue(issueHtml, issueUrl, date_from, event_types);
            for (const item of items) {
                if (max_items_per_source > 0 && count >= max_items_per_source) break;
                results.push(item);
                count++;
            }
        } catch (err) {
            log.warning(`Cégközlöny: Failed to parse ${link}`, { error: err.message });
        }

        await sleep(400);
    }

    return results;
}

// Fallback: Use Cégközlöny PDF listing from kozlonyok.hu
async function scrapeCegkozlonyAlternative({ max_items_per_source, date_from, event_types, proxyUrl }) {
    const results = [];
    const ALT_URL = 'https://www.kozlonyok.hu/nkonline/index.php?pageindex=0400';

    const html = await fetchHTML(ALT_URL, proxyUrl);
    if (!html) return results;

    // Extract year links, use current year
    const year = new Date().getFullYear();
    const yearUrl = `${ALT_URL}&ev=${year}`;
    const yearHtml = await fetchHTML(yearUrl, proxyUrl);
    if (!yearHtml) return results;

    // Parse issue rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let count = 0;

    while ((rowMatch = rowRegex.exec(yearHtml)) !== null) {
        if (max_items_per_source > 0 && count >= max_items_per_source) break;
        const row = rowMatch[1];

        // Extract link and title from each row
        const linkMatch = row.match(/href="([^"]+)"/i);
        const titleMatch = row.match(/>([^<]{5,100})</);
        const dateMatch = row.match(/(\d{4})\.\s*\w+\s*\d{1,2}/);

        if (!linkMatch || !titleMatch) continue;

        const title = normalizeText(titleMatch[1]);
        if (!title.toLowerCase().includes('cégközlöny')) continue;

        const url = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://www.kozlonyok.hu${linkMatch[1]}`;
        const published_date = dateMatch ? dateMatch[0].trim() : null;

        if (date_from && published_date && published_date < date_from) continue;

        const event_type = detectEventType(title, event_types);

        results.push({
            source:         'cegkozlony',
            source_label:   'Cégközlöny',
            issue_number:   null,
            company_name:   null,
            tax_number:     null,
            reg_number:     null,
            title,
            event_type,
            published_date,
            url,
            pdf_url:        url,
            id:             generateId('cegkozlony', url, title),
            scraped_at:     new Date().toISOString(),
        });
        count++;
    }

    return results;
}

function extractCegkozlonyIssueLinks(html) {
    const links = [];
    const regex = /href="([^"]*cegkozlony[^"]*)"/gi;
    let match;
    const seen = new Set();
    while ((match = regex.exec(html)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            links.push(match[1]);
        }
    }
    return links.slice(0, 10);
}

function parseCegkozlonyIssue(html, issueUrl, date_from, event_types) {
    const items = [];

    // Extract date
    const dateMatch = html.match(/(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s*(\d{1,2})/i);
    const published_date = dateMatch ? dateMatch[0].trim() : null;
    if (date_from && published_date && published_date < date_from) return items;

    // Each company entry is typically in a div or table row
    // Parse company name + event type from structured blocks
    const blockRegex = /<(?:div|tr)[^>]*>([\s\S]{20,500}?)<\/(?:div|tr)>/gi;
    let blockMatch;

    while ((blockMatch = blockRegex.exec(html)) !== null) {
        const block = blockMatch[1];
        const text  = stripHTML(block);

        if (!text || text.length < 10) continue;

        // Try to find tax number (adószám): 8-digit-1digit-2digit pattern
        const taxMatch = text.match(/\b(\d{8}-\d-\d{2})\b/);
        const tax_number = taxMatch ? taxMatch[1] : null;

        // Cég reg number: Cg. XX-YY-ZZZZZZ
        const regMatch = text.match(/Cg\.\s*(\d{2}-\d{2}-\d{6})/i);
        const reg_number = regMatch ? regMatch[1] : null;

        const event_type = detectEventType(text, event_types);
        if (!event_type && event_types.length > 0) continue;

        // Extract company name — usually in bold or first line
        const companyMatch = text.match(/^(.{5,80}?)(?:\n|Cg\.|\badószám\b)/i);
        const company_name = companyMatch ? normalizeText(companyMatch[1]) : null;

        if (!tax_number && !reg_number && !event_type) continue;

        items.push({
            source:         'cegkozlony',
            source_label:   'Cégközlöny',
            issue_number:   null,
            company_name,
            tax_number,
            reg_number,
            title:          company_name ?? normalizeText(text.substring(0, 80)),
            event_type,
            published_date,
            url:            issueUrl,
            pdf_url:        null,
            id:             generateId('cegkozlony', issueUrl, text.substring(0, 50)),
            scraped_at:     new Date().toISOString(),
        });
    }

    return items;
}

function detectEventType(text, filterTypes) {
    for (const { pattern, type } of EVENT_TYPE_PATTERNS) {
        if (pattern.test(text)) {
            if (filterTypes.length === 0 || filterTypes.includes(type)) {
                return type;
            }
        }
    }
    return filterTypes.length > 0 ? null : 'egyéb';
}

async function fetchHTML(url, proxyUrl) {
    return await fetchText(url, {
        proxyUrl: proxyUrl || undefined,
        timeoutMs: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ApifyBot/1.0; +https://apify.com/bots)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'hu-HU,hu;q=0.9',
        },
    });
}

function generateId(source, url, title) {
    const raw = `${source}-${url}-${title}`;
    return Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
