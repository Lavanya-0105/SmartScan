// In-memory vendor stats for the /api/health endpoint
// Tracks success/failure per vendor so health endpoint has real data to report

interface VendorStat {
  successes: number;
  failures: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  totalResponseMs: number;
  calls: number;
}

class VendorStatsService {
  private stats: Record<string, VendorStat> = {};

  private init(vendor: string) {
    if (!this.stats[vendor]) {
      this.stats[vendor] = {
        successes: 0,
        failures: 0,
        lastSuccess: null,
        lastFailure: null,
        totalResponseMs: 0,
        calls: 0,
      };
    }
  }

  recordSuccess(vendor: string, responseMs: number) {
    this.init(vendor);
    this.stats[vendor].successes++;
    this.stats[vendor].calls++;
    this.stats[vendor].lastSuccess = new Date();
    this.stats[vendor].totalResponseMs += responseMs;
  }

  recordFailure(vendor: string) {
    this.init(vendor);
    this.stats[vendor].failures++;
    this.stats[vendor].calls++;
    this.stats[vendor].lastFailure = new Date();
  }

  getSummary() {
    const summary: Record<
      string,
      {
        successRate: string;
        avgResponseMs: string;
        lastSuccess: string;
        lastFailure: string;
      }
    > = {};

    for (const [vendor, stat] of Object.entries(this.stats)) {
      const rate =
        stat.calls > 0 ? Math.round((stat.successes / stat.calls) * 100) : 0;
      const avg =
        stat.successes > 0
          ? Math.round(stat.totalResponseMs / stat.successes)
          : 0;

      summary[vendor] = {
        successRate: `${rate}%`,
        avgResponseMs: `${avg}ms`,
        lastSuccess: stat.lastSuccess
          ? `${Math.round((Date.now() - stat.lastSuccess.getTime()) / 1000)}s ago`
          : "never",
        lastFailure: stat.lastFailure
          ? `${Math.round((Date.now() - stat.lastFailure.getTime()) / 1000)}s ago`
          : "never",
      };
    }
    return summary;
  }
}

export const vendorStats = new VendorStatsService();
