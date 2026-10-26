export function zonedTimeToUtcMs(dateParts: { year: number; month: number; day: number }, hhmm: string, timeZone: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, h ?? 0, m ?? 0);
  const offset = zoneOffsetMs(guess, timeZone);
  const first = guess - offset;
  const offset2 = zoneOffsetMs(first, timeZone);
  return guess - offset2;
}

export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function localDateParts(utcMs: number, timeZone: string): { year: number; month: number; day: number; key: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { year, month, day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}
