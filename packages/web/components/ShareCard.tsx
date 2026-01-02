/**
 * Share Card Component (Web)
 * 
 * Renders a prop card in a shareable format for export to PNG
 */

'use client';

import React from 'react';
import { PropCard } from '@proppulse/shared/prop-card';
import { ThemeMode, THEME_CONFIGS } from '@proppulse/shared/export/types';

interface ShareCardProps {
  propCard: PropCard;
  theme?: ThemeMode;
  verificationId?: string;
  showWatermark?: boolean;
}

export const ShareCard = React.forwardRef<HTMLDivElement, ShareCardProps>(
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

    return (
      <div
        ref={ref}
        style={{
          width: `${config.width}px`,
          height: `${config.height}px`,
          backgroundColor: config.backgroundColor,
          color: config.textColor,
          fontFamily: config.fontFamily,
          padding: `${config.padding}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          border: theme === 'LIGHT' ? '1px solid #e5e7eb' : '1px solid #374151',
          borderRadius: '12px',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h1
              style={{
                fontSize: '28px',
                fontWeight: '700',
                margin: '0',
                lineHeight: '1.2',
              }}
            >
              {meta.playerName}
            </h1>
          </div>

          <div style={{ fontSize: '16px', color: theme === 'LIGHT' ? '#6b7280' : '#9ca3af', marginBottom: '12px' }}>
            {meta.teamAbbr}
            {meta.opponentAbbr && ` @ ${meta.opponentAbbr}`} • {gameDate}
          </div>

          {/* Prop line */}
          <div
            style={{
              display: 'inline-block',
              backgroundColor: sideColor,
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '20px',
              fontWeight: '700',
            }}
          >
            {meta.side} {meta.line} {meta.statType}
          </div>
        </div>

        {/* Hit Rates */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: config.textColor }}>
            Hit Rates
          </h2>

          <div style={{ display: 'flex', gap: '12px' }}>
            {/* Last 10 */}
            <div
              style={{
                flex: 1,
                backgroundColor: theme === 'LIGHT' ? '#f3f4f6' : '#374151',
                padding: '12px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12px', color: theme === 'LIGHT' ? '#6b7280' : '#9ca3af', marginBottom: '4px' }}>
                Last 10
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: sideColor }}>
                {formatHitRate(summary.last10.hitRate)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {summary.last10.wins}-{summary.last10.losses}
                {summary.last10.pushes > 0 && ` (${summary.last10.pushes}P)`}
              </div>
            </div>

            {/* Last 20 */}
            <div
              style={{
                flex: 1,
                backgroundColor: theme === 'LIGHT' ? '#f3f4f6' : '#374151',
                padding: '12px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12px', color: theme === 'LIGHT' ? '#6b7280' : '#9ca3af', marginBottom: '4px' }}>
                Last 20
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: sideColor }}>
                {formatHitRate(summary.last20.hitRate)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {summary.last20.wins}-{summary.last20.losses}
                {summary.last20.pushes > 0 && ` (${summary.last20.pushes}P)`}
              </div>
            </div>

            {/* Season */}
            <div
              style={{
                flex: 1,
                backgroundColor: theme === 'LIGHT' ? '#f3f4f6' : '#374151',
                padding: '12px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '12px', color: theme === 'LIGHT' ? '#6b7280' : '#9ca3af', marginBottom: '4px' }}>
                Season
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: sideColor }}>
                {formatHitRate(summary.season.hitRate)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {summary.season.wins}-{summary.season.losses}
              </div>
            </div>
          </div>
        </div>

        {/* Last 5 Games */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: config.textColor }}>
            Recent Games
          </h2>

          <div style={{ display: 'flex', gap: '8px', fontSize: '14px' }}>
            {trend.last5GameLogs.slice(0, 5).map((log, i) => {
              const outcomeColor =
                log.outcome === 'WIN' ? '#22c55e' : log.outcome === 'LOSS' ? '#ef4444' : '#9ca3af';

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    backgroundColor: theme === 'LIGHT' ? '#f9fafb' : '#1f2937',
                    padding: '8px',
                    borderRadius: '6px',
                    textAlign: 'center',
                    border: `2px solid ${outcomeColor}`,
                  }}
                >
                  <div style={{ fontSize: '18px', fontWeight: '700', color: outcomeColor }}>
                    {log.statValue}
                  </div>
                  <div style={{ fontSize: '10px', color: theme === 'LIGHT' ? '#9ca3af' : '#6b7280', marginTop: '2px' }}>
                    {log.minutes}m
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insights */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: config.textColor }}>
            Key Insights
          </h2>

          <div
            style={{
              backgroundColor: theme === 'LIGHT' ? '#f3f4f6' : '#374151',
              padding: '12px',
              borderRadius: '8px',
            }}
          >
            {summary.quickInsights.map((insight, i) => (
              <div
                key={i}
                style={{
                  fontSize: '13px',
                  lineHeight: '1.6',
                  marginBottom: i < summary.quickInsights.length - 1 ? '8px' : '0',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <span style={{ color: config.accentColor, fontWeight: '700' }}>•</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: theme === 'LIGHT' ? '1px solid #e5e7eb' : '1px solid #374151',
            paddingTop: '12px',
          }}
        >
          {showWatermark && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: '700', color: config.accentColor }}>
                PropPulse
              </div>

              {verificationId && (
                <div
                  style={{
                    fontSize: '11px',
                    color: theme === 'LIGHT' ? '#9ca3af' : '#6b7280',
                    fontFamily: 'monospace',
                  }}
                >
                  ID: {verificationId}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              fontSize: '10px',
              color: theme === 'LIGHT' ? '#9ca3af' : '#6b7280',
              lineHeight: '1.4',
            }}
          >
            {meta.disclaimer}
          </div>

          <div
            style={{
              fontSize: '10px',
              color: theme === 'LIGHT' ? '#d1d5db' : '#4b5563',
              marginTop: '4px',
            }}
          >
            Generated: {new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
          </div>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = 'ShareCard';
