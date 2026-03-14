/**
 * Filtering utilities:
 * - keyword filter (accent-insensitive)
 * - expired grant filter (deadline < today)
 */
import { removeDiacritics } from './helpers.js';

export function filterItems(items, keywords) {
    if (!keywords || keywords.length === 0) return items;

    const normalizedKeywords = keywords.map(kw =>
        removeDiacritics(kw.toLowerCase().trim())
    );

    return items.filter(item => {
        const searchText = removeDiacritics([
            item.title ?? '',
            item.description ?? '',
            item.event_type ?? '',
            item.company_name ?? '',
        ].join(' ').toLowerCase());

        return normalizedKeywords.some(kw => searchText.includes(kw));
    });
}

/**
 * Removes expired items when they have a parsable deadline.
 *
 * Keeps items with no deadline (unknown deadline).
 *
 * @param {Array<any>} items
 * @param {{ today?: Date }} opts
 */
export function filterExpiredByDeadline(items, opts = {}) {
    const today = opts.today instanceof Date ? new Date(opts.today) : new Date();
    today.setHours(0, 0, 0, 0);

    return items.filter((item) => {
        const d = parseAnyDate(item?.deadline);
        if (!d) return true; // unknown deadline => keep
        d.setHours(0, 0, 0, 0);
        return d >= today;
    });
}

function parseAnyDate(v) {
    if (!v) return null;
    const s = String(v).trim();

    // ISO-ish: 2026-03-14 or 2026.03.14
    let m = s.match(/^(\d{4})[\.-](\d{1,2})[\.-](\d{1,2})/);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
    }

    // Hungarian month names: 2026. március 31.
    m = s.match(/(\d{4})\.?\s*([a-záéíóöőúüű]+)\s*(\d{1,2})\.?/i);
    if (m) {
        const y = Number(m[1]);
        const monthName = removeDiacritics(m[2].toLowerCase());
        const d = Number(m[3]);
        const monthMap = {
            januar: 1,
            februar: 2,
            marcius: 3,
            aprilis: 4,
            majus: 5,
            junius: 6,
            julius: 7,
            augusztus: 8,
            szeptember: 9,
            oktober: 10,
            november: 11,
            december: 12,
        };
        const mo = monthMap[monthName];
        if (y && mo && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
    }

    // Fallback: Date.parse
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t);

    return null;
}
