# Hargana — Requirements

> Your personal price memory: scan or search an item and instantly see what it costs here, what it costs elsewhere, and whether today's price is a good deal.

| | |
|---|---|
| **Status** | Draft v0.2 (after design review) |
| **Date** | 2026-10-21 |
| **Owner** | Sabil |

---

## 1. Background & Problem

When shopping — at a supermarket or a traditional market (*pasar*) — it's hard to remember what an item cost last time or at another place. Without that memory you can't tell whether to buy now, buy elsewhere, or wait.

**Hargana** records the prices you see and gives them back to you at the moment of decision:

- At a **supermarket**, scan the barcode (or search by name if the barcode is missing).
- At a **traditional market**, search the item by name (most items have no barcode).

## 2. Vision & Phasing

| Phase | Scope |
|---|---|
| **MVP** | Personal tool (single user). Region: **Kabupaten Garut**. Stores: Yomart, then Alfamart/Indomaret, plus a traditional market. Bahasa Indonesia, IDR. |
| **Later** | More regions across **Indonesia**; **Cairo, Egypt** (EGP); English, language switcher, Arabic (RTL); family accounts; shopping cart; crowdsourced prices; public read-only access. |

The MVP must be built so that later phases need **no rewrite** (multi-region, multi-currency, i18n, RTL-ready, `source`/`verified` on prices).

### Non-goals (MVP)

- Public users / sign-up.
- Shopping cart / trip logging.
- Crowdsourcing from other users.
- QR-code product lookup.
- Linking packaged products to commodities (e.g. "Beras 5 kg pack" ↔ "Beras medium per kg").
- Multi-buy promos (e.g. *beli 2 gratis 1*).
- CSV import.
- Checkout, payment, ordering, delivery.

## 3. Core Concepts (Domain Glossary)

| Term | Meaning |
|---|---|
| **Region** | A *kota*/*kabupaten* (e.g. Kabupaten Garut) or city (e.g. Cairo). Has one **currency** and **locale**. Prices are only ever compared within one region. |
| **Chain** | A retail brand within a region, e.g. Yomart, Alfamart, Indomaret. |
| **Branch** | A physical store of a chain, e.g. "Yomart Garut Kota". |
| **Traditional market** | A *pasar*, e.g. Pasar Guntur Ciawitali. A store without a chain; one price per commodity (not per stall). |
| **Store** | Generic term for a branch or a traditional market. |
| **Item** | Anything with a price. Two kinds: |
| ↳ **Product** | Packaged, barcoded item (EAN-13/EAN-8/UPC). Optional size (e.g. 400 g). Compared only against the exact same barcode. |
| ↳ **Commodity** | Non-barcoded item priced per unit (kg / liter / piece / *ikat*…), e.g. "Cabai rawit merah". Found by search. Compared by unit price across markets and supermarkets. |
| **Price observation** | One dated record of a price seen at a store (or applied to a whole chain). Append-only. The **current price** is derived from the latest observation. |
| **Active region** | The region the app is currently working in; follows the selected store. |
| **Current store** ("Saya di: …") | Optional store context that enables recording prices. |

## 4. Users

| Persona | MVP | Later |
|---|---|---|
| **Owner** (you) — shopper *and* price collector in one | ✅ | ✅ |
| **Family member** — invited account sharing the same data | — | ✅ |
| **Public shopper** — read-only, possibly submits prices via cart | — | ✅ |

## 5. User Stories (MVP)

- **US-1** I open the app and can immediately scan a barcode or search an item.
- **US-2** I scan a supermarket product and see its price here, the cheapest price elsewhere, the lowest price in the last 90 days, and how old each price is.
- **US-3** At a traditional market I search "cabe" and find "Cabai rawit merah" with its known prices.
- **US-4** If a product's barcode is missing or unreadable, I search it by name.
- **US-5** I set "Saya di: Yomart Garut Kota" so I can record prices as I shop.
- **US-6** If the shelf price matches the known chain price, I tap **"Sama ✓"** once to confirm it for this branch.
- **US-7** If the price is different, I type the new price and choose "this branch only" (default) or "whole chain".
- **US-8** At the market I enter "Rp 18.000 for 500 g" and the app works out the price per kg.
- **US-9** I scan a product the app doesn't know yet; it pre-fills from Open Food Facts if possible, otherwise I type name/brand/size and take a photo.
- **US-10** I use the app with no signal; my recordings sync later.
- **US-11** I can see when a price might be outdated.
- **US-12** I can export all my data.

## 6. Functional Requirements

Priority: **M** = Must (MVP) · **S** = Should (MVP if time allows) · **C** = Could (later) · **L** = Later phase.

### 6.1 Finding Items

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Home screen: live camera scanner (rear camera, auto-detect, no shutter button) plus a search bar and category browse (e.g. Beras, Telur, Sayur, Bumbu, Minyak). | M |
| FR-2 | Scan 1D barcodes: EAN-13, EAN-8, UPC-A, UPC-E. Must work in Android Chrome and iOS Safari (use a WASM decoder such as zxing-wasm where `BarcodeDetector` is unavailable). | M |
| FR-3 | Validate EAN/UPC check digit before lookup. | M |
| FR-4 | Torch toggle; haptic feedback on successful scan. | M |
| FR-5 | Debounce: the same code is not looked up repeatedly while in view. | M |
| FR-6 | Manual barcode number entry as fallback. | M |
| FR-7 | QR codes (and other non-product codes) are recognized and shown as "Bukan kode produk"; URLs are never auto-opened. | M |
| FR-8 | Search across products **and** commodities by name, brand, and **aliases** (e.g. cabe/cabai, bawang beureum → bawang merah), typo-tolerant, fully on-device (e.g. Fuse.js). | M |
| FR-9 | GS1 Digital Link QR support. | L |
| FR-10 | Decode in-store variable-weight barcodes (prefix `2`). | C |

### 6.2 Result Screen (Decision Support)

For the selected item, within the **active region**:

| ID | Requirement | Priority |
|---|---|---|
| FR-11 | Show item name, brand, size/unit, photo (if any). | M |
| FR-12 | Show **price here** (current store, if set and known). | M |
| FR-13 | Show **cheapest known price elsewhere** and the difference, e.g. "Rp 2.000 lebih murah di Pasar Guntur". | M |
| FR-14 | Show **lowest price recorded in the last 90 days**. | M |
| FR-15 | Show a list of all known stores' prices, sorted cheapest first. | M |
| FR-16 | Each price shows "dicek X hari lalu"; prices past the staleness threshold get a "mungkin sudah berubah" label but remain in the comparison. | M |
| FR-17 | Promo price shown as the effective price with a "promo s.d. <date>" label and the normal price struck through; after `promo_until`, the normal price applies automatically. | M |
| FR-18 | Market prices recorded as a range display the range; comparisons use the **min**. | M |
| FR-19 | If a chain's branches have different prices, show the chain price with "berbeda di beberapa cabang" and allow expanding to branch prices. | S |
| FR-20 | Unknown item: "Belum ada di database" with an "Add item" action. | M |
| FR-21 | Unit price for products with a size (e.g. Rp/100 g) to compare pack sizes. | C |
| FR-22 | Price trend chart per item. | C |

### 6.3 Store Context & Region

| ID | Requirement | Priority |
|---|---|---|
| FR-23 | "Saya di: …" chip to select the current store (searchable; nearby stores suggested if location permission is granted). | M |
| FR-24 | Current store is remembered and **resets after 4 hours of inactivity**. | M |
| FR-25 | Without a current store, the result screen is view-only. | M |
| FR-26 | **Active region follows the current store.** With no store set, the last active region is used. | M |
| FR-27 | Manual region switcher in settings. | M |
| FR-28 | Regions, chains, branches, and markets can be added as data (no code change). | M |

### 6.4 Recording Prices

| ID | Requirement | Priority |
|---|---|---|
| FR-29 | With a current store set, the result screen shows **"Sama ✓"** and **"Ubah harga"**. | M |
| FR-30 | **"Sama ✓"** records a confirmation observation for this branch at the currently shown price — one tap, no typing. | M |
| FR-31 | **"Ubah harga"** records a new price with scope **"this branch only"** (default) or **"whole chain"**. | M |
| FR-32 | Price entry accepts **amount + quantity + unit** (e.g. Rp 18.000 for 500 g; Rp 10.000 for 3 *ikat*). The app computes the per-unit price and also stores the original input. | M |
| FR-33 | Traditional market: one price per commodity per market, optionally as a **min–max range**, with an optional note. | M |
| FR-34 | Optional promo price with end date. | M |
| FR-35 | Recording a price takes **≤ 10 s** per item for a known item. | M |

### 6.5 Catalog Management

| ID | Requirement | Priority |
|---|---|---|
| FR-36 | Add a **product** on first scan: try Open Food Facts to pre-fill (online only); otherwise enter name, brand, optional size, category, and one photo. | M |
| FR-37 | Add a **commodity**: name, pricing unit (kg / liter / piece / *ikat* / …), category, aliases. | M |
| FR-38 | Edit items, stores, chains, regions, and categories. | M |
| FR-39 | Photos are compressed on-device to ~150 KB and stored in object storage; thumbnails are cached for offline use, full images load when online. Photos are optional (commodities usually have none). | M |
| FR-40 | Log lookups of unknown barcodes so they can be added later. | S |
| FR-41 | Export all data (items, stores, observations) as CSV and JSON. | S |

### 6.6 Localization & Settings

| ID | Requirement | Priority |
|---|---|---|
| FR-42 | All UI strings externalized through an i18n library from day one; Bahasa Indonesia is the only MVP language. | M |
| FR-43 | Currency formatting by region via `Intl.NumberFormat` (e.g. `Rp 12.500`, `EGP 45.00`). | M |
| FR-44 | Layout uses logical CSS properties (`ms-`/`me-`, `start`/`end`) so RTL can be enabled without refactoring. | M |
| FR-45 | Staleness thresholds configurable per region and store type (defaults: traditional market **7 days**, supermarket **30 days**). | M |
| FR-46 | Language switcher in settings; English. | L |
| FR-47 | Arabic (RTL). | L |

### 6.7 Later Phases (recorded for design awareness)

| ID | Requirement | Priority |
|---|---|---|
| FR-48 | **Shopping cart / trip log**: select a store, scan/search items, base prices pre-filled, adjust for changes or discounts, running total. | L |
| FR-49 | Cart adjustments become **unverified price observations** (`source = shopper`, `verified = false`). | L |
| FR-50 | Family accounts sharing the same data. | L |
| FR-51 | Public read-only access. | L |
| FR-52 | Link packaged products to commodities for cross-type comparison. | L |
| FR-53 | Multi-buy promo support. | L |

## 7. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Platform | **PWA**, installable, working in Android Chrome and iOS Safari (iOS 16+, Android 9+). |
| NFR-2 | Offline-first | The full catalog and current prices for every region the user has used are stored on-device. Lookup, search, and recording work with **no network**. Recordings are queued and synced automatically when online. |
| NFR-3 | Performance | Lookup of a known item ≤ **1 s** (offline); barcode detection ≤ 500 ms in good light. |
| NFR-4 | Sync | Idempotent (client-generated UUIDs); safe to retry; observations are append-only so concurrent devices don't overwrite each other. |
| NFR-5 | Auth | Whole app behind login (single user in MVP). Session lasts **90 days** so offline use isn't interrupted. |
| NFR-6 | Usability | One-handed use; large tap targets; readable in bright store lighting. |
| NFR-7 | Privacy | Camera frames processed on-device only. Location used on-device only, to suggest nearby stores. |
| NFR-8 | Security | HTTPS only; all API routes authenticated; rate-limited. |
| NFR-9 | Money | Prices stored as **integers in the currency's smallest practical unit** (IDR: rupiah; EGP: piastres). Computed per-unit prices stored as fixed-precision decimals. Never use floating point for money. |
| NFR-10 | Extensibility | Adding a new region or currency is a data change, not a code change. |

## 8. Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js** (App Router), deployed on **Vercel** |
| Database | **Neon Postgres** with **Drizzle ORM** |
| On-device store | **Dexie** (IndexedDB) |
| Sync | Custom: pull changes since a cursor (per region), push queued observations/items in batches |
| Auth | **Better Auth** — email + password (passkeys and multiple users later) |
| Barcode | Native `BarcodeDetector` where available, **zxing-wasm** fallback |
| Search | **Fuse.js** (on-device, typo-tolerant, aliases) |
| Photos | **Vercel Blob** |
| i18n | An i18n library (e.g. next-intl) |
| Product metadata | **Open Food Facts** API (best effort, online only) |

## 9. Data Model (draft)

```
Region
  id, name, country_code, currency (ISO 4217), locale,
  stale_days_market (default 7), stale_days_supermarket (default 30)

Chain
  id, region_id, name                      -- e.g. Yomart (Kab. Garut)

Store
  id, region_id, chain_id (nullable), type (branch | traditional_market),
  name, address, lat, lng

Category
  id, name, sort_order

Item
  id (uuid, client-generated), kind (product | commodity),
  barcode (nullable, unique when present), barcode_type,
  name, brand, aliases[], category_id,
  size_value, size_unit                    -- products, optional (e.g. 400 g)
  pricing_unit                             -- commodities (kg | l | pcs | ikat | …)
  photo_url, thumb_url, metadata_source (manual | open_food_facts),
  created_at, updated_at

PriceObservation                           -- append-only
  id (uuid, client-generated), item_id, region_id,
  scope (chain | branch | market),
  chain_id (nullable), store_id (store where it was observed),
  action (new | confirm | change),
  price                                    -- integer minor units; per item or per pricing_unit
  price_max (nullable)                     -- market ranges
  promo_price (nullable), promo_until (nullable),
  entered_amount, entered_qty, entered_unit -- original input, e.g. 18000 / 500 / g
  note,
  source (collector | shopper), verified (bool),
  observed_at, created_by, synced_at

UnknownBarcodeLog
  barcode, region_id, scanned_at

User                                       -- managed by Better Auth
```

### Current-price rules

- **Chain price** = latest `scope = chain` observation for (item, chain).
- **Branch price** = whichever is newer: the latest `scope = branch` observation for (item, store), or the chain price.
- **Market price** = latest `scope = market` observation for (item, store).
- **Effective price** = `promo_price` if `promo_until ≥ today`, otherwise `price`; for ranges, use `price` (the min).
- **Stale** if `observed_at` is older than the region's threshold for that store type.
- "Sama ✓" writes `action = confirm, scope = branch` with the same price, so we know which branches were actually checked.

## 10. API (draft)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/sync?regions=…&since=<cursor>` | Pull items, stores, chains, regions, observations changed since the cursor |
| POST | `/api/sync` | Push a batch of queued items and observations (idempotent by UUID) |
| GET | `/api/off/{barcode}` | Proxy to Open Food Facts for pre-fill |
| POST | `/api/photos` | Upload a compressed photo to Blob |
| GET | `/api/export?format=csv\|json` | Export all data |
| — | `/api/auth/*` | Better Auth |

The UI reads from the on-device store; the server is only reached through sync.

## 11. Main Flows

### Look up (shopping)
1. Open app → scanner and search bar on the home screen.
2. Scan barcode **or** search by name/alias.
3. Result screen: price here · cheapest elsewhere (+ difference) · lowest in 90 days · all stores · staleness.
4. Decide whether to buy.

### Record (supermarket)
1. Set "Saya di: Yomart Garut Kota".
2. Scan item → result screen shows the known chain price.
3. Shelf matches → **Sama ✓**. Differs → **Ubah harga** → enter price → "cabang ini saja" (default) / "seluruh chain".
4. Unknown barcode → Open Food Facts pre-fill or manual entry + photo → enter price.

### Record (traditional market)
1. Set "Saya di: Pasar Guntur Ciawitali".
2. Search "bawang merah".
3. Enter "Rp 18.000 / 500 g" (optional range and note) → saved as Rp 36.000/kg.

### Offline
- All of the above work offline. A sync indicator shows pending changes; sync runs automatically when connectivity returns.

## 12. Milestones (~6 weeks)

| Week | Deliverable |
|---|---|
| 1 | Project setup, auth, schema, catalog (products + commodities), manual price entry, search |
| 2 | Barcode scanning, "Saya di" store chip, branch confirmation ("Sama ✓") and chain/branch scope |
| 3 | Offline-first on-device store and sync |
| 4 | Result screen: cheapest elsewhere, lowest in 90 days, staleness, promo, ranges |
| 5–6 | Field test in Garut (Yomart + a traditional market), polish, export |

## 13. Success Metrics

- Lookup of a known item ≤ **1 s**, even offline.
- Recording a price ≤ **10 s** per item.
- After one month of use, **≥ 80%** of looked-up items have a known price.
- The app is checked before buying in **≥ 3 out of 4** shopping trips.

## 14. Decisions Log

| # | Decision |
|---|---|
| D1 | Prices are collected by the owner (manual entry); crowdsourcing comes later via the shopping cart. |
| D2 | Main job: compare prices across stores and remember past prices to support buy decisions. |
| D3 | PWA (Next.js), not native. |
| D4 | MVP: Kabupaten Garut, IDR, Bahasa Indonesia. Later: rest of Indonesia, Cairo (EGP), English, Arabic. |
| D5 | 1D barcodes only; QR codes are rejected as "not a product code". |
| D6 | Solo build, ~6 weeks. |
| D7 | Pilot stores: Yomart first, then Alfamart/Indomaret, plus a traditional market. |
| D8 | Prices at chain level with per-branch override; branch confirmations recorded with one tap. |
| D9 | Results list all stores; no mandatory store selection for viewing. |
| D10 | Two item kinds: barcoded products and commodities (search-only, per-unit). |
| D11 | Traditional market: one price (or range) per commodity per market, not per stall. |
| D12 | Staleness per store type: market 7 days, supermarket 30 days. |
| D13 | Append-only price observations. |
| D14 | Personal app behind login; no separate shopper/collector modes. |
| D15 | Offline-first with full on-device catalog for used regions. |
| D16 | Active region follows the current store. |
