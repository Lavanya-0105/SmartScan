import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { cache } from "./services/CacheService";
import { logger } from "./config/logger";
import { ScraperService } from "./services/ScraperService";

const PORT = process.env.PORT || 5000;

// These are the exact queries shown as suggestion tiles in the frontend.
// Pre-warming means clicking a tile returns from Redis instantly instead of
// burning API credits and waiting 12 seconds.
const WARMUP_QUERIES = [
  "MacBook Pro",
  "Sony WH-1000XM5",
  "Samsung 65 inch TV",
  "iPad Pro",
  "Dyson V15",
  "Nintendo Switch",
];

async function warmCache() {
  if (!cache.isConnected()) {
    logger.info("Redis not connected — skipping cache warmup");
    return;
  }

  const scraper = new ScraperService();
  logger.info("Starting cache warmup for suggestion tiles...");

  // Warm sequentially to avoid hammering APIs on startup
  for (const query of WARMUP_QUERIES) {
    const cacheKey = `search:${query.toLowerCase().replace(/\s+/g, "-")}`;
    const existing = await cache.get(cacheKey);
    if (existing) {
      logger.info({ query }, "Warmup: already cached, skipping");
      continue;
    }
    try {
      logger.info({ query }, "Warmup: fetching...");
      const listings = await scraper.fetchAllVendors(query);
      if (listings.length === 0) continue;

      const canonical =
        listings.find((l) => l.storeName === "Amazon") ?? listings[0];
      const exactSources = listings
        .filter((l) => l.isExactMatch)
        .map((l) => ({
          storeName: l.storeName,
          price: l.price,
          url: l.url,
          isExactMatch: l.isExactMatch,
          inStock: l.inStock,
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
        }))
        .sort((a, b) => a.price - b.price);

      const payload = {
        title: canonical.title ?? `Product (${query})`,
        image:
          canonical.productImage ??
          listings.find((l) => l.productImage)?.productImage ??
          "",
        modelNumber: canonical.modelNumber ?? "N/A",
        upc: canonical.upc ?? "N/A",
        sources: [...exactSources, ...otherSources],
        lowestPrice: exactSources[0]?.price ?? otherSources[0]?.price ?? 0,
        comparisonQuality: "exact",
        responseMs: 0,
      };

      await cache.set(cacheKey, payload, 3600);
      logger.info({ query }, "Warmup: cached successfully");

      // 2 second pause between queries — avoids SerpApi rate limits on startup
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.warn(
        { query, err: (err as Error).message },
        "Warmup: failed, skipping",
      );
    }
  }
  logger.info("Cache warmup complete");
}

async function bootstrap() {
  await cache.connect();

  // Start server immediately — don't block traffic on warmup
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Server started");
  });

  // Warmup runs in background after server is already accepting requests
  warmCache().catch((err) => logger.warn({ err }, "Cache warmup error"));

  process.on("unhandledRejection", (reason: Error) => {
    logger.error({ reason }, "Unhandled promise rejection");
    server.close(() => process.exit(1));
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received — shutting down gracefully");
    server.close(() => process.exit(0));
  });
}

bootstrap();
