export function poundsToPence(amount: number): number {
  // Discord "NumberOption" is a JS number; round to nearest penny.
  return Math.round(amount * 100);
}

export function parseMoneyToPence(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const cleaned = s.replace(/[£$,]/g, '').replace(/\s+/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const pence = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isFinite(pence)) return null;
  return pence;
}

export function formatPence(pence: number, currencySymbol = '$'): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const dollarsStr = dollars.toLocaleString('en-US');
  return `${sign}${currencySymbol}${dollarsStr}.${String(cents).padStart(2, '0')}`;
}


