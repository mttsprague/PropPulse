import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const StatTypeSchema = z.enum(['PTS', 'REB', 'AST']);
export const OverUnderSchema = z.enum(['O', 'U']);
export const UserPlanSchema = z.enum(['free', 'pro']);

export const PropCardRequestSchema = z.object({
  playerId: z.string().optional(),
  playerName: z.string().optional(),
  statType: StatTypeSchema,
  line: z.number().positive(),
  overUnder: OverUnderSchema,
  includePro: z.boolean().optional(),
}).refine(
  (data) => data.playerId || data.playerName,
  { message: 'Either playerId or playerName must be provided' }
);

export const SavedPropRequestSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  statType: StatTypeSchema,
  line: z.number().positive(),
  overUnder: OverUnderSchema,
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const DailyFeedRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  watchlistOnly: z.boolean().optional(),
});

export const ExportPropCardRequestSchema = z.object({
  savedPropId: z.string().optional(),
  propCardData: z.any().optional(), // PropCardData type
}).refine(
  (data) => data.savedPropId || data.propCardData,
  { message: 'Either savedPropId or propCardData must be provided' }
);

export const ManualUploadCSVSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opponent: z.string(),
  homeAway: z.enum(['home', 'away']),
  minutes: z.number().nonnegative(),
  pts: z.number().nonnegative(),
  reb: z.number().nonnegative(),
  ast: z.number().nonnegative(),
  started: z.boolean(),
});

export const PlayerSearchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().positive().max(50).optional(),
});

export const UpdateSavedPropSchema = z.object({
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const WatchlistItemSchema = z.object({
  type: z.enum(['player', 'team']),
  refId: z.string().min(1),
  name: z.string().min(1),
});
