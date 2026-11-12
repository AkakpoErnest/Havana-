# Havana mobile release checks

Track cross-agent findings and verification in [APP_SECURITY_REVIEW.md](../APP_SECURITY_REVIEW.md); discuss changes in [CONVERSATION.md](../CONVERSATION.md) and record ownership in [HANDOFF.md](../HANDOFF.md).

## Build configuration

Preview APK and production builds use `https://havana-api.onrender.com` through `eas.json`. Local Expo uses `mobile/.env`; set `EXPO_PUBLIC_API_URL` there to the hosted URL if testing away from the laptop, then restart Expo.

Startup profile requests allow 20 seconds with manual retry; saved-login reads allow 10 seconds with a retryable error. Other API requests allow 75 seconds and uploads 90 seconds. Deadlines cover response-body reads as well as headers. After eight seconds, login and loading screens explain that connecting can take about a minute. Requests that modify data are not automatically retried.

Brand assets live in `assets/`. A new native build is required to see the icon and native splash changes; Expo Go is not a reliable native splash preview. See [Expo's splash guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

## Check on Android and iPhone

### Local Android preview build

With Node 22, Java 17+, and the Android SDK installed, a standalone test APK can be built without Expo login. From `mobile/`:

```sh
EXPO_PUBLIC_API_URL=https://havana-api.onrender.com EXPO_PUBLIC_USE_RN_FETCH=1 npx expo prebuild --platform android --no-install
cd android
EXPO_PUBLIC_API_URL=https://havana-api.onrender.com EXPO_PUBLIC_USE_RN_FETCH=1 NODE_ENV=production ./gradlew :app:assembleRelease --console=plain --max-workers=4
```

Set `ANDROID_HOME` to the installed SDK location if it is not already configured. The output is `android/app/build/outputs/apk/release/app-release.apk`. This bundles JavaScript, so Metro is not required. Generated native files are ignored by Git; prebuild may also change the npm `android`/`ios` scripts, so review that diff.

Environment-only changes may leave Gradle’s old JavaScript bundle cached (observed by Claude on October 30). After changing EXPO_PUBLIC_API_URL or EXPO_PUBLIC_USE_RN_FETCH, remove `android/app/build/generated/assets/react/release` and `android/app/build/intermediates/incremental/packageRelease` from the mobile directory before rebuilding, then verify the bundled configuration and APK timestamp/hash.

The generated project uses a development signing key for this local preview. Store distribution needs production signing. Remote push notifications still require the EAS project ID and Android push credentials; an APK alone does not complete push setup. Verify the package, signature, hosted API URL, and emulator launch before sharing the artifact.

### Device acceptance checks

- Cold launch: native indigo splash → short Havana animation → login or your existing session. No white flash or blocked taps after the intro.
- Enable reduced motion in phone settings, relaunch, and confirm the animation is skipped.
- Leave the hosted server idle, then request a login code. The waiting message should appear if needed and login should complete without a premature timeout.
- Turn off networking, try login or refresh, and confirm a useful error appears and retry works after reconnecting.
- Use a new account: complete name and area, restart, and confirm onboarding stays completed.
- Publish a listing on web and Android: while uploading, fields/toggles and photo removal must stay locked. A failed publish retains the draft.
- You → Name / Area: save each independently, confirm fields lock during save and failed saves retain the draft. Country → pick GH/NG/KE, confirm the row updates and Discover/Browse refresh for that country.
- Browse on Android, iPhone and web: search, category/trade/sort, more than 20 results, load-more failure/retry, open item then Back, empty/error states.
- You on web and phones: open/close every settings sheet, deny location (or let it time out), save location, manage listing status, saved items, backup login, admin reports, cancel account deletion, and log out. Confirm sheets dismiss when opening an item.
- Upload a photo and check its previews in the feed/profile, then open the listing and confirm the full photo loads.
- On two phones: send an offer, accept/counter it, swap, and exchange chat messages. Check the keyboard does not cover the composer.
- While a login or backup code request is pending, the phone/email selector and destination field must stay locked. During verification, the code and restart button must stay locked. Restarting a failed attempt clears the old code and error.
- Verify logout returns to login; restarting while signed out must not reveal account information. Open an item/chat deep link while signed out and confirm login is shown. Back navigation must not reopen account screens after logout or bypass unfinished onboarding.

## Before a public launch

- Replace development OTP with real code delivery and disable the backend development-OTP flags.
- Supply the privacy policy, terms, support contact, and store listing information.
- Complete physical-device checks above and review reporting/moderation operations.

## Security review gates

- Resolve SEC-001 before enabling real moderator accounts on a public deployment.
- SEC-002: original ordering and network-blocking logout fixes reviewed; fix the newly reproduced storage-failure gap (cleanup journal must survive failed writes/restart). Then verify offline logout/reconnect, process restart, account switching, and delayed registration/cleanup on a device.
- SEC-003: code correction reviewed: internal scores omitted and distances/ranking use coarse grid cells. Complete a fresh production payload check; retain owner/non-owner and nested-listing coverage.
- APP-001: code correction reviewed; verify on a device that an already-handled notification does not reopen a chat after logout/login or restart.
- Record evidence and reviewer sign-off in the shared review ledger.

## Local preview verification — 2026-09-30

- Built `artifacts/havana-preview.apk` with `:app:assembleRelease` (includes Android release lint).
- Verified APK v2 signature, package `com.havana.market`, version 1.0.0, minSdk 24, and arm64-v8a/armeabi-v7a/x86/x86_64 libraries.
- Confirmed hosted API URL inside the bundled JavaScript.
- Installed on Android API 36 ARM64 emulator; cold launch renders login, with no AndroidRuntime/ReactNativeJS error logs during the startup smoke test. Evidence: `artifacts/launch.png`, `artifacts/build-info.json`.
- Root typecheck/lint passed in this build pass; updated mobile tests passed 13/13. Claude records backend 17/17 and live migration verification in the shared ledger.
- Physical-device acceptance, signed-in/two-phone flows, and push verification remain pending. This APK uses development signing and has no EAS projectId or Android push credentials.


## Current review — 2026-11-11

- Codex freshly reran mobile tests: 15/15 pass. Security code review and remaining runtime gates are recorded in APP_SECURITY_REVIEW.md.
- Claude reports a fresh Kenya-flow emulator acceptance on the multi-country APK; see HANDOFF.md for artifact details. Two-phone and native push acceptance remain separate checks.
- APK is publicly downloadable per Claude’s update; real OTP delivery remains the highest-priority deployment follow-up. The blueprint’s development defaults do not prove the current live settings.
- Privacy/account-deletion pages already exist; confirm final policy wording, terms, support contact and store materials rather than treating page creation as unfinished.
