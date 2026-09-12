export function chronologicalSessions<T extends { completedAt: string }>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
}

export function formatSessionChartLabel(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

export function formatSessionTooltipTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
