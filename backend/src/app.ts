import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { ScraperService } from "./services/ScraperService";
import { AppError } from "./errors/AppError";
import { cache } from "./services/CacheService";
import { vendorStats } from "./services/vendorStats";
import { logger } from "./config/logger";

const app = express();

app.use(cors());
app.use(express.json());

// Rate limit: 30 searches per minute per IP — prevents API credit drain
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({
        error:
          "Too many requests — please wait a moment before searching again.",
      });
  },
});

const scraperService = new ScraperService();

// -----------------------------------------------------------------------
// GET /api/search
// -----------------------------------------------------------------------
app.get(
  "/api/search",
  searchLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.query.q as string)?.trim();
      if (!query)
        throw new AppError('Search parameter "q" cannot be blank.', 400);

      const cacheKey = `search:${query.toLowerCase().replace(/\s+/g, "-")}`;

      // ── Cache hit ──────────────────────────────────────────────────────
      const cached = await cache.get<object>(cacheKey);
      if (cached) {
        logger.info({ query }, "Cache hit");
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(cached);
        return;
      }

      // ── Cache miss — fetch from all vendors ───────────────────────────
      logger.info({ query }, "Cache miss — fetching from vendors");
      const start = Date.now();
      const listings = await scraperService.fetchAllVendors(query);

      if (listings.length === 0) {
        throw new AppError(
          "No matching products found across online retailers.",
          404,
        );
      }

      const canonical =
        listings.find((l) => l.storeName === "Amazon") ?? listings[0];

      // Split exact matches from eBay/approximate — keeps comparison honest
      const exactSources = listings
        .filter((l) => l.isExactMatch)
        .map((l) => ({
          storeName: l.storeName,
          price: l.price,
          url: l.url,
          isExactMatch: l.isExactMatch,
          inStock: l.inStock,
          condition: l.condition,
          title: l.title,
        }))
        .sort((a, b) => a.price - b.price);

      const otherSources = listings
        .filter((l) => !l.isExactMatch)
        .map((l) => ({
          storeName: l.storeName,
          price: l.price,
          url: l.url,
          isExactMatch: l.isExactMatch,
          inStock: l.inStock,
          condition: l.condition,
          title: l.title,
        }))
        .sort((a, b) => a.price - b.price);

      const allSources = [...exactSources, ...otherSources];
      const lowestPrice = exactSources[0]?.price ?? allSources[0]?.price ?? 0;
      const responseMs = Date.now() - start;

      const payload = {
        title: canonical.title ?? `Product (${query})`,
        image:
          canonical.productImage ??
          listings.find((l) => l.productImage)?.productImage ??
          "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=150",
        modelNumber: canonical.modelNumber ?? "N/A",
        upc: canonical.upc ?? "N/A",
        sources: allSources,
        lowestPrice,
        // Signal to frontend whether comparison is fully reliable
        comparisonQuality: listings.every(
          (l) => l.isExactMatch || l.storeName === "eBay",
        )
          ? "exact"
          : "approximate",
        responseMs,
      };

      // Cache for 1 hour — prices don't change minute-to-minute
      await cache.set(cacheKey, payload, 3600);
      res.setHeader("X-Cache", "MISS");
      logger.info(
        { query, vendors: listings.length, responseMs },
        "Search completed",
      );
      res.status(200).json(payload);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------
// GET /api/health
// Shows vendor reliability, cache status, uptime — production signal
// -----------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: `${Math.round(process.uptime())}s`,
    cache: cache.isConnected() ? "connected" : "disabled",
    vendors: vendorStats.getSummary(),
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error." });
});

export default app;
