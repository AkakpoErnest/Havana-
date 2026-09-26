# Havana API Contract (v1): what the backend actually does

Written by Claude from the backend code in `backend/src`. Last updated 2026-09-23 17:50 (findings 1–6 shipped).
**The code is the source of truth.** If you change a route, update this file in the same step.

- Base URL: `EXPO_PUBLIC_API_URL`, e.g. `http://192.168.1.20:3000`. There is **no** `/api` prefix.
- JSON everywhere except `POST /uploads` (multipart). Money is whole Ghana cedis (integers).
- Auth: `Authorization: Bearer <token>` (JWT, 30 days). 🔒 marks routes that need a token.
- **Location privacy:** items you don't own never include `latitude/longitude` (they're `null`), and `distanceKm` is rounded to 0.5 km. You see your own items' coordinates.
- Public pages: `GET /privacy` (privacy policy) and `GET /account-deletion`.
- IDs are UUIDs. Photo paths are stored and returned relative (`/uploads/x.jpg`), and the mobile
  app prefixes `API_URL`. Seed photos are absolute Unsplash URLs.
- Errors: `{ statusCode, error, message, code }`. `message` is a friendly string to show the user
  (string[] for validation errors). **`code` is stable. Use it for app logic, never the message text.**
  Specific codes: `LISTING_UNAVAILABLE` (item sold/reserved/removed/hidden or wrong mode: drop the card),
  `CLOSET_EMPTY`, `OTP_INVALID`, `PHONE_LOGIN_UNAVAILABLE`, `EMAIL_LOGIN_UNAVAILABLE` (503), `OTP_RATE_LIMITED`, `OTP_DELIVERY_FAILED`, `INVALID_IDENTIFIER`,
  `IDENTITY_TAKEN`, `OFFER_NOT_PENDING`, `SWAP_NOT_AGREED`, `CANNOT_RATE`, `PHOTOS_NOT_OWNED`, `NO_PHOTOS`,
  `PHOTO_UNREADABLE`, `INVALID_PUSH_TOKEN`, `NOT_ADMIN` / `ADMIN_NEEDS_VERIFIED_LOGIN` (403), `ACCOUNT_DELETED` (401), `RATE_LIMITED` (429, per-user limits below), `VALIDATION_ERROR`. Otherwise a default for the status: `BAD_REQUEST`, `UNAUTHORIZED`,
  `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ok:true, app:'Havana'}` |
| GET | `/auth/methods` | | `{email:boolean, phone:boolean}`: which login types this server can deliver codes for. Only offer those in the app. |
| POST | `/auth/request` | `{type:'PHONE'\|'EMAIL', value}` | `{challengeId, expiresIn:300, devCode?}` (devCode only when `DEV_OTP=true`; the code is also logged) |
| POST | `/auth/verify` | `{challengeId, code}` | `{token, user:{id,name}}`. Creates the account on first login. |
| POST 🔒 | `/auth/link/request` | `{type, value}` | same as `/auth/request` (backup login) |
| POST 🔒 | `/auth/link/verify` | `{challengeId, code}` | `{token, user}` (same account, now with 2 identities) |

**Code delivery:** EMAIL codes are emailed via Brevo when `BREVO_API_KEY` is set; otherwise via `OTP_WEBHOOK_URL`, or dev mode
(`DEV_OTP=true`: code logged and returned as `devCode`). `devCode` is **only** present for dev-mode deliveries.
With no channel for a type, `/auth/request` returns 503 `PHONE_LOGIN_UNAVAILABLE` / `EMAIL_LOGIN_UNAVAILABLE`.

Phone numbers are normalised: `0541234567`, `233541234567` and `054 123 4567` all become `+233541234567`.
You can request a new code once a minute per identifier. A code expires after 5 minutes or 5 wrong attempts.
A user can have at most one PHONE and one EMAIL identity. Each IP gets 20 requests per minute on `/auth/*`.

## Me
| Method | Path | Body | Returns |
|---|---|---|---|
| GET 🔒 | `/me` | | user (`id,name,area,latitude,longitude,createdAt`) + `identities[]` + `items[]` (all statuses, newest first) + `rating` (avg or null) + `ratingCount` |
| PATCH 🔒 | `/me` | `{name?, area?, latitude?, longitude?}`. All optional; send lat and lng together. | same as `GET /me` (**changed**: it used to return `{id,name}`) |
| DELETE 🔒 | `/me` | `{confirm:"DELETE"}` | `{deleted:true}`. **Permanent.** Removes logins (phone/email become free), listings + their photos, chat texts (→ "Message deleted"), swipes/saves, ratings, reports, push tokens; name becomes "Deleted user". All existing tokens → 401 `ACCOUNT_DELETED`. Sign the user out after success. |
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
| GET 🔒 | `/conversations/:id/messages?before=<ISO date>` | | `{conversation, messages (oldest first, max 100), hasMore, cursor}`. Initial load and older pages. `conversation.myRating` = the stars (1–5) I've given the other person, or `null`. |
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

## Per-user limits
Over a limit → **429** `code: 'RATE_LIMITED'` with a friendly `message` ("You're going a little fast with messages…" /
"You've reached today's limit for …"). Normal use never gets close:
messages 30/min & 500/day · offers + offer replies 15/min & 150/day · swipes 120/min & 3000/day · new listings 10/h & 30/day ·
uploads 20/h & 60/day · new chats 30/h & 200/day · reports 10/h & 30/day · ratings 20/h & 100/day.

## Push notifications (Expo)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST 🔒 | `/me/push-token` | `{token: "ExponentPushToken[…]"}` | `{registered:true}`. Call after login and whenever the token changes. A token moves to whoever signed in last on that phone. |
| DELETE 🔒 | `/me/push-token` | `{token}` | `{registered:false}`. Call on log out. |
| POST | `/push-token/unregister` | `{token}` | `{registered:false}`. **No login needed**: use after session expiry or a logout that couldn't reach the server (delete-only). |

The server sends these to the *other* person (title / body), always with `data: {conversationId, kind}`. Tapping should open `chat/[conversationId]`:
- `message`: title = sender's name, body = the message text
- `offer`: "New offer on <item>", "<name> offered GH₵<amount>. Accept, counter or decline."
- `offer_accepted` / `offer_declined`: "Offer accepted 🎉" / "Offer declined"
- `match`: "It's a Havana Match! 🎉", "<name> wants to swap for your <item>. Say hello!"
- `swap`: "Swap update" ("<name> agreed to the swap." / "confirmed the handover.") or "Swap done ✓"
Android channel id: `default`. Tokens of uninstalled apps are dropped automatically.

## Moderation (admins only)
Admins are accounts with a verified email listed in the server's `ADMIN_EMAILS`, **signed in with a code delivered by a real channel** (Brevo email / SMS webhook). Dev-mode (on-screen) logins are never admin → 403 `ADMIN_NEEDS_VERIFIED_LOGIN`. `GET /me` includes `isAdmin: boolean`.
Everyone else gets 403 `NOT_ADMIN`.
| Method | Path | Returns |
|---|---|---|
| GET 🔒 | `/admin/reports` | reported items, most-reported first: Item + `owner`, `reportCount`, `hidden`, `reports:[{reason, createdAt}]` |
| POST 🔒 | `/admin/items/:id/restore` | Item (unhidden; its reports cleared so it won't re-hide immediately) |
| POST 🔒 | `/admin/items/:id/remove` | Item (`status: REMOVED`, hidden for everyone) |

## Account deletion page
`GET /account-deletion` → public HTML page for Google Play's "account deletion URL" (shows `SUPPORT_EMAIL` if set).
