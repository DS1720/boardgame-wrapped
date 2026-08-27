import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import type { WrappedStats } from '@/stats/types';
import { VIDEO } from './config';

export interface WrappedProps {
  stats?: WrappedStats | null;
}

/**
 * Step 1 placeholder composition. Steps 6-8 replace this with the theme system,
 * the real slides and the audio track. It exists now so the render pipeline can
 * be verified end to end before any design work starts.
 */
export const Wrapped: React.FC<WrappedProps> = ({ stats = null }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { stiffness: 120, damping: 18 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0E1512',
        color: '#F0EDE4',
        padding: VIDEO.safeMargin,
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` }}>
        <p
          style={{
            fontSize: 32,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#8C9A93',
            margin: 0,
          }}
        >
          {stats?.rangeLabel ?? 'No data'}
        </p>
        <h1 style={{ fontSize: 132, lineHeight: 1, margin: '24px 0 0' }}>
          {stats?.playerName ?? 'Board Game Wrapped'}
        </h1>
        <p style={{ fontSize: 40, color: '#F2C879', marginTop: 40 }}>
          {stats ? `${stats.stats.length} slides ready` : 'Drop an export to begin'}
        </p>
      </div>
    </AbsoluteFill>
  );
};
