export function formatIsoForDatetimeLocal(iso: string, includeSeconds = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateForDatetimeLocal(date, includeSeconds);
}

export function formatDateForDatetimeLocal(date: Date, includeSeconds = false): string {
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return includeSeconds
    ? `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
    : `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseDatetimeLocal(value: string): Date | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds ?? '0'),
    0
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function datetimeLocalToIso(value: string): string | null {
  const date = parseDatetimeLocal(value);
  return date ? date.toISOString() : null;
}
