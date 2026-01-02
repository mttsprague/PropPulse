/**
 * Share Card Component (React Native)
 * 
 * Renders a prop card in a shareable format for export to PNG
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PropCard } from '@proppulse/shared/prop-card';
import { ThemeMode, THEME_CONFIGS } from '@proppulse/shared/export/types';

interface ShareCardProps {
  propCard: PropCard;
  theme?: ThemeMode;
  verificationId?: string;
  showWatermark?: boolean;
}

export const ShareCard = React.forwardRef<View, ShareCardProps>(
  ({ propCard, theme = 'LIGHT', verificationId, showWatermark = true }, ref) => {
    const config = THEME_CONFIGS[theme];
    const { meta, summary, trend } = propCard;

    // Determine if OVER or UNDER
    const isOver = meta.side === 'OVER';
    const sideColor = isOver ? '#22c55e' : '#ef4444';

    // Format date
    const gameDate = new Date(meta.gameDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Format hit rate percentage
    const formatHitRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

    const isDark = theme === 'DARK';

    return (
      <View
        ref={ref}
        style={[
          styles.container,
          {
            width: config.width,
            height: config.height,
            backgroundColor: config.backgroundColor,
            borderColor: isDark ? '#374151' : '#e5e7eb',
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={[styles.playerName, { color: config.textColor }]}>
              {meta.playerName}
            </Text>
          </View>

          <Text style={[styles.gameInfo, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            {meta.teamAbbr}
            {meta.opponentAbbr && ` @ ${meta.opponentAbbr}`} • {gameDate}
          </Text>

          {/* Prop line */}
          <View style={[styles.propBadge, { backgroundColor: sideColor }]}>
            <Text style={styles.propText}>
              {meta.side} {meta.line} {meta.statType}
            </Text>
          </View>
        </View>

        {/* Hit Rates */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: config.textColor }]}>
            Hit Rates
          </Text>

          <View style={styles.hitRatesRow}>
            {/* Last 10 */}
            <View
              style={[
                styles.hitRateCard,
                { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
              ]}
            >
              <Text style={[styles.hitRateLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                Last 10
              </Text>
              <Text style={[styles.hitRateValue, { color: sideColor }]}>
                {formatHitRate(summary.last10.hitRate)}
              </Text>
              <Text style={[styles.hitRateRecord, { color: config.textColor }]}>
                {summary.last10.wins}-{summary.last10.losses}
                {summary.last10.pushes > 0 && ` (${summary.last10.pushes}P)`}
              </Text>
            </View>

            {/* Last 20 */}
            <View
              style={[
                styles.hitRateCard,
                { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
              ]}
            >
              <Text style={[styles.hitRateLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                Last 20
              </Text>
              <Text style={[styles.hitRateValue, { color: sideColor }]}>
                {formatHitRate(summary.last20.hitRate)}
              </Text>
              <Text style={[styles.hitRateRecord, { color: config.textColor }]}>
                {summary.last20.wins}-{summary.last20.losses}
                {summary.last20.pushes > 0 && ` (${summary.last20.pushes}P)`}
              </Text>
            </View>

            {/* Season */}
            <View
              style={[
                styles.hitRateCard,
                { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
              ]}
            >
              <Text style={[styles.hitRateLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                Season
              </Text>
              <Text style={[styles.hitRateValue, { color: sideColor }]}>
                {formatHitRate(summary.season.hitRate)}
              </Text>
              <Text style={[styles.hitRateRecord, { color: config.textColor }]}>
                {summary.season.wins}-{summary.season.losses}
              </Text>
            </View>
          </View>
        </View>

        {/* Last 5 Games */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: config.textColor }]}>
            Recent Games
          </Text>

          <View style={styles.gamesRow}>
            {trend.last5GameLogs.slice(0, 5).map((log, i) => {
              const outcomeColor =
                log.outcome === 'WIN' ? '#22c55e' : log.outcome === 'LOSS' ? '#ef4444' : '#9ca3af';

              return (
                <View
                  key={i}
                  style={[
                    styles.gameCard,
                    {
                      backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                      borderColor: outcomeColor,
                    },
                  ]}
                >
                  <Text style={[styles.gameValue, { color: outcomeColor }]}>
                    {log.statValue}
                  </Text>
                  <Text style={[styles.gameMinutes, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                    {log.minutes}m
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Insights */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: config.textColor }]}>
            Key Insights
          </Text>

          <View
            style={[
              styles.insightsBox,
              { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
            ]}
          >
            {summary.quickInsights.map((insight, i) => (
              <View key={i} style={styles.insightRow}>
                <Text style={[styles.bullet, { color: config.accentColor }]}>•</Text>
                <Text style={[styles.insightText, { color: config.textColor }]}>
                  {insight}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            { borderTopColor: isDark ? '#374151' : '#e5e7eb' },
          ]}
        >
          {showWatermark && (
            <View style={styles.footerTop}>
              <Text style={[styles.watermark, { color: config.accentColor }]}>
                PropPulse
              </Text>

              {verificationId && (
                <Text style={[styles.verificationId, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                  ID: {verificationId}
                </Text>
              )}
            </View>
          )}

          <Text style={[styles.disclaimer, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            {meta.disclaimer}
          </Text>

          <Text style={[styles.timestamp, { color: isDark ? '#4b5563' : '#d1d5db' }]}>
            Generated: {new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
          </Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  playerName: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  gameInfo: {
    fontSize: 16,
    marginBottom: 12,
  },
  propBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  propText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  hitRatesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  hitRateCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  hitRateLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  hitRateValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  hitRateRecord: {
    fontSize: 12,
    marginTop: 4,
  },
  gamesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gameCard: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
  },
  gameValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  gameMinutes: {
    fontSize: 10,
    marginTop: 2,
  },
  insightsBox: {
    padding: 12,
    borderRadius: 8,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  bullet: {
    fontWeight: '700',
    fontSize: 13,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  watermark: {
    fontSize: 18,
    fontWeight: '700',
  },
  verificationId: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
  },
});

ShareCard.displayName = 'ShareCard';
