# 🇭🇺 Hungarian Official Gazette Monitor

**Monitor Magyar Közlöny, Cégközlöny, and Pályázati Portál for new entries — automatically, on a schedule, with delta deduplication.**

> The only Apify Actor dedicated to Hungarian government data feeds. Built for legal, compliance, finance, and SMB teams who need to stay ahead of regulatory changes, company events, and grant opportunities.

---

## 🔍 What it does

This Actor scrapes three official Hungarian government sources and returns **only new items since the last run** (delta mode), so you never process the same record twice.

| Source | What you get |
|--------|-------------|
| **Magyar Közlöny** | New decrees, acts, resolutions — issue number, document type, date, PDF link |
| **Cégközlöny** | Company events: liquidation, bankruptcy, registration, deletion — with tax/registration numbers |
| **Pályázati Portál** | New grant opportunities — title, category, funding amount, deadline, URL |

---

## ✅ Key features

- **Delta mode** — powered by Apify Key-Value Store; returns only items not seen in previous runs
- **Keyword filter** — accent-insensitive Hungarian keyword matching (e.g. `adó`, `rendelet`, `felszámolás`)
- **Event type filter** — filter Cégközlöny by specific event types (e.g. only liquidations)
- **Date range filter** — pull historical data with `date_from`
- **Webhook support** — post results to Zapier, Make, n8n or any custom endpoint
- **Bilingual output** — Hungarian or English field names
- **Structured JSON output** — clean, normalized, ready for BI tools, spreadsheets, or AI pipelines

---

## 📦 Output fields

Each item contains:

```json
{
  "source": "magyar_kozlony",
  "source_label": "Magyar Közlöny",
  "issue_number": "2026/12",
  "title": "A Kormány 123/2026. (III. 29.) Korm. rendelete...",
  "event_type": "decree",
  "published_date": "2026-03-29",
  "url": "https://magyarkozlony.hu/...",
  "pdf_url": "https://magyarkozlony.hu/.../letoltes",
  "id": "abc123...",
  "scraped_at": "2026-03-29T08:00:00.000Z"
}
```

Cégközlöny items additionally include:

```json
{
  "company_name": "Példa Kft.",
  "tax_number": "12345678-2-41",
  "reg_number": "01-09-123456",
  "event_type": "liquidation"
}
```

Pályázati Portál items additionally include:

```json
{
  "category": "KKV",
  "funding_amount": "500 millió forint",
  "deadline": "2026. június 30.",
  "description": "..."
}
```

---

## 🚀 Getting started

### 1. Basic run (all sources, delta mode on)

```json
{
  "sources": ["magyar_kozlony", "cegkozlony", "palyazati_portal"],
  "delta_mode": true
}
```

### 2. Compliance monitoring — only decrees + acts

```json
{
  "sources": ["magyar_kozlony"],
  "keywords": ["adó", "számvitel", "foglalkoztatás"],
  "delta_mode": true
}
```

### 3. Credit risk — liquidations only

```json
{
  "sources": ["cegkozlony"],
  "cegkozlony_event_types": ["felszámolás", "csődeljárás"],
  "delta_mode": true,
  "webhook_url": "https://hooks.zapier.com/hooks/catch/..."
}
```

### 4. Grant digest for SMBs

```json
{
  "sources": ["palyazati_portal"],
  "keywords": ["kkv", "vállalkozás"],
  "max_items_per_source": 20
}
```

### 5. Historical pull — last 3 months

```json
{
  "sources": ["magyar_kozlony", "palyazati_portal"],
  "date_from": "2025-10-01",
  "delta_mode": false,
  "max_items_per_source": 500
}
```

---

## 📅 Recommended schedule

| Use case | Frequency |
|----------|-----------|
| Compliance / legal monitoring | Daily |
| Credit risk (Cégközlöny) | Daily or 2× per week |
| Grant monitoring | Weekly |
| Historical pull | On demand |

Set up a schedule in **Apify Console → Actor → Schedule** to run this Actor automatically.

---

## 🔗 Integrations

Connect results to:
- **Google Sheets** via Apify → Google Sheets integration
- **Zapier / Make** via webhook
- **Slack** via Apify → Slack integration  
- **Email digest** via Make or n8n
- **Power BI / Tableau** via dataset export (JSON / CSV / Excel)

---

## ⚡ Pricing

This Actor uses the **Pay per result** model.

| Volume | Estimated cost |
|--------|---------------|
| 100 items | ~$0.05 |
| 1,000 items | ~$0.50 |
| 10,000 items | ~$5.00 |

In delta mode, you typically process 5–50 new items per day, making daily runs very affordable.

---

## 🛡️ Compliance & legal

All data scraped by this Actor is **publicly available** on official Hungarian government websites. No authentication is required or bypassed. The Actor respects `robots.txt` and uses polite crawling delays.

---

## 🐛 Issues & feature requests

Found a bug or have a feature request? Open an issue on the **Issues** tab.

Popular upcoming features:
- [ ] Nemzeti Jogszabálytár (NJT) integration
- [ ] EKR közbeszerzési monitor
- [ ] KSH statistics feed
- [ ] Email digest built-in
