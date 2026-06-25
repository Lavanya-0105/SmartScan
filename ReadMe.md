# SmartScan — Real-Time Price Comparison

Compare prices across Amazon, Walmart, and eBay in one search. See the best deal instantly.

**[Live Demo](https://smart-scan-swart.vercel.app/)** · **[Backend API](https://smartscan-production-7598.up.railway.app/api/health)**

---

## The Problem This Solves

Searching "MacBook Pro" on three retailers returns three different results. Amazon shows one SKU, Walmart shows a restored bundle, eBay shows a used listing. You're not comparing prices — you're comparing different products.

**SmartScan solves this with a two-phase fetch:**

```
Phase 1: Amazon (SerpApi Amazon engine)
  keyword → search → extract exact product title + ASIN + price

Phase 2: All other retailers (parallel)
  Amazon's exact title → Walmart engine  (direct product URL)
                       → eBay engine     (brand-filtered results)
```

Searching `"Sony WH-1000XM5 Wireless Noise Canceling"` across retailers is far more accurate than searching `"sony headphones"`. Phase 1 is the key insight.

---

## Architecture

```
Client (React + Vite)
    │
    └── GET /api/search?q=macbook+pro
            │
            ├── Redis cache lookup (1hr TTL)
            │     └── HIT  → return cached result, X-Cache: HIT header
            │
            └── MISS → ScraperService.fetchAllVendors()
                          │
                          ├── Phase 1: fetchAmazon() — sequential, blocking
                          │     └── SerpApi Amazon engine
                          │           └── returns: exact title, ASIN, price, image
                          │
                          └── Phase 2: Promise.allSettled() — parallel
                                ├── fetchWalmart()  ← SerpApi walmart engine
                                └── fetchEbay()     ← SerpApi ebay engine
                                                        (brand-filtered, Buy It Now)
```

---

## Technical Decisions

**Why Amazon runs first and blocks Phase 2**
Every other retailer searches using Amazon's exact product title. Running all three concurrently would mean Walmart and eBay search with the raw keyword — returning unrelated products. Amazon's title is the canonical anchor.

**Why `truncateTitle(8 words)`**
Amazon titles like `"Sony WH-1000XM5 Industry Leading Wireless Noise Canceling Headphones with Auto Noise Canceling Optimizer..."` return zero results on Walmart when passed in full. 8 words gives enough specificity without breaking cross-retailer search.

**Why eBay filters by first keyword**
eBay's engine returns the closest match, not an exact match. Searching "Samsung 65 inch TV" could return an LG. We extract the first word ("Samsung") and filter results to only those whose title contains it — dropping mismatched brands before they reach the UI.

**Why Walmart prefers new condition over restored**
Walmart mixes first-party and marketplace sellers. We scan all results and pick the first where `detectCondition(title) === "new"`, falling back to restored only if no new listing exists.

**Why Redis TTL is 1 hour**
Retail prices don't change minute-to-minute but do change daily. 1 hour balances API credit cost (each search burns 3 SerpApi credits) against price freshness. Cache key is normalized: `search:macbook-pro` so minor query variations hit the same cache entry.

**Why condition detection matters**
Walmart calls refurbished products "Restored". eBay mixes new, used, and refurbished in the same results. `detectCondition()` scans titles for: `restored`, `refurbished`, `renewed`, `open box`, `used`, `pre-owned`, `remanufactured` — and badges each card accordingly so users never mistake a refurbished listing for new.

---

## Stack

| Layer         | Choice                                    | Why                                            |
| ------------- | ----------------------------------------- | ---------------------------------------------- |
| Backend       | Node.js + Express + TypeScript            | Type safety across all API response shapes     |
| Price data    | SerpApi (Amazon + Walmart + eBay engines) | Dedicated engines per retailer, no scraping    |
| Cache         | Redis                                     | Sub-100ms on cache hits, reduces API spend     |
| Logging       | Pino                                      | Structured JSON logs with vendor success rates |
| Rate limiting | express-rate-limit                        | Prevents API credit drain from abuse           |
| Frontend      | React + Vite                              | Fast dev, no build complexity                  |

---

## API Reference

### `GET /api/search?q={query}`

Returns live prices from Amazon, Walmart, and eBay.

**Response**

```json
{
  "title": "Sony WH-1000XM5 Wireless Noise Canceling",
  "image": "https://...",
  "modelNumber": "WH1000XM5/B",
  "upc": "N/A",
  "lowestPrice": 279.99,
  "comparisonQuality": "exact",
  "responseMs": 6842,
  "sources": [
    {
      "storeName": "Amazon",
      "price": 279.99,
      "url": "https://www.amazon.com/dp/B09XS7JWHH",
      "isExactMatch": true,
      "inStock": true,
      "condition": "new",
      "title": "Sony WH-1000XM5 Wireless Noise Canceling Headphones..."
    },
    {
      "storeName": "Walmart",
      "price": 298.0,
      "url": "https://www.walmart.com/ip/12345678",
      "isExactMatch": true,
      "inStock": true,
      "condition": "new",
      "title": "Sony WH-1000XM5 Noise Canceling Headphones Black"
    },
    {
      "storeName": "eBay",
      "price": 249.0,
      "url": "https://www.ebay.com/itm/...",
      "isExactMatch": false,
      "inStock": true,
      "condition": "new",
      "title": "Sony WH-1000XM5 Wireless Headphones Brand New Sealed"
    }
  ]
}
```

**Headers**

- `X-Cache: HIT` — served from Redis cache
- `X-Cache: MISS` — freshly fetched from all retailers

**Rate limit:** 30 requests/minute per IP

---

### `GET /api/health`

Vendor reliability stats and cache status. Useful for monitoring.

```json
{
  "status": "ok",
  "uptime": "3600s",
  "cache": "connected",
  "vendors": {
    "Amazon": {
      "successRate": "91%",
      "avgResponseMs": "3800ms",
      "lastSuccess": "2m ago"
    },
    "Walmart": {
      "successRate": "88%",
      "avgResponseMs": "1600ms",
      "lastSuccess": "2m ago"
    },
    "eBay": {
      "successRate": "95%",
      "avgResponseMs": "1200ms",
      "lastSuccess": "2m ago"
    }
  }
}
```

---

## Local Setup

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/smartscan
cd smartscan

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install

# Environment — create backend/.env
SERPAPI_API_KEY=your_serpapi_key
REDIS_URL=redis://localhost:6379   # optional — app works without Redis
NODE_ENV=development
PORT=5000

# Run backend
cd backend && npm run dev

# Run frontend (separate terminal)
cd frontend && npm run dev
```

Redis is optional. Without it every search hits the APIs fresh — slower but functional.

---

## Known Limitations

- **Spec-heavy searches** — Searching "Dell laptop i5 16GB 1TB" may return a Dell i5 with different storage on Walmart or eBay. Retailer engines match by keyword relevance, not exact spec. A "Specs may vary across retailers" badge is shown on every result to set honest expectations. UPC-based matching is on the roadmap.

- **Amazon availability** — Some products (PS5, certain Apple items) have restricted Amazon listings with no buybox price. When Amazon fails, Walmart and eBay fall back to keyword search with degraded accuracy.

- **eBay condition** — eBay is user-sold inventory. Even with new-condition filtering and brand matching, configuration and bundling can vary. Treated as reference pricing rather than exact comparison.

---

## Roadmap

- [ ] Product review scores from Amazon and eBay
- [ ] Price history charts (30/60/90 day)
- [ ] Price drop alerts
- [ ] More retailers — Sam's Club, Target, BestBuy
