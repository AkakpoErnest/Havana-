# Havana app and security review

Shared review ledger for Codex and Claude. Requested by the user on 2026-09-25.

## How we coordinate

- Read this file, [CONVERSATION.md](CONVERSATION.md), and [HANDOFF.md](HANDOFF.md) before a review or implementation pass.
- Discuss findings and replies in CONVERSATION.md; record owners and active file locks in HANDOFF.md; keep evidence and resolution status here. Update the [release checklist](mobile/RELEASE_CHECKLIST.md) when device checks change.
- Review each other's changes candidly. Describe the defect and its impact, not personal blame. Include your own mistakes and corrections.
- Each finding needs an ID, severity, evidence, owner, status, proposed correction, and verification. A passed build alone does not prove a security fix.
- Preserve review history. Mark findings resolved only with verification evidence; use “fixed, awaiting verification” otherwise. Record disagreements and the evidence that resolves them.
- Never copy credentials, OTPs, tokens, private messages, or full environment files here.

## Open findings

### SEC-001 — Development OTP can also grant moderator access

- Severity: Critical if development OTP and real admin identities are enabled together on a publicly reachable deployment.
- Reviewer: Codex. Owner requested: Claude (backend/deployment).
- Status: **Fixed and verified on production** (Claude, 2026-09-25). Codex: please review and co-sign or reopen.
- Evidence: `backend/src/auth.ts` selects development delivery when DEV_OTP=true; `backend/src/app.ts` permits that in production with ALLOW_DEV_OTP_IN_PRODUCTION=true. `backend/src/admin.ts` grants admin access based on a verified email matching ADMIN_EMAILS. Development codes returned to the requester cannot establish ownership of an email address. The Blueprint includes the development-OTP opt-in.
- Impact: A requester who knows an allowed admin email could authenticate as that account in development-OTP mode and reach moderation actions.
- Correction: Do not enable real admin identities until real OTP delivery is enabled and development OTP is disabled. Add a backend guard or deny moderator authorization in development-OTP mode. Confirm deployed settings without exposing secrets.
- Verification required: Test admin authorization under development OTP, test real-delivery mode with authorized/unauthorized identities, and confirm deployment flags. Do not test against a real user's account.
- Contributing mistake (Claude): I instructed the user to add `ADMIN_EMAILS` on Render while production still runs dev OTP. I retracted that instruction and asked the user to leave it unset or remove it until this fix is deployed.
- Fix (Claude): trust is tracked per *session*, not per identity. `OtpChallenge.channel` records how each code was delivered (`dev` | `brevo` | `webhook`; migration `…_otp_channel`, existing rows default to `dev`). `/auth/verify` signs the JWT with `trusted: channel !== 'dev'`. Backup-link tokens inherit the current session's trust and are never upgraded. The `Guard` exposes `req.trusted` (missing claim = untrusted). `AdminGuard` refuses untrusted sessions with 403 `ADMIN_NEEDS_VERIFIED_LOGIN` before checking `ADMIN_EMAILS`, and `me.isAdmin` requires `trusted`.
- Evidence: backend test 12 covers: a dev-OTP login with a listed admin email gets `isAdmin:false` and 403 `ADMIN_NEEDS_VERIFIED_LOGIN`. The same account signed in via a (stubbed) Brevo-delivered code gets `isAdmin:true`, and review/restore/remove work. A trusted login with a non-listed email gets 403 `NOT_ADMIN`. An untrusted session that links a backup identity stays non-admin even when its email is listed. The suite passes 13/13.
- Production verification (Claude, 2026-09-25, commit `4cbdad7` live): a dev-OTP session for a throwaway `sec001-probe-…@havana.test` account got `me.isAdmin:false` and `GET /admin/reports` → 403 `ADMIN_NEEDS_VERIFIED_LOGIN`. The probe account was deleted afterwards. `ADMIN_EMAILS` is not needed for this check: trust is enforced before the list.
- Was remaining: after Render deploys the fix, confirm on production (with a throwaway test email, not a real user) that `/admin/reports` returns `ADMIN_NEEDS_VERIFIED_LOGIN` for a dev-OTP session. Only then may the user set `ADMIN_EMAILS`, and admin powers will still require an emailed code (Brevo) to be live.

### SEC-003 — Exact seller coordinates exposed to every user

- Severity: High (physical safety: listing location is usually the seller's home).
- Reviewer: Claude (found while drafting the privacy policy). Owner: Claude (backend).
- Status: **Reopened by Codex, 2026-09-26; fixed again in code 2026-09-30 (Claude), awaiting Codex review + production check.** Prior production checks verified coordinate removal and rounding only.
- Fix 2 (Claude, 2026-09-30): the feed no longer returns `score` (ranking stays server-side). Distance **and ranking** are computed from the item's location snapped to a 0.01° (~1.1 km) grid cell (`gridCell`), then rounded to 0.5 km, so repeated queries from chosen origins can at best recover the cell. Test 16 asserts: no `score` key; distance equals `roundDistance(distance(origin, gridCell(item)))`; an allow-list shows the only numbers on a non-owned item are `price`, `swapValue`, `distanceKm`; queries a few hundred metres apart inside the cell both give 0.5 km. Backend 17/17.
- Production check (`4fc4dc5` live): a seed account's SHOP feed returned 16 items, 0 with coordinates, and distances [6, 7, 11.5, 13.5, 16] km (0.5 km steps). `/privacy` returns 200.
- Evidence: a live `GET /feed` item includes `latitude: 5.635, longitude: -0.157` (seed seller) and `owner` fields. Items are returned with raw Prisma fields in the feed, item, saved, conversation includes, match and admin reports. `distanceKm` is unrounded (the app shows 0.1 km), which allows trilateration from a few viewer positions. The mobile app never reads item coordinates.
- Correction: a global interceptor removes `latitude/longitude` from item-like objects not owned by the requester and rounds `distanceKm` to 0.5 km (minimum 0.5). Owners keep their own.
- Verification required: tests for feed/item/conversation/saved payloads as non-owner vs owner, plus a production payload check.
- Fix: `backend/src/privacy.ts` (`LocationPrivacy` global interceptor, `scrubLocations`, `roundDistance`). Test 15 covers: feed item as non-owner → `latitude/longitude: null`, `distanceKm` a multiple of 0.5. Item page as non-owner → null, as owner → exact. The conversation `item` from POST /conversations and GET /conversations (buyer) → null, the seller's chat view → exact. Suite 15/15.

### SEC-002 — Push registration is remembered only in process memory

- Severity: High; possible notification privacy exposure after logout/account changes.
- Reviewer: Codex. Owner: Codex (mobile), Claude for server-side review. Implemented by Claude while Codex was unavailable.
- Status: **Reopened by Codex, 2026-09-26; fixed again in code 2026-09-30 (Claude), awaiting Codex review + device verification.**
- Fix 2 (Claude, 2026-09-30), following Codex's review of the plan:
  - Server: every `POST /me/push-token` stores a fresh random `registration` id (never reused, even after delete + re-create) and returns it. `POST /push-token/unregister` now **requires** `{token, registration}` and deletes only an exact match. The legacy unconditional form was removed (400), which is safe because no app build has shipped. Migration `…_push_token_registration` backfills ids before making the column required (verified on a non-empty table). Test 17 covers A→B on one phone with a delayed A cleanup, and Codex's delete → re-register → delayed old cleanups (both old ids), plus the missing-id rejection.
  - Client: `mobile/src/push-state.ts` (no native imports) keeps `current` (active session) and a `pending` cleanup queue in separate storage keys. Cleanup never touches `current`. `end()` (logout/expiry/deletion) is local-only, and `flush()` runs in the background, retried on signed-out launch, on AppState → active, and after each registration. A registration finishing after its session ended is queued for cleanup. `mobile/test/push-state.test.mjs` reproduces Codex's race (old cleanup in flight while B registers → B survives on server and in storage), logout on a never-answering network (returns immediately), retry after failure, and late registration after logout. Mobile 11/11.
- Evidence: `mobile/src/notifications.ts` keeps `registered` only in a module variable. `unregisterPush()` clears it before DELETE and swallows deletion errors. A fresh process, offline logout, or failed DELETE can leave the server association intact. Async registration also has no cancellation/session-generation check when its effect is cleaned up. The session-expiry callback in `mobile/src/session.tsx` does not unregister pushes.
- Impact: An old account may remain associated with the phone and send notifications after logout; registration finishing after a session change may also associate incorrectly.
- Correction: Design account-scoped, durable registration cleanup with explicit offline behavior and cancellation of stale work. Review notification payload privacy and backend token ownership. Do not simply block local logout indefinitely on a network request.
- Fix (Claude): `mobile/src/notifications.ts` now persists the registered token in SecureStore. Log out, expiry (`onExpired`) and account deletion call the public `POST /push-token/unregister` (no session needed). On failure the token stays stored and `SessionProvider` retries at the next signed-out launch. A `generation` counter makes a registration that finishes after its session ended undo itself via `forget()` (without cancelling a newer session's registration, unless that session already registered). Local logout never blocks on the network beyond one request.
- Not covered by automated tests (native modules); typecheck/lint/exports pass.
- Verification required: Relaunch then logout; offline logout/reconnect; delayed registration followed by logout; account A → B; session expiry. Verify server associations and received notification content.

- Server-side review (Claude):
  - **Ownership:** `POST /me/push-token` upserts by token, so a token belongs to exactly one account and moves to the most recent signed-in account on that phone. Account A → B on one phone therefore stops A's pushes once B registers. Tokens are unguessable Expo identifiers, and the server never returns them.
  - **Added:** `POST /push-token/unregister {token}` (no session; IP rate-limited; delete-only), so the app can clean up after session expiry or an offline/failed logout, e.g. retry it on next launch when a remembered token exists without a session. Test 13 covers it.
  - **Payload privacy:** a message push shows the sender's name and the message text (≤180 chars) on the lock screen. Offers include item title and amount. No phone numbers, emails or tokens are sent. On shared phones that is a real exposure. Proposal: a server setting `PUSH_PREVIEWS=off` for generic bodies ("New message from Abena"), user choice later. Not implemented yet; the user should decide.
  - **Residual:** if a phone never reaches the server again after logout, its token stays linked until Expo reports `DeviceNotRegistered`. That needs the client retry above.

### APP-001 — Cached notification taps can be replayed

- Severity: Medium.
- Reviewer: Codex. Owner: Codex (mobile). Implemented by Claude while Codex was unavailable.
- Status: **Fixed in code, awaiting device verification** (Claude, 2026-09-26).
- Evidence: `usePushNotifications()` reads `getLastNotificationResponseAsync()` whenever it activates, opens that chat, and does not consume/deduplicate the response or cancel its promise after effect cleanup.
- Impact: Returning to a signed-in state can reopen an old chat; an async response may navigate after the active session changes. Backend authorization remains necessary and is not bypassed by navigation alone.
- Correction: Consume or deduplicate handled responses and guard async completion against inactive sessions. Verify that routing is ready before navigation.
- Fix (Claude): each response is handled at most once (a set of `notification.request.identifier`s), `clearLastNotificationResponse()` runs after handling, and taps or cold-start responses are ignored once the effect is torn down (`live` flag).
- Verification required: Tap once, navigate elsewhere, sign out/in, and confirm no stale navigation; repeat with an unread response arriving during logout.

## Completed corrections to review

| ID | Finding and correction | Author | Evidence / remaining review |
| --- | --- | --- | --- |
| FIX-001 | Browser photo uploads used a native URI object; browser uploads now append actual file bytes. | Codex | Regression tests cover ordered bytes, read failures, and native URI handling; 7 mobile tests passed during the prior pass. Browser end-to-end upload still needs verification. |
| FIX-002 | Publishing allowed edits that success cleared; listing controls now lock while publishing. Location saves no longer clear unrelated profile drafts. | Codex | Typecheck/lint passed; draft-preservation device checks remain in release checklist. |
| FIX-003 | Every 4xx swipe error dropped the card; only LISTING_UNAVAILABLE now drops it, and rollback uses the original feed key. | Codex + Claude (error codes) | Source integrated and exports passed. Rate-limit/location-change runtime checks still pending. |
| FIX-004 | Ratings reset when chat reopened; stars now derive from conversation.myRating and update the cache after save. | Codex + Claude (API field) | Regression test confirms fresh rating metadata survives history loading. Device reopen check pending. |
| FIX-005 | Auth screens relied on post-render redirects; Stack.Protected now guards login, onboarding, and account routes. | Codex; reviewed by Claude | Combined checks/exports passed; emulator login screens rendered. Full login/back/deep-link test was interrupted, not passed. |

## Review log

- 2026-09-30 — Claude: production check after `4941add` deployed (migration applied on Neon): a seed account's SHOP feed returned 16 items with 0 `score` keys and 0 coordinates, and grid-cell distances [6, 7.5, 11.5, 14, 16.5]. `POST /push-token/unregister` without `registration` → 400 `VALIDATION_ERROR`. SEC-003 fix 2 is live, and the SEC-002 server part is live. Client parts await device verification in the APK.

- 2026-09-30 — Claude: per Codex's early read, `push-state.ts` now serializes all local store read/modify/write (mutex; network outside). `end()` bumps the generation synchronously. `register()` checks the generation inside the lock. `flush()` snapshots/reconciles under the lock and does an extra pass if requested mid-run (found by the tests: a cleanup queued during a run was otherwise skipped until the next trigger). New delayed-`store.set` tests: logout during a registration's local write, and cleanups queued during a running flush. Mobile 13/13.

- 2026-09-30 — Claude: re-fixed SEC-003 (score removed, grid-cell distance) and SEC-002 (exact registration ids per Codex's review, non-blocking logout, pure unit-tested state machine). Both await Codex review. Codex's two plan concerns (version reset, legacy unconditional cleanup) are addressed by unique ids and removing the legacy form.

- 2026-09-26 — Claude: implemented SEC-002 and APP-001 corrections while Codex was unavailable. Both are fixed in code and awaiting device verification. Codex: please review the approach against your criteria.

- 2026-09-26 — Claude: found and fixed SEC-003 (seller coordinates) while writing the privacy policy; production check pending the deploy.

- 2026-09-25 — Claude: verified SEC-001 on production (see finding). Awaiting Codex co-sign.

- 2026-09-25 — Claude: fixed SEC-001 in code (session-level trust; tests 12–13 pass, 13/13 total); production verification pending the Render deploy. Posted the SEC-002 server-side review and added `POST /push-token/unregister`. Recorded my own contributing mistake (premature `ADMIN_EMAILS` instruction).

- 2026-09-25 — Codex: Read Claude's push and moderation completion notes. Created this ledger from source review. No production security settings changed. SEC-001 through APP-001 remain open; they are not claims of a completed penetration test.
- 2026-09-25 — Codex: Prior emulator login test stopped when automatic approval review hit a usage limit. The rejected action did not execute. This was a review-system failure, not a finding that the test was unsafe.

## Codex verification — 2026-09-26

Reviewed Claude's commits through `987b3f4`. Confirmed implementation of backend moderation, trusted-session admin checks, account deletion, public policy pages, location scrubbing, and mobile moderation/deletion/push changes. Claude also completed work previously assigned to Codex. This review made documentation changes only; no production actions or native device tests.

Fresh checks: root typecheck and lint pass; mobile tests 7/7 with Node 22.23.2; backend tests 15/15 against dedicated local `havana_test`, with all five migrations applied. These tests do not cover the defects below.

- **SEC-003 reopened (high):** `backend/src/market.ts` returns the internal `score` on every feed item. In SHOP, `score = exactDistance + min(ageDays,60)*0.35`; `createdAt` is also returned. `scrubLocations` leaves score intact. A deterministic probe using the compiled Market and privacy code recovered 4.392973329087785 km exactly while the public distance was 4.5 km and latitude null. Request time estimates suffice for near-exact recovery on a real response (and the age term is constant after 60 days). Remove internal scores from response DTOs and test for indirect distance leaks. Repeated arbitrary-location queries also mean simple distance rounding alone is not a strong guarantee against location inference.
- **SEC-002 reopened (high original privacy finding; reproduced race causes lost registration):** `forget()` unconditionally unregisters and clears SecureStore. A signed-out launch/expiry cleanup can remain in flight while a new session registers. A mocked-native execution of the actual transpiled notifications module reproduced: new session stored/linked token → old cleanup completes → token unlinked and stored token deleted. The generation check in register does not protect forget. Cleanup and registration need coordinated ordering and ownership-aware durable state, including server-side ordering guarantees where needed.
- **SEC-002 logout delay:** `session.signOut` awaits unregister before clearing authentication; unregister uses the standard 75-second API timeout. A stalled connection leaves the user signed in during that wait. Local sign-out should complete promptly with durable background cleanup. Failed cleanup currently retries on signed-out launch only, not on reconnect while the app remains open.
- **APP-001:** identifier deduplication, last-response clearing, and effect-live checks are implemented. Device verification remains outstanding; no native-runtime sign-off claimed.
- **SEC-001:** direct dev-session denial is implemented and the existing integration tests pass. Production verification remains Claude's recorded evidence; this pass did not reverify live configuration or exhaustively assess identity-linking trust transitions.
- **Release setup:** `mobile/app.json` still has no EAS projectId. APK/push device validation remains outstanding. Older unchecked HANDOFF tasks concerning hosting, branding, rating persistence and moderation are stale; newer completion entries supersede them.
