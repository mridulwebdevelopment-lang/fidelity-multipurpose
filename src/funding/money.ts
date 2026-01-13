export function poundsToPence(amount: number): number {
  // Discord "NumberOption" is a JS number; round to nearest penny.
  return Math.round(amount * 100);
}

export function parseMoneyToPence(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  
  // More robust cleaning: remove currency symbols, commas, spaces, and common OCR errors
  // Handle cases like "$1,234.56", "£1234.56", "1234.56$", etc.
  let cleaned = s
    .replace(/[£$]/g, '') // Remove currency symbols
    .replace(/,/g, '') // Remove thousand separators
    .replace(/\s+/g, '') // Remove spaces
    .replace(/[Oo]/g, '0') // Common OCR error: O instead of 0
    .replace(/[Il1]/g, '1') // Common OCR error: I or l instead of 1
    .replace(/[S5]/g, '5') // Common OCR error: S instead of 5
    .replace(/[Z2]/g, '2'); // Common OCR error: Z instead of 2 (less common but possible)
  
  // Match patterns like: digits.digits, digits, or just digits
  // More lenient: allow up to 3 decimal places (will truncate to 2)
  const moneyPattern = /^(\d+)(?:\.(\d{1,3}))?$/;
  const match = cleaned.match(moneyPattern);
  if (!match) return null;
  
  const whole = match[1] || '0';
  const frac = (match[2] || '').padEnd(2, '0').slice(0, 2); // Pad to 2 digits, take first 2
  
  const pence = Number(whole) * 100 + Number(frac);
  if (!Number.isFinite(pence) || pence < 0) return null;
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


