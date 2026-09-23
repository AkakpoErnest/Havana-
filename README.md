# Havana

A second-hand marketplace for Accra: swipe to shop, haggle in chat, or match two items for a swap. One Expo/TypeScript app runs on Android and iPhone; a NestJS API stores shared accounts and marketplace data in PostgreSQL.

How it fits together (diagrams, data model, key flows): see [ARCHITECTURE.md](ARCHITECTURE.md). Every API route: [API_CONTRACT.md](API_CONTRACT.md).

## What you need

- Node.js **22.13 or newer in the Node 22 LTS line** (`node -v` to check). If you use nvm, run `nvm install` and `nvm use` in this folder.
- Docker Desktop, installed and running (for PostgreSQL).
- The current **Expo Go supporting SDK 57** on both phones. See [Expo Go downloads](https://expo.dev/go) and [Expo SDK requirements](https://docs.expo.dev/versions/latest/). SDK 57 requires iOS 16.4+ / Android 7+.
- Laptop and both phones on the **same Wi-Fi**. Avoid guest networks that prevent devices from communicating.

All terminal commands below start from the `Havana App` folder unless they include `cd`.

## 1. Start the database

> **No Docker? (e.g. Postgres installed with Homebrew on a Mac)** Skip `docker compose` and create the database once:
>
> ```sh
> brew services start postgresql@14      # if it isn't running already
> createdb havana
> ```
>
> Then in step 2, set this in `backend/.env` (replace `yourname` with the output of `whoami`):
> `DATABASE_URL=postgresql://yourname@localhost:5432/havana?schema=public`
> For the tests, run `createdb havana_test` and use `postgresql://yourname@localhost:5432/havana_test` in the test commands below.


Open Terminal in this folder:

```sh
docker compose up -d
```

Wait for `docker compose ps` to show the database as healthy. Data persists in the `havana_data` Docker volume. `docker compose down` stops it without deleting your data.

## 2. Prepare and start the API

```sh
cd backend
npm ci
cp .env.example .env
```

Open `backend/.env`. Replace `JWT_SECRET` with your own random secret, at least 32 characters. You can generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep `DEV_OTP=true` for testing. Then run:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on **0.0.0.0:3000**, so both phones can reach it. Open `http://localhost:3000/health` on the laptop; you should see `{"ok":true,"app":"Havana"}`.

Keep this terminal open. After editing backend TypeScript, restart `npm run dev` to compile the changes. For continuous compilation, run `npx tsc --watch` in another backend terminal; the dev server watches the compiled files.

The seed creates 21 demo listings around Accra and six sellers. Each seller can log in with the phone number **or** the email (they're the same account):

| Phone | Email | Area |
|---|---|---|
| `0241000001` | `ama@havana.demo` | Osu |
| `0241000002` | `kofi@havana.demo` | Madina |
| `0241000003` | `esi@havana.demo` | East Legon |
| `0241000004` | `yaw@havana.demo` | Labone |
| `0241000005` | `akosua@havana.demo` | Spintex |
| `0241000006` | `kwame@havana.demo` | Kaneshie |

**Quick match test:** Kofi has already swiped right on Ama's denim jacket in Swap mode. Log in as Ama (`0241000001`), switch to **Swap**, and swipe right on any Kofi item: you'll get "It's a Havana Match!" straight away. (The same works for Yaw with any Esi item.) Running `npm run db:seed` again is safe.

Log in with any of these, or your own email / Ghana phone number. In development, the six-digit code is shown in the app and logged in the API terminal. No SMS/email provider is needed. Seed photos are remote demo images; they need internet on first load. Uploaded photos are served from the laptop.

## 3. Find your laptop’s Wi-Fi address

On macOS, go to System Settings → Wi-Fi → Details → TCP/IP, or try:

```sh
ipconfig getifaddr en0
```

On Windows, run `ipconfig` and find the Wi-Fi adapter’s IPv4 address. Suppose it is `192.168.1.42`.

Open `http://192.168.1.42:3000/health` **in each phone’s browser**. If it fails, allow Node through the laptop firewall and check both devices use the same Wi-Fi. Keep the laptop awake.

## 4. Start the mobile app

Open a second terminal:

```sh
cd mobile
npm ci
npx expo install --check
cp .env.example .env
```

Set the URL in `mobile/.env` to your actual laptop address:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
```

Do not use `localhost`: on a phone that means the phone itself. Start Expo:

```sh
npx expo start --lan
```

- **Android:** Open Expo Go and scan the terminal QR code.
- **iPhone:** Scan the same QR code with Camera and open it in Expo Go. Allow Local Network access if prompted.

Restart Expo after changing `.env`. If values appear stale, use `npx expo start --clear --lan`. Both phones use the same API/database and may sign in to the same account; use **different accounts** to test buying or swapping with each other.

`npm ci` restores the already-locked dependency set on a fresh checkout. Use **`npx expo install package-name`** for all mobile package additions or version changes so native package versions match the SDK.

## 5. Try the full two-phone flow

1. Sign in as Ama on one phone and Kofi on the other. Change names under You if desired.
2. Browse **Shop**. Swipe left to pass, right to save, or up to open Haggle Mode. The buttons perform the same actions. Tap a card for details. Saved items appear under You → Saved.
3. Choose **Sell / Swap** and upload up to six camera/gallery photos. Set a whole-cedi price and/or swap value. Location is optional; enter an Accra area either way.
4. In **Swap**, Ama swipes right on a Kofi item; Kofi swipes right on an Ama item. The second swipe creates the match. Open the match from the full-screen celebration or the match row in Inbox on either phone.
5. Chat refreshes every three seconds. For a sale, send an offer or use Asking / −10% / −20% / −30%. The other person can accept, counter, or decline. Accepting reserves the item and closes competing offers. A new offer counters older pending offers in that chat.
6. For a swap, both people tap **We agreed**. After the physical handover, both tap **Swap done**. Only then are both listings marked swapped.
7. Both people must have sent a text or offer before they can rate each other. Tap one of the five stars in chat. A later rating updates your previous one.
8. Long-press one of your items under You to set live/reserved/sold/removed. Completed swaps cannot be relisted; items with an accepted offer cannot be made live again.
9. Under You → Manage backup login, verify the other identity type. That email and phone now open the same account. Ghana numbers like `0541234567` normalize to `+233541234567`.
10. Report an item from its detail page. Three **different accounts** reporting it hide it from discovery and other users; repeat reports count once.

Havana does not take payments. Meet in public, inspect first, then pay directly by MoMo or cash on pickup.

## Checks and API tests

From the project root:

```sh
npm run typecheck
npm run lint
```

The backend tests exercise HTTP endpoints against a real, dedicated PostgreSQL database. They **clear the test database’s marketplace tables**, and refuse to run unless the URL contains `havana_test`. Do not point tests at a database containing anything you need.

```sh
docker compose exec db createdb -U havana havana_test
cd backend
DATABASE_URL=postgresql://havana:havana@localhost:5432/havana_test npx prisma migrate deploy
DATABASE_URL=postgresql://havana:havana@localhost:5432/havana_test npm test
```

Windows PowerShell: set `$env:DATABASE_URL="postgresql://havana:havana@localhost:5432/havana_test"` before the migration and test commands; remove the override afterwards with `Remove-Item Env:DATABASE_URL`.

Check native bundles without a phone:

```sh
cd mobile
npx expo export --platform android --platform ios
npx expo install --check
```

## Installable Android APK

`mobile/eas.json` includes a `preview` profile. Replace its `EXPO_PUBLIC_API_URL` with your laptop’s current Wi-Fi address (for local testing), or a deployed HTTPS API. That URL is baked into the APK; a laptop URL works only while the phone can reach that laptop.

```sh
cd mobile
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

EAS will ask you to create/link an Expo project on first use. Download the APK from the resulting build link and install it on Android. No APK has been built or published on your behalf. iPhone testing uses Expo Go; installing a standalone iOS build requires Apple signing.

## API map

All routes except health and login require `Authorization: Bearer <token>`. Tokens last 30 days. JSON DTOs reject unknown fields and validate enums, coordinates, text lengths and positive integer cedi amounts.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | API reachability |
| POST | `/auth/request`, `/auth/verify` | Request and redeem a six-digit OTP |
| POST | `/auth/link/request`, `/auth/link/verify` | Verify and attach a backup login |
| GET / PATCH | `/me` | Profile / display name |
| GET | `/feed?mode=SHOP&category=CLOTHES&latitude=5.6&longitude=-0.18` | Ranked discovery; optional filters/location |
| POST | `/uploads` | Multipart `photos`, max six files, 5 MB each |
| POST / GET | `/items`, `/items/:id` | Create listing / detail |
| PATCH | `/items/:id/status` | Owner status change |
| POST | `/items/:id/report` | Report with `reason` |
| POST | `/swipes` | `{itemId, mode:SHOP or SWAP, direction:LEFT or RIGHT or UP}` |
| GET | `/saved` | Shop right-swipes |
| GET / POST | `/conversations` | Inbox / start sale chat with `{itemId}` |
| GET / POST | `/conversations/:id/messages` | Latest 100 messages / send `{text}`; older messages via `?before=ISO_TIMESTAMP` |
| POST | `/conversations/:id/offers` | Send `{amount}` |
| POST | `/conversations/:id/offers/:messageId` | `{action:ACCEPT or DECLINE}` |
| POST | `/conversations/:id/swap` | `{action:AGREE or DONE}` |
| POST | `/ratings` | `{toId, stars}` |

## Implementation and v1 boundaries

- `backend/`: NestJS, Prisma 6, PostgreSQL, JWT, class-validator and Multer. Prisma 6 is pinned deliberately for a stable client/migration setup. Listing `kind` supports ITEM/RENTAL; an unused Order model reserves a Paystack/escrow extension point. V1 has no payment route.
- `mobile/`: Expo SDK 57, Expo Router, Reanimated/Gesture Handler, TanStack Query, SecureStore, expo-image, image picker/manipulator and location. Bricolage Grotesque font files are bundled locally. Photos resize to 1200px and compress before upload; the server decodes/re-encodes them, strips metadata and constrains image size.
- Serializable database transactions and retries protect matching, offers, swaps and report thresholds. Swap pair keys prevent duplicate chats. Private conversations enforce membership on every request. Backup linking never merges accounts or trusts an unverified identity.
- Feed ranks up to the 500 freshest eligible listings, returning 30 by distance + freshness + swap-value similarity. Missing GPS uses central Accra; unknown item locations rank lower. This is appropriate for the Accra v1 dataset, not an unbounded marketplace search engine.
- Chat polls every 3 seconds while mounted and retains fetched messages on connection errors. Mutations are not automatically retried; uploads and unsent form data remain on screen on failure. There are no push notifications or offline send queue.
- Uploaded files live in `backend/uploads`; keep this folder and PostgreSQL backed up together. Orphan upload cleanup, moderation tooling, account recovery/removal and multi-server rate limits are future operational work. Inbox returns the latest 100 conversations.
- `DEV_OTP=true` exposes codes intentionally for local testing. Production startup rejects this setting. To send real codes, disable it and configure an HTTPS `OTP_WEBHOOK_URL` and `OTP_WEBHOOK_TOKEN`; your provider adapter must accept authenticated JSON `{type,value,code}` and deliver the message. No paid SMS/email service is configured. OTPs expire in five minutes and permit five wrong guesses; per-IP and per-identity request limits apply.
- Local HTTP is enabled for development APKs. Use HTTPS and disable Android cleartext traffic in the build-properties plugin before publishing. This repository is a testable v1, not a deployed public service.
