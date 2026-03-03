/**
 * Filter items by keyword list (accent-insensitive, case-insensitive)
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
