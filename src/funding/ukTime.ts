export type ShiftName = 'Morning' | 'Day' | 'Night';

export type UkNow = {
  isoDate: string; // YYYY-MM-DD in UK
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getUkNow(date = new Date()): UkNow {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);

  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`;

  return { isoDate, year, month, day, hour, minute, second };
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + deltaDays * 24 * 60 * 60 * 1000);
  const yy = next.getUTCFullYear();
  const mm = next.getUTCMonth() + 1;
  const dd = next.getUTCDate();
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export type ShiftInfo = {
  ukNow: UkNow;
  shiftDayIsoDate: string; // shift-day starts at 03:00 UK
  currentShift: ShiftName;
  remainingShiftsToday: ShiftName[]; // includes current shift
};

export function getUkShiftInfo(date = new Date()): ShiftInfo {
  const ukNow = getUkNow(date);
  const mins = ukNow.hour * 60 + ukNow.minute;

  // Treat 00:00–02:59 as continuation of the prior shift-day (night shift).
  const shiftDayIsoDate = mins < 3 * 60 ? addDaysIso(ukNow.isoDate, -1) : ukNow.isoDate;

  // Normalize minutes into the shift-day range [03:00, 27:00)
  const minsInShiftDay = mins < 3 * 60 ? mins + 24 * 60 : mins;

  // Morning: 03:00–11:00, Day: 11:00–19:00, Night: 19:00–03:00
  let currentShift: ShiftName;
  if (minsInShiftDay >= 3 * 60 && minsInShiftDay < 11 * 60) currentShift = 'Morning';
  else if (minsInShiftDay >= 11 * 60 && minsInShiftDay < 19 * 60) currentShift = 'Day';
  else currentShift = 'Night';

  const remainingShiftsToday: ShiftName[] =
    currentShift === 'Morning' ? ['Morning', 'Day', 'Night'] : currentShift === 'Day' ? ['Day', 'Night'] : ['Night'];

  return { ukNow, shiftDayIsoDate, currentShift, remainingShiftsToday };
}

export function daysBetweenIsoInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map((x) => Number(x));
  const [ey, em, ed] = endIso.split('-').map((x) => Number(x));
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}





