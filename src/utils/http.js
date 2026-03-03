import { gotScraping } from 'crawlee';
import { log } from 'apify';

/**
 * Fetch URL and return text. Optionally uses Apify Proxy.
 * @param {string} url
 * @param {{ headers?: Record<string,string>, timeoutMs?: number, proxyUrl?: string }} opts
 */
export async function fetchText(url, opts = {}) {
  const { headers = {}, timeoutMs = 30000, proxyUrl } = opts;
  try {
    const res = await gotScraping({
      url,
      method: 'GET',
      headers,
      timeout: { request: timeoutMs },
      proxyUrl,
      retry: { limit: 2 },
      https: { rejectUnauthorized: true },
    });
    return res.body;
  } catch (err) {
    log.warning(`Fetch failed: ${url}`, { error: err?.message || String(err) });
    return null;
  }
}
