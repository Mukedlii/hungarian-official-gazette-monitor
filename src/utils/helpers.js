/**
 * Shared utility helpers
 */

/**
 * Normalize whitespace and remove leading/trailing spaces from text
 */
export function normalizeText(str) {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

/**
 * Strip HTML tags from a string
 */
export function stripHTML(html) {
    if (!html) return '';
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detect the document type (rendelet, törvény, etc.) from a title string
 */
export function extractDocumentType(title) {
    if (!title) return null;
    const t = title.toLowerCase();

    if (t.includes('törvény'))           return 'törvény';
    if (t.includes('rendelet'))          return 'rendelet';
    if (t.includes('határozat'))         return 'határozat';
    if (t.includes('közlemény'))         return 'közlemény';
    if (t.includes('utasítás'))          return 'utasítás';
    if (t.includes('hirdetmény'))        return 'hirdetmény';
    if (t.includes('tájékoztató'))       return 'tájékoztató';
    if (t.includes('állásfoglalás'))     return 'állásfoglalás';

    return null;
}

/**
 * Parse a YYYY-MM-DD string (passthrough) or null
 */
export function parseDate(str) {
    if (!str) return null;
    const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Remove diacritics from Hungarian characters for accent-insensitive matching
 */
export function removeDiacritics(str) {
    return str
        .replace(/[áÁ]/g, 'a')
        .replace(/[éÉ]/g, 'e')
        .replace(/[íÍ]/g, 'i')
        .replace(/[óÓőŐ]/g, 'o')
        .replace(/[úÚűŰ]/g, 'u')
        .replace(/[öÖ]/g, 'o');
}
