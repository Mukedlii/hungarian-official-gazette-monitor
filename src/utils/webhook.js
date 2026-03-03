/**
 * Webhook delivery utility
 * Sends a POST request with the result items to a user-specified URL.
 * Compatible with Zapier, Make, n8n, and custom webhooks.
 */

import fetch from 'node-fetch';
import { log } from 'apify';

export async function sendWebhook(webhookUrl, items) {
    const payload = {
        timestamp:  new Date().toISOString(),
        item_count: items.length,
        items,
    };

    const response = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        timeout: 15000,
    });

    if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}`);
    }

    log.info(`Webhook delivered: ${response.status}`);
}
