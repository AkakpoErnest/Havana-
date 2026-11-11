/** Countries Havana runs in. Each person and listing belongs to one; prices use that country's currency. */
export const COUNTRIES = {
  GH: { name: 'Ghana', currency: 'GHS', symbol: 'GH₵', dial: '233', national: /^[235]\d{8}$/, example: '0541234567', city: 'Accra', center: [5.6037, -0.187] },
  NG: { name: 'Nigeria', currency: 'NGN', symbol: '₦', dial: '234', national: /^[789][01]\d{8}$/, example: '08031234567', city: 'Lagos', center: [6.5244, 3.3792] },
  KE: { name: 'Kenya', currency: 'KES', symbol: 'KSh', dial: '254', national: /^[17]\d{8}$/, example: '0712345678', city: 'Nairobi', center: [-1.2921, 36.8219] },
} as const;
export type CountryCode = keyof typeof COUNTRIES;
export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
export const DEFAULT_COUNTRY: CountryCode = 'GH';
export const isCountry = (c: unknown): c is CountryCode => typeof c === 'string' && c in COUNTRIES;

/** "+254712345678" → "KE"; null for numbers outside our countries. */
export function countryOfPhone(phone: string): CountryCode | null {
  return COUNTRY_CODES.find((c) => phone.startsWith(`+${COUNTRIES[c].dial}`)) ?? null;
}

/** Whole amounts with the currency's symbol, e.g. "GH₵1,200", "₦25,000", "KSh 3,500". */
export function money(amount: number, currency: string) {
  const country = COUNTRY_CODES.find((c) => COUNTRIES[c].currency === currency);
  const symbol = country ? COUNTRIES[country].symbol : `${currency} `;
  return `${symbol}${symbol === 'KSh' ? ' ' : ''}${Math.round(amount).toLocaleString('en-US')}`;
}
