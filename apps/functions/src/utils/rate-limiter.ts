/**
 * Rate Limiter Utility
 * 
 * Enforces global rate limits across all scrapers to be respectful of source websites.
 * Implements token bucket algorithm with configurable rates.
 */

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timestamp: number;
  }> = [];

  constructor(maxRequestsPerMinute: number) {
    this.maxTokens = maxRequestsPerMinute;
    this.tokens = maxRequestsPerMinute;
    this.refillRate = maxRequestsPerMinute / 60; // per second
    this.lastRefill = Date.now();
  }

  /**
   * Wait for rate limit token to become available
   * @param timeout Max time to wait in ms (default 30s)
   */
  async acquire(timeout = 30000): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    // Need to wait for tokens
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(
          (item) => item.resolve === resolve
        );
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('Rate limit timeout exceeded'));
      }, timeout);

      this.queue.push({
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject,
        timestamp: Date.now(),
      });

      // Process queue after refill delay
      const timeToNextToken = 1000 / this.refillRate;
      setTimeout(() => this.processQueue(), timeToNextToken);
    });
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private processQueue(): void {
    this.refillTokens();

    while (this.queue.length > 0 && this.tokens >= 1) {
      const item = this.queue.shift();
      if (item) {
        this.tokens -= 1;
        item.resolve();
      }
    }

    // Continue processing if queue not empty
    if (this.queue.length > 0) {
      const timeToNextToken = 1000 / this.refillRate;
      setTimeout(() => this.processQueue(), timeToNextToken);
    }
  }

  /**
   * Get current rate limiter stats
   */
  getStats() {
    this.refillTokens();
    return {
      availableTokens: Math.floor(this.tokens),
      queueLength: this.queue.length,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
    };
  }
}

// Global rate limiter singleton (20 requests per minute)
export const globalRateLimiter = new RateLimiter(20);

/**
 * Add jitter to delay
 * @param baseDelayMs Base delay in milliseconds
 * @param jitterPercent Jitter as percentage (0-100)
 */
export function addJitter(baseDelayMs: number, jitterPercent = 20): number {
  const jitter = baseDelayMs * (jitterPercent / 100);
  return baseDelayMs + (Math.random() * jitter * 2 - jitter);
}

/**
 * Sleep with jitter
 * @param ms Milliseconds to sleep
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, addJitter(ms)));
}

/**
 * Exponential backoff calculator
 * @param attempt Attempt number (0-indexed)
 * @param baseDelayMs Base delay in milliseconds
 * @param maxDelayMs Maximum delay cap
 */
export function exponentialBackoff(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 32000
): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  return addJitter(delay);
}
