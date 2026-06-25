# PriceScope — Real-Time Cross-Retailer Price Comparison

Live price comparison across Amazon, Walmart, BestBuy, Target, and eBay. Search any product and see every retailer's current price in one view.

**[Live Demo](#)** · **[Backend API](#)**

---

## The Core Problem This Solves

Searching "MacBook Pro" across 5 retailers independently returns 5 different products. Amazon shows one SKU, Walmart shows a refurbished bundle, eBay shows a used listing.

**The naive approach — concurrent keyword searches — doesn't compare prices. It compares different products.**

PriceScope solves this with a two-phase fetch:

```
Phase 1: Amazon (Rainforest API)
  keyword → search → ASIN → product detail page
  → extracts: exact title, UPC, real price, image

Phase 2: All other retailers (parallel)
  Amazon's exact title → Walmart engine
                       → Google Shopping (BestBuy filter)
                       → Google Shopping (Target filter)
                       → eBay engine
```

Searching `"Lenovo IdeaPad Slim 3i 15.6" FHD 8GB 256GB"` across retailers is infinitely more accurate than searching `"lenovo laptop"`. Phase 1 is the key insight.

---

## Architecture

```
Client (React + Vite)
    │
    └── GET /api/search?q=macbook
            │
            ├── Redis cache lookup (1hr TTL)
            │     └── HIT → return cached, X-Cache: HIT header
            │
            └── MISS → ScraperService.fetchAllVendors()
                          │
                          ├── Phase 1: fetchAmazon() ← sequential, blocking
                          │     └── Rainforest API (2 calls: search → product detail)
                          │           └── returns: exact title, ASIN, UPC, price
                          │
                          └── Phase 2: parallel Promise.allSettled()
                                ├── fetchWalmart()  ← SerpApi walmart engine
                                ├── fetchBestBuy()  ← SerpApi google_shopping + source filter
                                ├── fetchTarget()   ← SerpApi google_shopping + source filter
                                └── fetchEbay()     ← SerpApi ebay engine (flagged approximate)
```

---

## Technical Decisions

**Why Amazon runs first and blocks Phase 2**  
Every other retailer searches using Amazon's exact product title. Running them concurrently would mean they all search with the original keyword — defeating the whole point.

**Why `truncateTitle(8 words)`**  
Amazon titles like `"Apple 2026 MacBook Neo 13-inch Laptop with A18 Pro chip: Built for AI and Apple Intelligence..."` return zero results on Walmart and Target. 8 words gives enough specificity without breaking cross-retailer search.

**Why stable search URLs for BestBuy and Target instead of SerpApi's links**  
Google Shopping redirect links expire within minutes. `bestbuy.com/site/searchpage.jsp?st=...` and `target.com/s?searchTerm=...` are permanent, canonical search URLs that will always work.

**Why eBay is visually separated in the UI**  
eBay results are user-sold inventory — condition varies, configurations differ. Rendering them identically to retail listings misleads the user. They appear in a separate "Other Listings" section with a "condition may vary" label.

**Why 1-hour Redis TTL**  
Retail prices don't change minute-to-minute but do change daily. 1 hour gives a good balance between API cost (each search burns 5-6 API credits) and price freshness. Cache key is normalized: `search:macbook-pro-14` so minor query variations hit the same cache entry.

---

## Stack

| Layer         | Choice                                  | Why                                             |
| ------------- | --------------------------------------- | ----------------------------------------------- |
| Backend       | Node.js + Express + TypeScript (strict) | Type safety across API response shapes          |
| Price data    | Rainforest API (Amazon) + SerpApi       | Best-available programmatic access per retailer |
| Cache         | Redis (ioredis)                         | Reduce API spend, sub-100ms on cache hits       |
| Logging       | Pino                                    | Structured JSON logs, vendor success rates      |
| Rate limiting | express-rate-limit                      | Prevent API credit drain from abuse             |
| Frontend      | React + Vite                            | Fast dev experience, no build complexity        |

---

## API Reference

### `GET /api/search?q={query}`

Returns real-time price comparison across all retailers.

**Response**

```json
{
  "title": "Lenovo IdeaPad Slim 3i...",
  "image": "https://...",
  "modelNumber": "82RK00BAUS",
  "upc": "195042436822",
  "lowestPrice": 379.99,
  "comparisonQuality": "exact",
  "responseMs": 8241,
  "sources": [
    {
      "storeName": "Amazon",
      "price": 379.99,
      "url": "https://amazon.com/dp/B0XXXXX",
      "isExactMatch": true,
      "inStock": true
    }
  ]
}
```

**Headers**

- `X-Cache: HIT` — served from Redis cache
- `X-Cache: MISS` — freshly fetched

**Rate limit:** 30 requests/minute per IP

---

### `GET /api/health`

Vendor reliability stats and cache status.

```json
{
  "status": "ok",
  "uptime": "3600s",
  "cache": "connected",
  "vendors": {
    "Amazon": {
      "successRate": "94%",
      "avgResponseMs": "4200ms",
      "lastSuccess": "2m ago"
    },
    "Walmart": {
      "successRate": "87%",
      "avgResponseMs": "1800ms",
      "lastSuccess": "5m ago"
    }
  }
}
```

---

## Local Setup

```bash
# Clone and install
git clone https://github.com/yourname/pricescope
cd pricescope/backend && npm install
cd ../frontend && npm install

# Environment (backend/.env)
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
RAINFOREST_API_KEY=your_key
SERPAPI_API_KEY=your_key

# Run
cd backend && npm run dev
cd frontend && npm run dev
```

Redis is optional — the app runs without it, every search just hits the APIs directly.

---

## Known Limitations

- **Apple products on Amazon** — Rainforest sometimes returns no results for heavily restricted ASINs (iPhone, AirPods). When Amazon fails, other retailers fall back to keyword search and comparison accuracy degrades. The frontend signals this with an "approximate comparison" warning.
- **Target links** — No dedicated Target API exists. Prices come from Google Shopping; the link points to Target's search page for the product, not a specific product page.
- **eBay** — User-sold inventory by nature. Condition and configuration vary. Treated as reference pricing, not direct comparison.
