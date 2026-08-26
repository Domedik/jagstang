/** Digits only from a phone string (drops +, spaces, dashes, etc.). */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * True when two phones match after digit normalization.
 * If either normalized value is longer than 10 digits, also compare last 10 (MX local).
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const last10 = (d: string) => (d.length > 10 ? d.slice(-10) : d);
  return last10(da) === last10(db);
}
