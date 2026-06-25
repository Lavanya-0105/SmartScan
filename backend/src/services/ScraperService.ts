import axios from "axios";
import { VendorListing } from "../interfaces/product";
import { vendorStats } from "../services/vendorStats";
import { logger } from "../config/logger";

export interface EnhancedVendorListing extends VendorListing {
  productImage?: string;
  upc?: string;
  title?: string;
  modelNumber?: string;
  condition?: "new" | "refurbished" | "used";
}

interface WalmartItem {
  us_item_id?: string;
  title?: string;
  thumbnail?: string;
  product_page_url?: string;
  out_of_stock?: boolean;
  seller_name?: string;
  primary_offer?: { offer_price?: number };
}

interface SerpShoppingItem {
  source?: string;
  price?: string | number;
  link?: string;
  thumbnail?: string;
  title?: string;
}

// Detects condition from title/condition string
// Returns "refurbished" | "used" | "new"
function detectCondition(text?: string): "new" | "refurbished" | "used" {
  if (!text) return "new";
  const t = text.toLowerCase();
  if (
    t.includes("refurbish") ||
    t.includes("renewed") ||
    t.includes("open box") ||
    t.includes("open-box") ||
    t.includes("certified") ||
    t.includes("restored") ||
    t.includes("reconditioned") ||
    t.includes("remanufactured")
  )
    return "refurbished";
  if (
    t.includes("used") ||
    t.includes("pre-owned") ||
    t.includes("preowned") ||
    t.includes("pre owned") ||
    t.includes("second hand") ||
    t.includes("secondhand")
  )
    return "used";
  return "new";
}

function truncateTitle(title: string, maxWords = 8): string {
  return title.split(" ").slice(0, maxWords).join(" ");
}

export class ScraperService {
  private readonly timeout = 12000;

  public async fetchAllVendors(
    query: string,
  ): Promise<EnhancedVendorListing[]> {
    const amazonResult = await this.fetchAmazon(query);

    // Only truncate if we got a real Amazon title back
    // User-typed spec strings like "dell laptop i5 16gb 1tb" should NOT be truncated
    const searchTitle = amazonResult?.title
      ? truncateTitle(amazonResult.title, 8)
      : query; // use full original query for better spec matching

    logger.info({ searchTitle }, "Cross-retailer search title resolved");

    const settlements = await Promise.allSettled([
      this.fetchWalmart(searchTitle),
      this.fetchEbay(searchTitle),
      this.fetchCostco(searchTitle),
      this.fetchBHPhoto(searchTitle),
      this.fetchNewegg(searchTitle),
    ]);

    const otherResults = settlements
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<EnhancedVendorListing>).value);

    return amazonResult ? [amazonResult, ...otherResults] : otherResults;
  }

  // -------------------------------------------------------------------
  // AMAZON via SerpApi
  // -------------------------------------------------------------------
  private async fetchAmazon(
    query: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) {
      logger.warn("SERPAPI_API_KEY missing — skipping Amazon");
      return null;
    }
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=amazon&k=${encodeURIComponent(query)}&api_key=${key}`,
        { timeout: this.timeout },
      );
      const results =
        res.data?.organic_results ?? res.data?.search_results ?? [];
      const item = results[0];
      if (!item) return null;

      const rawPrice =
        item.price ?? item.extracted_price ?? item.prices?.[0]?.value;
      const price =
        typeof rawPrice === "number"
          ? rawPrice
          : parseFloat(String(rawPrice ?? "").replace(/[^0-9.]/g, ""));
      if (!price || isNaN(price)) return null;

      const condition = detectCondition(item.title);
      vendorStats.recordSuccess("Amazon", Date.now() - start);
      return {
        storeName: "Amazon",
        price,
        url: item.asin
          ? `https://www.amazon.com/dp/${item.asin}`
          : (item.link ??
            `https://www.amazon.com/s?k=${encodeURIComponent(query)}`),
        isExactMatch: true,
        inStock: item.availability?.toLowerCase().includes("in stock") ?? true,
        productImage: item.thumbnail ?? item.image,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("Amazon");
      logger.warn({ err: (err as Error).message }, "Amazon fetch failed");
      return null;
    }
  }

  // -------------------------------------------------------------------
  // WALMART via SerpApi dedicated engine
  // Removed first-party seller filter — too strict, drops valid results
  // Uses product_page_url directly for reliable product link
  // -------------------------------------------------------------------
  private async fetchWalmart(
    title: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=walmart&query=${encodeURIComponent(title)}&api_key=${key}`,
        { timeout: this.timeout },
      );
      const results: WalmartItem[] = res.data?.organic_results ?? [];

      // Prefer new condition items — skip restored/refurbished if a new one exists
      const newItem = results.find(
        (r) =>
          r.primary_offer?.offer_price &&
          !isNaN(r.primary_offer.offer_price) &&
          detectCondition(r.title) === "new",
      );
      const anyItem = results.find(
        (r) =>
          r.primary_offer?.offer_price && !isNaN(r.primary_offer.offer_price),
      );
      const item = newItem ?? anyItem;
      if (!item) return null;

      const price = item.primary_offer!.offer_price!;

      // product_page_url is the direct product link Walmart returns
      const url =
        item.product_page_url ??
        (item.us_item_id
          ? `https://www.walmart.com/ip/${item.us_item_id}`
          : null) ??
        `https://www.walmart.com/search?q=${encodeURIComponent(title)}`;

      const condition = detectCondition(item.title);
      vendorStats.recordSuccess("Walmart", Date.now() - start);
      return {
        storeName: "Walmart",
        price,
        url,
        isExactMatch: condition === "new",
        inStock: item.out_of_stock !== true,
        productImage: item.thumbnail,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("Walmart");
      logger.warn({ err: (err as Error).message }, "Walmart fetch failed");
      return null;
    }
  }

  // -------------------------------------------------------------------
  // EBAY via SerpApi — always flagged isExactMatch: false
  // Filters results to only accept items matching the first brand/keyword
  // -------------------------------------------------------------------
  private async fetchEbay(
    title: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=ebay&_nkw=${encodeURIComponent(title + " new")}&api_key=${key}`,
        { timeout: this.timeout },
      );
      const items: Array<{
        buying_format?: string;
        price?: { extracted?: number; raw?: string };
        link?: string;
        thumbnail?: string;
        title?: string;
        condition?: string;
      }> = res.data?.organic_results ?? [];

      // Extract first word (usually brand) to filter mismatches
      // e.g. "Samsung 65 inch TV" → must contain "Samsung"
      const firstKeyword = title.split(" ")[0].toLowerCase();

      // Filter to only items whose title contains the first keyword
      const matchingItems = items.filter((r) =>
        r.title?.toLowerCase().includes(firstKeyword),
      );

      // Use filtered list, fall back to all items if nothing matches
      const pool = matchingItems.length > 0 ? matchingItems : items;

      const item =
        pool.find(
          (r) =>
            r.buying_format === "Buy It Now" &&
            detectCondition(r.condition ?? r.title) === "new",
        ) ??
        pool.find((r) => r.buying_format === "Buy It Now") ??
        pool[0];
      if (!item) return null;

      const price =
        item.price?.extracted ??
        parseFloat(String(item.price?.raw ?? "").replace(/[^0-9.]/g, ""));
      if (isNaN(price)) return null;

      const condition = detectCondition(
        (item.condition ?? "") + " " + (item.title ?? ""),
      );
      vendorStats.recordSuccess("eBay", Date.now() - start);
      return {
        storeName: "eBay",
        price,
        url:
          item.link ??
          `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}`,
        isExactMatch: false,
        inStock: true,
        productImage: item.thumbnail,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("eBay");
      logger.warn({ err: (err as Error).message }, "eBay fetch failed");
      return null;
    }
  }

  // -------------------------------------------------------------------
  // COSTCO via SerpApi Google Shopping
  // isExactMatch: false — Google Shopping price may be stale/wrong
  // inStock: unverified — Google Shopping doesn't return stock status
  // -------------------------------------------------------------------
  private async fetchCostco(
    title: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(title + " costco")}&no_cache=true&api_key=${key}`,
        { timeout: this.timeout },
      );
      const items: SerpShoppingItem[] = res.data?.shopping_results ?? [];
      const item = items.find((r) =>
        r.source?.toLowerCase().includes("costco"),
      );
      if (!item) return null;

      const price = parseFloat(String(item.price).replace(/[^0-9.]/g, ""));
      if (isNaN(price)) return null;

      const condition = detectCondition(item.title);
      vendorStats.recordSuccess("Costco", Date.now() - start);
      return {
        storeName: "Costco",
        price,
        url: `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(title)}`,
        isExactMatch: false, // Google Shopping price may not match costco.com exactly
        inStock: true, // unverified — Google Shopping doesn't return stock status
        productImage: item.thumbnail,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("Costco");
      logger.warn({ err: (err as Error).message }, "Costco fetch failed");
      return null;
    }
  }

  // -------------------------------------------------------------------
  // B&H PHOTO via SerpApi Google Shopping
  // Great for cameras, audio, electronics
  // -------------------------------------------------------------------
  private async fetchBHPhoto(
    title: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(title + " B&H photo")}&no_cache=true&api_key=${key}`,
        { timeout: this.timeout },
      );
      const items: SerpShoppingItem[] = res.data?.shopping_results ?? [];
      const item = items.find(
        (r) =>
          r.source?.toLowerCase().includes("b&h") ||
          r.source?.toLowerCase().includes("bhphoto") ||
          r.source?.toLowerCase().includes("b & h"),
      );
      if (!item) return null;

      const price = parseFloat(String(item.price).replace(/[^0-9.]/g, ""));
      if (isNaN(price)) return null;

      const condition = detectCondition(item.title);
      vendorStats.recordSuccess("B&H Photo", Date.now() - start);
      return {
        storeName: "B&H Photo",
        price,
        url:
          item.link ??
          `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(title)}`,
        isExactMatch: false, // Google Shopping match — verify on site
        inStock: true, // unverified — Google Shopping doesn't return B&H stock status
        productImage: item.thumbnail,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("B&H Photo");
      logger.warn({ err: (err as Error).message }, "B&H Photo fetch failed");
      return null;
    }
  }

  // -------------------------------------------------------------------
  // NEWEGG via SerpApi dedicated engine
  // Best for electronics, PC parts, laptops, GPUs — exact product matching
  // Returns direct product page URLs reliably
  // -------------------------------------------------------------------
  private async fetchNewegg(
    title: string,
  ): Promise<EnhancedVendorListing | null> {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return null;
    const start = Date.now();
    try {
      const res = await axios.get(
        `https://serpapi.com/search.json?engine=newegg&keywords=${encodeURIComponent(title)}&api_key=${key}`,
        { timeout: this.timeout },
      );
      const items: Array<{
        title?: string;
        price?: number | string;
        selling_price?: number | string;
        link?: string;
        thumbnail?: string;
        item_id?: string;
        out_of_stock?: boolean;
      }> = res.data?.organic_results ?? res.data?.products ?? [];

      // Skip sponsored results if identifiable, take first organic
      const item = items[0];
      if (!item) return null;

      const rawPrice = item.selling_price ?? item.price;
      const price =
        typeof rawPrice === "number"
          ? rawPrice
          : parseFloat(String(rawPrice ?? "").replace(/[^0-9.]/g, ""));
      if (!price || isNaN(price)) return null;

      // Build direct product URL from item_id if available
      const url = item.item_id
        ? `https://www.newegg.com/p/${item.item_id}`
        : (item.link ??
          `https://www.newegg.com/p/pl?d=${encodeURIComponent(title)}`);

      const condition = detectCondition(item.title);
      vendorStats.recordSuccess("Newegg", Date.now() - start);
      return {
        storeName: "Newegg",
        price,
        url,
        isExactMatch: condition === "new",
        inStock: item.out_of_stock !== true,
        productImage: item.thumbnail,
        title: item.title,
        condition,
      };
    } catch (err) {
      vendorStats.recordFailure("Newegg");
      logger.warn({ err: (err as Error).message }, "Newegg fetch failed");
      return null;
    }
  }
}
