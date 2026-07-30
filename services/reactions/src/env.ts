interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export interface Env {
  DB: D1Database;
  REACTION_HMAC_SECRET: string;
  REACTION_TARGET_MANIFEST_URL: string;
  WRITE_RATE_LIMITER: RateLimiter;
  ISSUE_RATE_LIMITER: RateLimiter;
}
