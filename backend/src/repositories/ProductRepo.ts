import { pool } from "../config/db";
import { VendorListing } from "../interfaces/product";

export class ProductRepo {
  // Cache lookup by UPC (exact) first, then keyword fallback
  public async findByUPC(upc: string) {
    const res = await pool.query(
      `SELECT * FROM products WHERE upc = $1 LIMIT 1;`,
      [upc],
    );
    return res.rows[0] || null;
  }

  public async findByKeyword(query: string) {
    const res = await pool.query(
      `SELECT * FROM products 
       WHERE title ILIKE $1 OR model_number ILIKE $1 
       ORDER BY updated_at DESC
       LIMIT 1;`,
      [`%${query}%`],
    );
    return res.rows[0] || null;
  }

  public async createProduct(
    title: string,
    imageUrl: string,
    upc: string,
    modelNumber: string,
  ) {
    const res = await pool.query(
      `INSERT INTO products (title, image_url, upc, model_number)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (upc) DO UPDATE 
         SET title = EXCLUDED.title,
             image_url = EXCLUDED.image_url,
             model_number = EXCLUDED.model_number,
             updated_at = CURRENT_TIMESTAMP
       RETURNING *;`,
      [title, imageUrl, upc, modelNumber],
    );
    return res.rows[0];
  }

  public async upsertListing(productId: number, listing: VendorListing) {
    // Conflict key: (product_id, store_name) — safe because productId is now
    // derived from the canonical UPC, not a keyword-matched row.
    await pool.query(
      `INSERT INTO store_listings 
         (product_id, store_name, price, product_url, is_exact_match, in_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, store_name) DO UPDATE SET
         price       = EXCLUDED.price,
         product_url = EXCLUDED.product_url,
         in_stock    = EXCLUDED.in_stock,
         updated_at  = CURRENT_TIMESTAMP;`,
      [
        productId,
        listing.storeName,
        listing.price,
        listing.url,
        listing.isExactMatch,
        listing.inStock,
      ],
    );
  }

  public async getProductWithListings(productId: number) {
    const res = await pool.query(
      `SELECT store_name, price, product_url, is_exact_match, in_stock
       FROM store_listings
       WHERE product_id = $1
       ORDER BY price ASC;`,
      [productId],
    );
    return res.rows;
  }

  // Evict stale listings older than N hours (call this before returning cached data)
  public async isStale(productId: number, maxAgeHours = 1): Promise<boolean> {
    const res = await pool.query(
      `SELECT updated_at FROM store_listings
       WHERE product_id = $1
       ORDER BY updated_at DESC
       LIMIT 1;`,
      [productId],
    );
    if (!res.rows[0]) return true;
    const age = Date.now() - new Date(res.rows[0].updated_at).getTime();
    return age > maxAgeHours * 60 * 60 * 1000;
  }
}
