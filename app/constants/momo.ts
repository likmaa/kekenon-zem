export type MomoProvider = 'MTN_MOMO_BEN' | 'MOOV_BEN';

export const MOMO_PROVIDERS: { value: MomoProvider; label: string; hint: string }[] = [
  { value: 'MTN_MOMO_BEN', label: 'MTN MoMo', hint: 'MTN Mobile Money' },
  { value: 'MOOV_BEN', label: 'Moov Money', hint: 'Moov Bénin' },
];

export function isValidBeninPhone(raw: string): boolean {
  const digits = raw.replace(/\D+/g, '');
  const local = digits.startsWith('229') ? digits.slice(3) : digits;
  return local.length >= 8 && local.length <= 10;
}
