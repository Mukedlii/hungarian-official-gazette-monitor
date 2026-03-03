/**
 * Delta deduplication using Apify Key-Value Store.
 *
 * Stores a set of seen item IDs in KV store key "SEEN_IDS".
 * On each run, only returns items whose ID hasn't been seen before.
 * Updates the store after filtering.
 */

import { log } from 'apify';

const KV_KEY = 'SEEN_IDS';

export async function deduplicateItems(items, kvStore) {
    // Load existing seen IDs
    let seenIds = new Set();
    try {
        const stored = await kvStore.getValue(KV_KEY);
        if (stored && Array.isArray(stored)) {
            seenIds = new Set(stored);
        }
    } catch (err) {
        log.warning('Could not load seen IDs from KV store, starting fresh', { error: err.message });
    }

    const seenCount = seenIds.size;
    const newItems = [];

    for (const item of items) {
        const id = item.id ?? generateFallbackId(item);
        if (!seenIds.has(id)) {
            newItems.push(item);
            seenIds.add(id);
        }
    }

    // Persist updated seen IDs (cap at 50,000 to avoid memory issues)
    const idsArray = [...seenIds];
    const capped = idsArray.slice(Math.max(0, idsArray.length - 50000));
    try {
        await kvStore.setValue(KV_KEY, capped);
    } catch (err) {
        log.warning('Could not save seen IDs to KV store', { error: err.message });
    }

    return { newItems, seenCount };
}

function generateFallbackId(item) {
    const raw = `${item.source}-${item.url}-${item.title}`;
    return Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}
