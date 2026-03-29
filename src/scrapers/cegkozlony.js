/**
 * Scraper: Cégközlöny (Hungarian Company Gazette)
 * Source: https://cegkozlony.hu/ (now redirects to https://cegportal.im.gov.hu/)
 *
 * NOTE: The Cégközlöny website has migrated to a new portal (cegportal.im.gov.hu).
 * The new site is a React/Vue SPA with different structure and likely requires
 * API reverse-engineering or browser automation.
 *
 * This scraper is temporarily disabled until the new structure is analyzed.
 */

import { log } from 'apify';

export async function scrapeCegkozlony({ max_items_per_source = 100, date_from = null, proxyUrl = null }) {
    log.warning('Cégközlöny: Temporarily unavailable - site has migrated to cegportal.im.gov.hu with new structure');
    
    // Return empty array for now
    // TODO: Implement new scraper for cegportal.im.gov.hu
    return [];
}
