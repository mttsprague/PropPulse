export const STAT_TYPES = ['PTS', 'REB', 'AST'] as const;

export const PLAN_LIMITS = {
  free: {
    propCardsPerDay: 5,
    savedPropsMax: 15,
    exportsPerDay: 1,
  },
  pro: {
    propCardsPerDay: Infinity,
    savedPropsMax: Infinity,
    exportsPerDay: Infinity,
  },
};

export const TIMEZONE = 'America/Chicago'; // CST

export const SCRAPER_SCHEDULES = {
  playerStats: '0 3 * * *', // 3 AM CST daily
  injuries: '0 9,13,17,21 * * *', // 9 AM, 1 PM, 5 PM, 9 PM CST
  schedule: '0 4 * * 0', // 4 AM CST every Sunday
};

export const MINUTES_SPIKE_THRESHOLD = 8; // ±8 minutes for daily feed
export const VOLATILITY_THRESHOLDS = {
  low: 0.15, // CV < 0.15
  medium: 0.30, // CV < 0.30
  // high: CV >= 0.30
};

export const TREND_SLOPE_THRESHOLDS = {
  weak: 0.5,
  moderate: 1.0,
  // strong: >= 1.0
};

export const MINUTES_STABILITY_THRESHOLDS = {
  stable: 3,
  moderate: 6,
  // volatile: >= 6
};

export const LINE_SENSITIVITY_THRESHOLDS = {
  low: 0.15, // < 15% within ±1
  medium: 0.30, // < 30% within ±1
  // high: >= 30% within ±1
};

export const DISTRIBUTION_BUCKET_SIZE = 5; // Bucket stats every 5 units

export const DEFAULT_USER_DATA = {
  plan: 'free' as const,
  limits: PLAN_LIMITS.free,
};

export const EXPORT_CONFIG = {
  watermarkText: 'PropPulse',
  disclaimerText: 'For informational purposes only. Not betting advice. Past performance does not guarantee future results.',
  maxExportWidth: 1200,
  maxExportHeight: 1600,
};

export const API_RATE_LIMITS = {
  propCard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },
  general: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
};

export const CACHE_TTL = {
  playerSearch: 3600, // 1 hour
  propCard: 1800, // 30 minutes
  dailyFeed: 900, // 15 minutes
};
