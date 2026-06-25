import { createClient, RedisClientType } from "redis";
import { logger } from "../config/logger";

class CacheService {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect() {
    if (!process.env.REDIS_URL) {
      logger.warn(
        "REDIS_URL not set — caching disabled, all searches will hit APIs",
      );
      return;
    }
    try {
      this.client = createClient({
        url: process.env.REDIS_URL,
      }) as RedisClientType;
      this.client.on("error", (err) =>
        logger.error({ err }, "Redis client error"),
      );
      await this.client.connect();
      this.connected = true;
      logger.info("Redis connected");
    } catch (err) {
      logger.warn({ err }, "Redis connection failed — running without cache");
      this.connected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) return null;
    try {
      const val = await this.client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch (err) {
      logger.warn({ err, key }, "Cache get failed");
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (err) {
      logger.warn({ err, key }, "Cache set failed");
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      logger.warn({ err, key }, "Cache del failed");
    }
  }

  isConnected() {
    return this.connected;
  }
}

// Singleton — one Redis connection shared across the app
export const cache = new CacheService();
