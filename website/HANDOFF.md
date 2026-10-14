# Havana website: Claude ⇄ Codex

The website's own coordination file (the user asked us to communicate here). Append to **Log** at the bottom.
Don't rewrite the other agent's entries. Project-wide locks stay in `/HANDOFF.md`.

## Goal
An app landing page for Havana with an **Android download**, in the app's brand. Static, fast on cheap Android phones
and mobile data. Hosted as a free Render static site (`havana-web`, from `/render.yaml`).

## Ownership
| Who | Files |
|---|---|
| **Claude** | `index.html` (structure, copy), `styles.css`, `HANDOFF.md`, `/render.yaml`, deploy |
| **Codex** | `assets/**` (images, illustrations, screenshots), `motion.js`, and the contents of the two marked blocks in `index.html`: `<!-- CODEX: hero visual -->` and `<!-- CODEX: screenshots -->` |

Need to touch someone else's file? Ask in the Log first.

## Rules (both of us)
- **CSP is `'self'` only**: no CDNs, remote fonts, analytics or hot-linked images. Everything lives in `website/`.
- Brand: indigo `#23206B`, mango `#FFB020` (buying/offers), hibiscus `#F0437B` (swaps/matches), leaf `#1FA774` (likes/safety), ink `#16152E`, muted `#6B6A86`, bg `#F6F6FA`. Font: Bricolage Grotesque (self-hosted woff2 in `assets/fonts/`).
- **Weight budget:** each image ≤ 150 KB (WebP, ~q75), the whole page ≤ 1 MB first load. Give `<img>` width/height, `loading="lazy"` below the fold, real `alt` text.
- Respect `prefers-reduced-motion`. Tap targets ≥ 48 px. Test at 360 px wide.
- No fake stats, testimonials or partner logos. No real brand logos in generated images (e.g. no Nike swoosh).

## Images requested from Codex (user: "ask Codex to generate some images")
| # | File | Size | Brief |
|---|---|---|---|
| 1 | `assets/hero.webp` (transparent) | 1200×1200 | Hero: a fanned stack of 3 phone-sized swipe cards showing pre-loved items (tan sneakers, a denim jacket, a painted wooden stool). The front card has the **tilted mango price tag "GH₵220"** in the top-right corner and a green "WANT IT" stamp. Playful, bold, Accra-market energy, on transparent. Goes in the hero block (replaces my CSS placeholder). |
| 2 | `assets/market.webp` | 1600×900 | Illustration: a lively Accra second-hand market scene (stalls, clothes rails, shoes, furniture, a seller and buyer agreeing on a price), warm light, brand palette accents. Used as a band image (I'll place it once it exists). |
| 3 | `assets/way-shop.webp`, `way-haggle.webp`, `way-swap.webp` | 600×600 each | Spot illustrations for "Swipe to shop" (heart / saved card), "Haggle a little" (offer bubble "GH₵180?" with mango chips), "Swap it" (two items with a hibiscus ↔ arrow). Same style as #1/#2. |
| 4 | `assets/og.png` | 1200×630 | Social share card: `havana.` wordmark + "Good things. New stories." + hero art. Used for `og:image`. |
| 5 | `assets/screen-*.webp` | ~720 wide | Real screenshots from the APK on the emulator (`Medium_Phone_API_36.0`, seed login `0241000001`): Discover (swipe card), chat with an offer, the "It's a Havana Match!" screen. Optionally framed in a simple phone outline. Fill the `CODEX: screenshots` block and remove its `hidden` attribute. |

When an image lands, post its path, size and dimensions in the Log. I'll wire up anything outside your blocks.

## Download gate (why the button is disabled)
Production still uses dev login codes (shown on screen), so anyone with the APK could sign in as any phone number.
The download goes live after:
1. **User:** creates a Brevo key + verified sender and puts them in `backend/.env.production` (`BREVO_API_KEY`, `OTP_EMAIL_FROM`).
2. **Claude:** sets them on Render, sets `DEV_OTP=false`, and removes `ALLOW_DEV_OTP_IN_PRODUCTION` from `render.yaml`. Then verifies `GET /auth/methods` → `{email:true, phone:false}` and that a real emailed code logs in. The current APK already hides phone login when the server says so (`src/login-methods.ts`).
3. **Codex or Claude:** uploads the preview APK to a public download location (e.g. R2 `downloads/havana-beta.apk`) and records its SHA-256 here.
4. **Claude:** replaces the disabled button with the real link plus install steps ("Allow from this source", Android 7+), and the SHA-256.

## Status
- Skeleton: **ready** (see Log).

## Log
- **Claude, 2026-10-14:** Skeleton ready: `index.html` (hero, how it works, categories, safety, hidden screenshots block, download, footer → API `/privacy` and `/account-deletion`), `styles.css` (responsive, reduced-motion safe), `motion.js` (small scroll reveal), `assets/` icons + self-hosted Bricolage woff2 (≈25 KB each). The hero has a CSS placeholder (card stack + tilted price tag) so the page looks finished before art lands. Codex: your blocks are free. Image list above.
- **Claude, 2026-10-14:** **Live at https://havana-web.onrender.com** (Render blueprint created `havana-web` automatically on push of `5bbf6a7`). CSP and nosniff headers are confirmed on the live response. Every push to `main` touching `website/` redeploys. Codex: your images will go live as soon as they're committed.
