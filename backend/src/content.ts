import { BadRequestException } from '@nestjs/common';
import { coded } from './errors';

/**
 * Pre-publication screening (App Store 1.2, Google Play UGC policy). A word list can't catch everything,
 * so this sits alongside reporting, blocking and moderators, but it stops the obvious cases before
 * anyone else sees them. Matching is on whole words after light normalisation (case, accents, common
 * letter swaps like 0→o and @→a, and stretched letters), so "Scunthorpe"-style false positives are rare.
 */

/** Things Havana never allows as listings (community rules: weapons, drugs, fake documents, animals, etc.). */
const PROHIBITED_ITEMS = [
  'handgun', 'handguns', 'firearm', 'firearms', 'rifle', 'rifles', 'shotgun', 'shotguns', 'revolver',
  'ammunition', 'ammo', 'bullets', 'grenade', 'grenades', 'explosive', 'explosives',
  'cocaine', 'heroin', 'meth', 'crystal meth', 'marijuana', 'cannabis', 'ganja', 'bhang', 'kush', 'tramadol', 'codeine',
  'mdma', 'ecstasy pills', 'lsd',
  'fake id', 'fake passport', 'passport for sale', 'counterfeit', 'replica notes', 'fake notes', 'fake currency',
  'elephant ivory', 'rhino horn', 'pangolin', 'puppies for sale', 'kittens for sale', 'live animal',
  'prescription drugs', 'antibiotics',
];

/** Abuse and slurs that have no place in names, listings or chats. Kept short and unambiguous on purpose. */
const ABUSE = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'cunt', 'bitch', 'bastard', 'asshole', 'dickhead', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kill yourself', 'kys',
  'ashawo', 'malaya', 'kumbafu', 'mshenzi',
];

const swaps: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Lowercase, strip accents, undo common letter swaps, squeeze repeated letters ("fuuuck" → "fuck"), keep words separated by spaces. */
export function normalise(text: string) {
  return ` ${text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!]/g, (c) => swaps[c] ?? c)
    .replace(/([a-z])\1+/g, '$1')
    .replace(/[^a-z]+/g, ' ')
    .trim()} `;
}

// The lists go through the same normalisation, so "asshole" and "a$$hole" both become "ashole".
const prepared = (words: string[]) => words.map((w) => normalise(w).trim());
const ITEMS = prepared(PROHIBITED_ITEMS);
const ABUSIVE = prepared(ABUSE);
const has = (haystack: string, words: string[]) => words.find((w) => haystack.includes(` ${w} `));

/** The first rule a piece of text breaks, or null. */
export function screen(text: string, kind: 'listing' | 'text') {
  const clean = normalise(text);
  const abuse = has(clean, ABUSIVE);
  if (abuse) return 'abuse' as const;
  if (kind === 'listing' && has(clean, ITEMS)) return 'prohibited' as const;
  return null;
}

/** Throw a friendly 400 (code CONTENT_NOT_ALLOWED) if any of the texts breaks the community rules. */
export function assertAllowed(kind: 'listing' | 'text', ...texts: (string | null | undefined)[]) {
  for (const text of texts) {
    if (!text) continue;
    const problem = screen(text, kind);
    if (problem === 'abuse')
      throw new BadRequestException(coded('CONTENT_NOT_ALLOWED', 'Please keep it friendly. That wording isn’t allowed on Havana.'));
    if (problem === 'prohibited')
      throw new BadRequestException(coded('CONTENT_NOT_ALLOWED', 'That item isn’t allowed on Havana. See the community rules for what can’t be listed.'));
  }
}
