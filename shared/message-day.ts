/** Calendar-day labels in the device's timezone, including across DST changes. */
export function messageDay(at: number, now = Date.now(), locale?: string, labels = { today: 'Today', yesterday: 'Yesterday' }): string {
  const date = new Date(at);
  const current = new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(current.getTime())) return '';
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const daysAgo = Math.round((day(current) - day(date)) / 86_400_000);
  if (daysAgo === 0) return labels.today;
  if (daysAgo === 1) return labels.yesterday;
  if (daysAgo > 1 && daysAgo < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  return date.toLocaleDateString(locale, {
    month: 'short', day: 'numeric',
    ...(date.getFullYear() !== current.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}
