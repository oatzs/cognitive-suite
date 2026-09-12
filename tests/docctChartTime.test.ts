import { describe, expect, it } from 'vitest';
import {
  chronologicalSessions,
  formatSessionChartLabel,
  formatSessionTooltipTime,
} from '../src/lib/docct/chartTime';

describe('DocCT chart timestamps', () => {
  it('orders session points from oldest to newest without mutating history', () => {
    const sessions = [
      { completedAt: '2026-09-12T18:00:00Z', accuracy: 0.8 },
      { completedAt: '2026-09-10T18:00:00Z', accuracy: 0.7 },
      { completedAt: '2026-09-11T18:00:00Z', accuracy: 0.9 },
    ];

    expect(chronologicalSessions(sessions).map(session => session.accuracy)).toEqual([0.7, 0.9, 0.8]);
    expect(sessions.map(session => session.accuracy)).toEqual([0.8, 0.7, 0.9]);
  });

  it('formats concise axis labels and precise tooltip timestamps', () => {
    const completedAt = '2026-01-03T16:05:06Z';

    expect(formatSessionChartLabel(completedAt, 'UTC')).toBe('Jan 3, 4:05 PM');
    expect(formatSessionTooltipTime(completedAt, 'UTC')).toBe('Jan 3, 2026, 4:05:06 PM');
  });
});
