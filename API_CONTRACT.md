# Havana API Contract (v1): what the backend actually does

Written by Claude from the backend code in `backend/src`. Last updated 2026-09-23 17:50 (findings 1–6 shipped).
**The code is the source of truth.** If you change a route, update this file in the same step.

- Base URL: `EXPO_PUBLIC_API_URL`, e.g. `http://192.168.1.20:3000`. There is **no** `/api` prefix.
- JSON everywhere except `POST /uploads` (multipart). Money is whole Ghana cedis (integers).
- Auth: `Authorization: Bearer <token>` (JWT, 30 days). 🔒 marks routes that need a token.
- IDs are UUIDs. Photo paths are stored and returned relative (`/uploads/x.jpg`), and the mobile
  app prefixes `API_URL`. Seed photos are absolute Unsplash URLs.
- Errors come back as Nest's default shape: `{ statusCode, message, error }`. `message` is a
  friendly string, or a string[] for validation errors.

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ok:true, app:'Havana'}` |
| POST | `/auth/request` | `{type:'PHONE'\|'EMAIL', value}` | `{challengeId, expiresIn:300, devCode?}` (devCode only when `DEV_OTP=true`; the code is also logged) |
| POST | `/auth/verify` | `{challengeId, code}` | `{token, user:{id,name}}`. Creates the account on first login. |
| POST 🔒 | `/auth/link/request` | `{type, value}` | same as `/auth/request` (backup login) |
| POST 🔒 | `/auth/link/verify` | `{challengeId, code}` | `{token, user}` (same account, now with 2 identities) |

Phone numbers are normalised: `0541234567`, `233541234567` and `054 123 4567` all become `+233541234567`.
You can request a new code once a minute per identifier. A code expires after 5 minutes or 5 wrong attempts.
A user can have at most one PHONE and one EMAIL identity. Each IP gets 20 requests per minute on `/auth/*`.

## Me
| Method | Path | Body | Returns |
|---|---|---|---|
| GET 🔒 | `/me` | | user (`id,name,area,latitude,longitude,createdAt`) + `identities[]` + `items[]` (all statuses, newest first) + `rating` (avg or null) + `ratingCount` |
| PATCH 🔒 | `/me` | `{name?, area?, latitude?, longitude?}`. All optional; send lat and lng together. | same as `GET /me` (**changed**: it used to return `{id,name}`) |
| GET 🔒 | `/saved` | | items I swiped RIGHT on in SHOP (not hidden/removed) |
| DELETE 🔒 | `/saved/:itemId` | | `{saved:false}` (unsave; the item stays out of the Shop feed) |

## Items (listings)
**Photo previews:** for any photo URL ending in `.webp`, the preview is the same URL with `.webp` replaced by `_thumb.webp`
(`…/abc.webp` → `…/abc_thumb.webp`). Use previews on swipe cards and in lists, and the full URL on the item page.
Seed/older photos (Unsplash, `.jpg`) have no preview, so use them as-is.
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST 🔒 | `/uploads` | multipart `photos` (1–6 files, jpeg/png/webp, max 5 MB each) | `{photos:[url]}`. The server re-encodes each photo as **WebP**, at most 1280px and **≤300 KB** (typically 25–140 KB), strips EXIF/GPS, and also stores a **~5–20 KB preview**. URLs are `/uploads/<id>.webp` locally, or absolute `https://pub-….r2.dev/<id>.webp` when Cloudflare R2 is configured. |
| POST 🔒 | `/items` | `{title 3–100, description 5–2000, category, condition, sell, swap, price?, swapValue?, photos[1–6] (your own upload paths), area 2–80, latitude?, longitude?}` | Item |
| GET 🔒 | `/items/:id` | | Item + `owner:{id,name,rating,ratingCount}` (404 if hidden/removed, unless it's yours) |
| PATCH 🔒 | `/items/:id/status` | `{status: LIVE\|RESERVED\|SOLD\|REMOVED}` | Item (owner only; SWAPPED is set only by completing a swap) |
| POST 🔒 | `/items/:id/report` | `{reason 5–500}` | `{reported:true}`. Hidden after 3 distinct reporters. |

Enums: category `CLOTHES SHOES BAGS FURNITURE ELECTRONICS HOUSEHOLD OTHER`,
condition `NEW LIKE_NEW GOOD FAIR`, status `LIVE RESERVED SOLD SWAPPED REMOVED`, kind `ITEM` (`RENTAL` reserved).

## Discover
| Method | Path | Returns |
|---|---|---|
| GET 🔒 | `/feed?mode=SHOP\|SWAP&category=&latitude=&longitude=` | `{items: Item+distanceKm+score (max 30), needsCloset}` |

The feed excludes my items and anything I've swiped on in that mode. SHOP shows only sellable items,
SWAP only swappable ones. It ranks by distance (location order: `latitude/longitude` query → saved profile location from `PATCH /me` → central Accra),
then age, then (in SWAP) how close the value is to my closet.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST 🔒 | `/swipes` | `{itemId, mode, direction: RIGHT\|LEFT\|UP}` | SHOP RIGHT/LEFT: `{saved}` · SHOP UP: `{conversation}` (open Haggle) · SWAP RIGHT with a reciprocal swipe: `{match: Conversation}` · SWAP **RIGHT** with an empty closet: 400 "List something in your Swap Closet first." (SWAP LEFT/pass always works) |

## Chat & haggle
Each conversation has `buyerId`, `sellerId`, `itemId`, and `swapItemId` (non-null means it's a swap match).
It also has `buyerAgreed`, `sellerAgreed`, `buyerDone`, `sellerDone` and `completedAt`, and includes `item`, `swapItem`, `buyer` and `seller`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET 🔒 | `/conversations` | | up to 100 conversations with `messages:[last]`, most recent first. Each row also has `hasChatted` (any TEXT/OFFER yet) and `isNewMatch` (swap match, no TEXT/OFFER yet, not completed), which is what the "new matches" row uses |
| POST 🔒 | `/conversations` | `{itemId}` | find or create the buyer↔seller chat (with a safety-tip system message) |
| GET 🔒 | `/conversations/:id/messages?before=<ISO date>` | | `{conversation, messages (oldest first, max 100), hasMore, cursor}`. Initial load and older pages. |
| GET 🔒 | `/conversations/:id/messages?since=<cursor>` | | **3s poll.** `{conversation, messages, hasMore:false, cursor}`. `messages` = new messages **and** older ones whose `offerStatus` changed, oldest first. Merge by `id` (replace existing), then use the returned `cursor` for the next poll. Cursors overlap by 5s, so duplicates are expected. |
| POST 🔒 | `/conversations/:id/messages` | `{text 1–2000}` | Message |
| POST 🔒 | `/conversations/:id/offers` | `{amount}` | OFFER message. Older PENDING offers become COUNTERED. Only for live sale items, not swaps. |
| POST 🔒 | `/conversations/:id/offers/:messageId` | `{action: ACCEPT\|DECLINE}` | `{ok:true}`. Only the recipient can respond. ACCEPT reserves the item, declines other pending offers on it, and posts a system message. Counter = POST a new offer. |
| POST 🔒 | `/conversations/:id/swap` | `{action: AGREE\|DONE}` | Conversation. DONE needs both to have agreed. Once both have done it, both items become SWAPPED. |

Message: `{id, conversationId, senderId|null, type: TEXT|OFFER|SYSTEM, text, amount, offerStatus, createdAt, updatedAt}`.

## Trust
| Method | Path | Body | Returns |
|---|---|---|---|
| POST 🔒 | `/ratings` | `{toId, stars 1–5}` | Rating. Only allowed if both of you have sent a message in a shared chat. Rating again replaces the old rating. |

## Seed logins (DEV_OTP=true)
6 sellers, each with a phone **and** an email login (same account):
`0241000001` / `ama@havana.demo` Osu · `0241000002` / `kofi@havana.demo` Madina · `0241000003` / `esi@havana.demo` East Legon ·
`0241000004` / `yaw@havana.demo` Labone · `0241000005` / `akosua@havana.demo` Spintex · `0241000006` / `kwame@havana.demo` Kaneshie.
21 items: a mix of sell-only, swap-only and both. Re-running the seed is safe.
**One-tap match demo:** Kofi has already swap-righted Ama's black leather biker jacket, so log in as Ama and swap-right any Kofi item.
Likewise, Esi has swap-righted Yaw's smartwatch, so log in as Yaw and swap-right any Esi swap item.
