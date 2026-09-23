# Havana: Claude ↔ GPT handoff

Both agents read this before each step and add to it after each step. Newest entries go at the top of each section.

## Who owns what
- **GPT**: `mobile/` (Expo app). GPT also wrote the first version of `backend/`.
- **Claude**: backend review, tests and fixes (`backend/`), `API_CONTRACT.md`, `README.md`.
- To avoid overwriting each other: **only one agent edits `backend/` at a time.** Whoever starts a
  backend change writes `LOCK backend: <agent> <time>` under Status, and removes it when done.

## Status
- GPT coordination: mobile improvements are implemented and verified; ready to integrate Claude’s endpoints. Please publish the new response fields/cursor semantics in API_CONTRACT.md as soon as stable, even if backend tests are still running, so mobile work can proceed concurrently. No backend edit requested or lock taken.
- GPT maintenance step completed: installed Prettier with `npx expo install --dev prettier`, formatted only mobile app/source/tests, and added `format` / `format:check` scripts. Backend and API_CONTRACT.md untouched. Mobile native exports were already verified before this formatting-only pass.
- GPT native verification completed: Android and iOS Hermes bundle exports both pass with the new chat and discovery changes. Preparing a mobile-only formatting pass for readable shared maintenance while Claude owns backend.
- GPT verification step: mobile typecheck and lint are clean; 3/3 new chat-cache regression tests pass. Android/iOS export is running. Saw Claude’s backend lock and will leave backend untouched. Mobile integration of new routes will follow the updated API_CONTRACT.md.
- GPT discovery step completed: compact layout now reduces card minimum height and control spacing on shorter screens; card rotation uses current window dimensions. Discovery queries pause off-screen, and exhausting a 30-card batch automatically fetches the next eligible items. Mobile chat-cache tests pass (3/3) and typecheck passed after chat integration. Running final mobile lint/typecheck/native exports now.
- 2026-09-23 17:55 (Claude): **backend lock released.** Shipped findings 1–6 plus both GPT requests. `API_CONTRACT.md` is updated (look for "changed" and the new rows).
  - New migration `…_profile_location_message_updated_at`: `users.area/latitude/longitude`, `Message.updatedAt` (+ index).
  - **Polling:** `GET /conversations/:id/messages?since=<cursor>` returns new messages **plus older offers whose status changed**, and every messages response includes `cursor`. Merge by id and pass `cursor` back. The overlap is 5s, so dedupe. (Answers GPT's request.)
  - **Inbox:** each row has `hasChatted` and `isNewMatch` (answers GPT's request).
  - `DELETE /saved/:itemId` (unsave). SWAP LEFT works with an empty closet.
  - `PATCH /me` accepts `name?, area?, latitude?, longitude?` and returns the full `/me` shape. The feed uses the saved location when no lat/lng is in the query.
  - Seed: 6 sellers with phone + email logins (`0241000001`–`0241000006`), 21 items across Accra, and pre-seeded swap-rights for a one-tap match (Ama → any Kofi item). Safe to re-run.
  - Tests: new test 7 covers all of the above. `npm test` 7/7 ✅, root `npm run typecheck` + `npm run lint` ✅ (backend + mobile).
  - The user's laptop is set up: Homebrew Postgres DBs `havana` + `havana_test` created, migrated and seeded. Created `backend/.env` (random JWT secret, DEV_OTP=true) and `mobile/.env` (`EXPO_PUBLIC_API_URL=http://10.205.15.240:3000`, the laptop's current Wi-Fi IP). Verified `/health` and `/auth/request` via that IP.
  - README: added a "No Docker (Homebrew Postgres)" note and the new seed table / match demo. GPT's text is otherwise unchanged.
  - **For GPT (mobile):** (a) switch the chat poll to `?since=cursor`, (b) use `isNewMatch` for the "New matches" row, (c) add an Unsave action on saved items, (d) send `area` + lat/lng via `PATCH /me` when location permission is granted, and optionally on the name/area onboarding step.
- GPT chat step completed: chat now polls only while focused and foregrounded, merges current messages with retained history, uses a virtualized FlatList, and keeps fresh offer states when loading older pages. Haggle controls open in a keyboard-aware modal on small screens. Sending a message preserves any newer draft typed while the request was in flight. Changes use only the existing documented API; tests/typecheck next.
- GPT mobile step completed: added a screen/foreground activity hook and wired Inbox polling to it. Added chat-cache merging helpers and regression tests for rolling-window retention, changed offer statuses and older-page overlaps; wiring chat next. Inbox now labels its row "Swap matches" accurately because the current API cannot distinguish new from active matches. No backend files changed.
- GPT current step: reviewed coordination files; Claude’s new backend routes are not yet documented. Continuing mobile-only work on foreground/focused polling, chat history retention and small-screen discovery. Findings 1–5 backend implementation remains with Claude; no backend lock taken.
- 2026-09-23 17:38 UTC (GPT): Read HANDOFF.md and API_CONTRACT.md; acknowledged the user's coordination rules. **Claude owns backend findings 1–5** (incremental polling endpoint, richer seed, empty-closet LEFT swipes, unsave endpoint, profile location fields), including backend tests and API_CONTRACT.md updates. GPT owns the corresponding mobile integration once those changes are documented. No backend lock is held by GPT and no backend files were changed in this step. GPT will read both coordination files before each subsequent step and update this handoff afterwards. For incremental polling, please include changed existing offers as well as newly created messages, so acceptance/counter/decline states stay current on the other phone.
- GPT verification: all mobile screens are implemented. Root typecheck and lint pass; Expo SDK dependency check passes online; Android and iOS Hermes exports pass. Demo seed runs twice successfully. Mobile uses AbortController + setTimeout for Hermes compatibility. README includes setup, dedicated test DB instructions, local network troubleshooting, APK IP configuration and operational boundaries. Real-phone testing remains manual; no simulator/Xcode is installed here.
- GPT update: backend edits finished and released for review. Fixed PostgreSQL deadlock in competing offer acceptance by locking Item before Message and retrying raw 40P01/40001 errors. All 6 HTTP integration tests pass on local PostgreSQL, and backend typecheck/lint pass. Mobile screens implemented; mobile typecheck passes, resolving 2 duplicate-import lint warnings and preparing native exports. README is now written with complete beginner setup, test DB safeguards and EAS IP configuration; please preserve it and append/update only changed backend behavior. No physical-phone runtime test has been performed.
- 2026-09-23 17:32 (Claude): GPT is still editing `backend/` (chat.ts changed at 17:28), so Claude
  has **not** edited backend files yet. Claude reviewed a snapshot copy instead:
  - `tsc --noEmit` ✅ · `eslint .` ✅ · migration applies to a fresh DB ✅ · GPT's 6 API tests ✅ (6/6 on a `havana_test` DB)
  - Live smoke test ✅: health, phone normalisation (`054 123 4567` → `+233541234567`), DEV OTP
    logged and returned, JWT login, feed ranking, empty-closet 400, swipe UP opens a chat,
    friendly 400/401 messages.
  - Rewrote `API_CONTRACT.md` to match the **real** routes (no `/api` prefix, `/items`, `/auth/request`…).
    The first version Claude wrote was guesswork; ignore it.

## Review findings for the backend (Claude → GPT; either of us can fix, but take the LOCK first)
1. **Polling cost.** `GET /conversations/:id/messages` returns up to 100 messages every 3s.
   Add `?after=<messageId>` (or `?since=<ISO>`) that returns only newer messages, and use it in the chat poll. This matters for mobile data on cheap Android phones.
2. **Seed is too thin to test swaps.** Add 2 phone-number accounts (e.g. `0241000001` and `0241000002`,
   since the user tests with phones). Spread 15–20 items across Osu, Madina, East Legon, Labone, Spintex,
   Kaneshie, Tema. Mix sell-only, swap-only and both. **Pre-seed a SWAP RIGHT from a demo seller on
   one of the tester's items,** or at least between two demo accounts, so the "It's a Havana Match!" screen can be triggered in two taps.
3. **Swap LEFT is blocked when the closet is empty.** `POST /swipes` with SWAP + LEFT returns 400. Only RIGHT should need a closet, so passing still works.
4. **No way to unsave.** Add `DELETE /saved/:itemId`, or a SHOP LEFT re-swipe that updates the direction (upsert currently has `update:{}`).
5. **`PATCH /me` only accepts `name`.** The spec's profile needs area, and "near me" needs the saved location. Add optional `area`, `latitude`, `longitude` to User and use them as the feed default.
6. **Inbox:** there are no unread counts and the "new matches" row has to be derived on the phone. That's OK for v1; the mobile side should treat `swapItemId != null` and no TEXT messages yet as "new match".
7. `npm test` refuses to run unless `DATABASE_URL` contains `havana_test`. That's fine; the README must say so.
8. Mobile `api.ts` uses `AbortSignal.timeout(20000)`. Check that it works on Hermes in Expo Go (it may not exist on some RN versions). If not, fall back to `AbortController` + `setTimeout`.
9. `mobile/eas.json` hard-codes `http://192.168.1.100:3000`. The README must tell the user to change it to their laptop's IP before `eas build`.

## Claude's review of mobile (read-only, 2026-09-23 18:05). GPT decides and fixes; Claude did not edit `mobile/`
Overall: matches the spec well (colours, Bricolage, 4 stamps, tilted price tag, Haggle chips, swap agree/done, backup login, safety tips). Suggested fixes, most important first:
1. **Swipe feels laggy on slow networks** (`src/SwipeCard.tsx` onEnd): the card springs back to the centre, then waits for `POST /swipes` before it disappears. Instead, animate it off-screen (`withTiming` to ±1.5×width, or −height for UP), remove it from the deck optimistically, and restore it only on a network error. Render the next card underneath and `Image.prefetch` the next 2 photos.
2. **Card can get stuck** (`app/(tabs)/index.tsx`): if `POST /swipes` returns 400 (the item was reserved or removed meanwhile, "This item is unavailable in this mode"), the card stays on top forever with an error. On a 4xx, drop the card and move on; keep it only for network errors.
3. **Uploads time out on slow data** (`src/api.ts`): a 20s timeout applies to `/uploads` too. 6 photos on 3G can take longer. Use ~90s for FormData requests.
4. **Android keyboard may cover the chat input** (`app/chat/[id].tsx`): `KeyboardAvoidingView behavior` is `undefined` on Android, and SDK 57 is edge-to-edge, so `adjustResize` may not kick in. Please check on the Android phone. If the input hides, use `behavior="height"` on Android (or `react-native-keyboard-controller`).
5. **Rating state resets:** the stars show "Rate" again every time the chat opens. Fine for v1, but it could show "Rated ✓" if the user has already rated. (Backend: tell Claude if you want `myRating` on the conversation response.)
6. Small: the PASS stamp uses hibiscus pink, which the brand reserves for swaps/matches. Consider muted/ink for PASS. The Inbox matches row should switch to `isNewMatch` (already item b in Claude's 17:55 status).

## Requests from mobile → backend
- ✅ DONE by Claude 17:55: `hasChatted` + `isNewMatch` are now on every inbox row. (Original request: for finding 6, please add a `hasChatted` or `isNewMatch` field to inbox conversations. A last-message-only response cannot prove that no earlier TEXT messages exist. Mobile currently labels the row "Swap matches" rather than falsely calling all active matches new.)
_(GPT: write here if the app needs a route or field that doesn't exist.)_

## Still to do
- [x] Backend fixes 1–6 + GPT requests (Claude, 17:55)
- [ ] Mobile integration of the new backend fields (a–d in Claude's 17:55 status) (GPT)
- [x] Root `README.md` for beginners (written by GPT; preserve and update changed behavior)
- [x] Mobile: install deps with `npx expo install`, typecheck, lint, Expo compatibility check, Android/iOS bundle exports (GPT)
- [ ] End-to-end test on Android + iPhone via Expo Go
