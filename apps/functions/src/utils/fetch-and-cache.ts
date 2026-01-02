/**
 * HTTP Fetch Wrapper with Caching, Rate Limiting, and Error Handling
 * 
 * This is the central function for all HTTP requests in the scraping pipeline.
 * It handles caching, rate limiting, retries, and health monitoring.
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Storage } from '@google-cloud/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { globalRateLimiter, exponentialBackoff, sleep } from './rate-limiter';
import * as crypto from 'crypto';

const storage = new Storage();
const db = getFirestore();

interface FetchOptions extends AxiosRequestConfig {
  cacheKey?: string;
  cacheTTL?: number; // seconds
  skipCache?: boolean;
  retries?: number;
  scraperName?: string;
}

interface CachedResponse {
  html: string;
  etag?: string;
  lastModified?: string;
  cachedAt: number;
}

const USER_AGENT = 'PropPulse-DataBot/1.0 (+https://proppulse.com/about)';
const CACHE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || '';

/**
 * Generate cache key from URL
 */
function generateCacheKey(url: string, customKey?: string): string {
  if (customKey) return customKey;
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const urlObj = new URL(url);
  const source = urlObj.hostname.replace(/\./g, '-');
  const date = new Date().toISOString().split('T')[0];
  return `scraper-cache/${source}/${date}/${hash}.json`;
}

/**
 * Get cached response from Cloud Storage
 */
async function getCachedResponse(
  cacheKey: string,
  ttl: number
): Promise<CachedResponse | null> {
  try {
    const file = storage.bucket(CACHE_BUCKET).file(cacheKey);
    const [exists] = await file.exists();
    
    if (!exists) return null;

    const [metadata] = await file.getMetadata();
    const createdAt = new Date(metadata.timeCreated!).getTime();
    const age = (Date.now() - createdAt) / 1000; // seconds

    if (age > ttl) {
      console.log(`Cache expired for ${cacheKey} (age: ${age}s, ttl: ${ttl}s)`);
      return null;
    }

    const [contents] = await file.download();
    const cached: CachedResponse = JSON.parse(contents.toString());
    
    console.log(`Cache HIT for ${cacheKey} (age: ${Math.floor(age)}s)`);
    return cached;
  } catch (error) {
    console.error(`Error reading cache for ${cacheKey}:`, error);
    return null;
  }
}

/**
 * Save response to Cloud Storage cache
 */
async function setCachedResponse(
  cacheKey: string,
  data: CachedResponse
): Promise<void> {
  try {
    const file = storage.bucket(CACHE_BUCKET).file(cacheKey);
    await file.save(JSON.stringify(data), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'private, max-age=86400',
      },
    });
    console.log(`Cache SAVED for ${cacheKey}`);
  } catch (error) {
    console.error(`Error saving cache for ${cacheKey}:`, error);
  }
}

/**
 * Update scraper health status
 */
async function updateScraperHealth(
  scraperName: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  if (!scraperName) return;

  try {
    const ref = db.collection('scraperHealth').doc(scraperName);
    const doc = await ref.get();
    const existing = doc.data() || {};

    const now = Date.now();
    const errorCountLast7 = existing.errorCountLast7 || 0;
    const consecutiveErrors = existing.consecutiveErrors || 0;

    let status = existing.status || 'ok';
    let newConsecutiveErrors = consecutiveErrors;

    if (success) {
      status = 'ok';
      newConsecutiveErrors = 0;
    } else {
      newConsecutiveErrors = consecutiveErrors + 1;
      if (newConsecutiveErrors >= 3) {
        status = 'broken';
      } else if (newConsecutiveErrors >= 1) {
        status = 'warning';
      }
    }

    await ref.set({
      lastRunAt: now,
      status,
      errorCountLast7: success ? errorCountLast7 : errorCountLast7 + 1,
      consecutiveErrors: newConsecutiveErrors,
      lastErrorMessage: errorMessage || existing.lastErrorMessage || null,
      lastSuccessAt: success ? now : existing.lastSuccessAt || null,
      updatedAt: now,
    }, { merge: true });

    console.log(`Scraper health updated: ${scraperName} - ${status}`);
  } catch (error) {
    console.error(`Error updating scraper health for ${scraperName}:`, error);
  }
}

/**
 * Fetch and cache HTTP response with rate limiting and retries
 */
export async function fetchAndCache(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const {
    cacheKey: customCacheKey,
    cacheTTL = 43200, // 12 hours default
    skipCache = false,
    retries = 3,
    scraperName,
    ...axiosOptions
  } = options;

  const cacheKey = generateCacheKey(url, customCacheKey);

  // Try cache first
  if (!skipCache) {
    const cached = await getCachedResponse(cacheKey, cacheTTL);
    if (cached) {
      await updateScraperHealth(scraperName || 'unknown', true);
      return cached.html;
    }
  }

  // Fetch with retries
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Wait for rate limit token
      await globalRateLimiter.acquire();

      // Add jitter delay between 1-3 seconds
      if (attempt > 0) {
        const backoffDelay = exponentialBackoff(attempt - 1, 2000, 16000);
        console.log(`Retry attempt ${attempt} after ${backoffDelay}ms backoff`);
        await sleep(backoffDelay);
      } else {
        await sleep(Math.random() * 2000 + 1000); // 1-3s jitter
      }

      console.log(`Fetching: ${url} (attempt ${attempt + 1}/${retries + 1})`);

      const response: AxiosResponse = await axios({
        url,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          ...axiosOptions.headers,
        },
        timeout: 15000,
        maxRedirects: 5,
        ...axiosOptions,
      });

      const html = response.data;

      // Validate response
      if (!html || typeof html !== 'string' || html.length < 100) {
        throw new Error('Invalid response: too short or empty');
      }

      // Cache response
      const cached: CachedResponse = {
        html,
        etag: response.headers['etag'],
        lastModified: response.headers['last-modified'],
        cachedAt: Date.now(),
      };
      await setCachedResponse(cacheKey, cached);

      // Update health
      await updateScraperHealth(scraperName || 'unknown', true);

      return html;
    } catch (error: any) {
      lastError = error;
      console.error(`Fetch error (attempt ${attempt + 1}):`, {
        url,
        error: error.message,
        status: error.response?.status,
      });

      // Don't retry on client errors (4xx)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        break;
      }
    }
  }

  // All retries failed
  const errorMessage = `Failed to fetch ${url}: ${lastError?.message}`;
  await updateScraperHealth(scraperName || 'unknown', false, errorMessage);
  throw new Error(errorMessage);
}

/**
 * Batch fetch multiple URLs with rate limiting
 */
export async function fetchBatch(
  urls: string[],
  options: FetchOptions = {}
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  for (const url of urls) {
    try {
      const html = await fetchAndCache(url, options);
      results.set(url, html);
    } catch (error: any) {
      console.error(`Failed to fetch ${url}:`, error.message);
      // Continue with other URLs
    }
  }

  return results;
}
