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
- Status: **Fixed in code, awaiting production verification** (Claude, 2026-09-26).
- Evidence: a live `GET /feed` item includes `latitude: 5.635, longitude: -0.157` (seed seller) and `owner` fields. Items are returned with raw Prisma fields in the feed, item, saved, conversation includes, match and admin reports. `distanceKm` is unrounded (the app shows 0.1 km), which allows trilateration from a few viewer positions. The mobile app never reads item coordinates.
- Correction: a global interceptor removes `latitude/longitude` from item-like objects not owned by the requester and rounds `distanceKm` to 0.5 km (minimum 0.5). Owners keep their own.
- Verification required: tests for feed/item/conversation/saved payloads as non-owner vs owner, plus a production payload check.
- Fix: `backend/src/privacy.ts` (`LocationPrivacy` global interceptor, `scrubLocations`, `roundDistance`). Test 15 covers: feed item as non-owner → `latitude/longitude: null`, `distanceKm` a multiple of 0.5. Item page as non-owner → null, as owner → exact. The conversation `item` from POST /conversations and GET /conversations (buyer) → null, the seller's chat view → exact. Suite 15/15.

### SEC-002 — Push registration is remembered only in process memory

- Severity: High; possible notification privacy exposure after logout/account changes.
- Reviewer: Codex. Owner: Codex (mobile), Claude for server-side review.
- Status: Open; source confirmed, device reproduction pending.
- Evidence: `mobile/src/notifications.ts` keeps `registered` only in a module variable. `unregisterPush()` clears it before DELETE and swallows deletion errors. A fresh process, offline logout, or failed DELETE can leave the server association intact. Async registration also has no cancellation/session-generation check when its effect is cleaned up. The session-expiry callback in `mobile/src/session.tsx` does not unregister pushes.
- Impact: An old account may remain associated with the phone and send notifications after logout; registration finishing after a session change may also associate incorrectly.
- Correction: Design account-scoped, durable registration cleanup with explicit offline behavior and cancellation of stale work. Review notification payload privacy and backend token ownership. Do not simply block local logout indefinitely on a network request.
- Verification required: Relaunch then logout; offline logout/reconnect; delayed registration followed by logout; account A → B; session expiry. Verify server associations and received notification content.

- Server-side review (Claude):
  - **Ownership:** `POST /me/push-token` upserts by token, so a token belongs to exactly one account and moves to the most recent signed-in account on that phone. Account A → B on one phone therefore stops A's pushes once B registers. Tokens are unguessable Expo identifiers, and the server never returns them.
  - **Added:** `POST /push-token/unregister {token}` (no session; IP rate-limited; delete-only), so the app can clean up after session expiry or an offline/failed logout, e.g. retry it on next launch when a remembered token exists without a session. Test 13 covers it.
  - **Payload privacy:** a message push shows the sender's name and the message text (≤180 chars) on the lock screen. Offers include item title and amount. No phone numbers, emails or tokens are sent. On shared phones that is a real exposure. Proposal: a server setting `PUSH_PREVIEWS=off` for generic bodies ("New message from Abena"), user choice later. Not implemented yet; the user should decide.
  - **Residual:** if a phone never reaches the server again after logout, its token stays linked until Expo reports `DeviceNotRegistered`. That needs the client retry above.

### APP-001 — Cached notification taps can be replayed

- Severity: Medium.
- Reviewer: Codex. Owner: Codex (mobile).
- Status: Open; source confirmed, runtime reproduction pending.
- Evidence: `usePushNotifications()` reads `getLastNotificationResponseAsync()` whenever it activates, opens that chat, and does not consume/deduplicate the response or cancel its promise after effect cleanup.
- Impact: Returning to a signed-in state can reopen an old chat; an async response may navigate after the active session changes. Backend authorization remains necessary and is not bypassed by navigation alone.
- Correction: Consume or deduplicate handled responses and guard async completion against inactive sessions. Verify that routing is ready before navigation.
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

- 2026-09-26 — Claude: found and fixed SEC-003 (seller coordinates) while writing the privacy policy; production check pending the deploy.

- 2026-09-25 — Claude: verified SEC-001 on production (see finding). Awaiting Codex co-sign.

- 2026-09-25 — Claude: fixed SEC-001 in code (session-level trust; tests 12–13 pass, 13/13 total); production verification pending the Render deploy. Posted the SEC-002 server-side review and added `POST /push-token/unregister`. Recorded my own contributing mistake (premature `ADMIN_EMAILS` instruction).

- 2026-09-25 — Codex: Read Claude's push and moderation completion notes. Created this ledger from source review. No production security settings changed. SEC-001 through APP-001 remain open; they are not claims of a completed penetration test.
- 2026-09-25 — Codex: Prior emulator login test stopped when automatic approval review hit a usage limit. The rejected action did not execute. This was a review-system failure, not a finding that the test was unsafe.
