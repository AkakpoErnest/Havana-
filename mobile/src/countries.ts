// Countries Havana runs in; mirrors backend/src/countries.ts. Pure TS (no native imports) so tests can load it.
export const COUNTRIES = {
  GH: {
    name: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    symbol: 'GH₵',
    example: '0541234567',
    city: 'Accra',
    areas: 'Osu, Madina, East Legon…',
  },
  NG: {
    name: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    symbol: '₦',
    example: '08031234567',
    city: 'Lagos',
    areas: 'Yaba, Lekki, Ikeja…',
  },
  KE: {
    name: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    symbol: 'KSh',
    example: '0712345678',
    city: 'Nairobi',
    areas: 'Westlands, Kilimani, Kasarani…',
  },
} as const;
export type CountryCode = keyof typeof COUNTRIES;
export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
export const COUNTRY_LABELS = Object.fromEntries(
  COUNTRY_CODES.map((c) => [c, `${COUNTRIES[c].flag} ${COUNTRIES[c].name}`]),
) as Record<CountryCode, string>;
export const countryOf = (c: string | null | undefined) =>
  COUNTRIES[c && c in COUNTRIES ? (c as CountryCode) : 'GH'];

/** First guess for the login screen: the phone's region if we serve it (e.g. en-KE → KE), else Ghana. */
export function guessCountry(locale = Intl.DateTimeFormat().resolvedOptions().locale): CountryCode {
  const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
  return region && region in COUNTRIES ? (region as CountryCode) : 'GH';
}

/** Whole amounts with the listing's currency, e.g. "GH₵1,200", "₦25,000", "KSh 3,500". */
export function money(n: number | null | undefined, currency = 'GHS') {
  const country = COUNTRY_CODES.find((c) => COUNTRIES[c].currency === currency);
  const symbol = country ? COUNTRIES[country].symbol : `${currency} `;
  return `${symbol}${symbol === 'KSh' ? ' ' : ''}${Math.round(n ?? 0).toLocaleString('en-US')}`;
}
