// Simple sliding-window in-memory rate limiter for public hold endpoints

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale keys every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 60000);
    if (record.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function checkRateLimit(
  identifier: string,
  limit: number = 20,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let record = rateLimitMap.get(identifier);

  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(identifier, record);
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}
