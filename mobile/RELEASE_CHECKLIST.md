# Havana mobile release checks

Track cross-agent findings and verification in [APP_SECURITY_REVIEW.md](../APP_SECURITY_REVIEW.md); discuss changes in [CONVERSATION.md](../CONVERSATION.md) and record ownership in [HANDOFF.md](../HANDOFF.md).

## Build configuration

Preview APK and production builds use `https://havana-api.onrender.com` through `eas.json`. Local Expo uses `mobile/.env`; set `EXPO_PUBLIC_API_URL` there to the hosted URL if testing away from the laptop, then restart Expo.

The app allows 75 seconds for API requests and 90 seconds for uploads. After eight seconds, login and loading screens explain that connecting can take about a minute. Requests that modify data are not automatically retried.

Brand assets live in `assets/`. A new native build is required to see the icon and native splash changes; Expo Go is not a reliable native splash preview. See [Expo's splash guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

## Check on Android and iPhone

### Local Android preview build

With Node 22, Java 17+, and the Android SDK installed, a standalone test APK can be built without Expo login. From `mobile/`:

```sh
EXPO_PUBLIC_API_URL=https://havana-api.onrender.com npx expo prebuild --platform android --no-install
cd android
EXPO_PUBLIC_API_URL=https://havana-api.onrender.com NODE_ENV=production ./gradlew :app:assembleRelease --console=plain --max-workers=4
```

Set `ANDROID_HOME` to the installed SDK location if it is not already configured. The output is `android/app/build/outputs/apk/release/app-release.apk`. This bundles JavaScript, so Metro is not required. Generated native files are ignored by Git; prebuild may also change the npm `android`/`ios` scripts, so review that diff.

The generated project uses a development signing key for this local preview. Store distribution needs production signing. Remote push notifications still require the EAS project ID and Android push credentials; an APK alone does not complete push setup. Verify the package, signature, hosted API URL, and emulator launch before sharing the artifact.

### Device acceptance checks

- Cold launch: native indigo splash → short Havana animation → login or your existing session. No white flash or blocked taps after the intro.
- Enable reduced motion in phone settings, relaunch, and confirm the animation is skipped.
- Leave the hosted server idle, then request a login code. The waiting message should appear if needed and login should complete without a premature timeout.
- Turn off networking, try login or refresh, and confirm a useful error appears and retry works after reconnecting.
- Use a new account: complete name and area, restart, and confirm onboarding stays completed.
- Publish a listing on web and Android: while uploading, fields/toggles and photo removal must stay locked. A failed publish retains the draft.
- Type a profile name/area draft, then save location; the draft must remain. Edits typed while an earlier profile save is pending must also remain.
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
- Fix reopened SEC-002 cleanup ordering and blocking logout, then verify offline logout/reconnect, process restart, account switching, and delayed push registration. Include old cleanup completing after a new session registers.
- Fix reopened SEC-003: feed ranking scores still expose precise distance; verify response payloads omit internal ranking metadata.
- Verify APP-001: an already-handled notification must not reopen a chat after logout/login.
- Record evidence and reviewer sign-off in the shared review ledger.

## Local preview verification — 2026-09-30

- Built `artifacts/havana-preview.apk` with `:app:assembleRelease` (includes Android release lint).
- Verified APK v2 signature, package `com.havana.market`, version 1.0.0, minSdk 24, and arm64-v8a/armeabi-v7a/x86/x86_64 libraries.
- Confirmed hosted API URL inside the bundled JavaScript.
- Installed on Android API 36 ARM64 emulator; cold launch renders login, with no AndroidRuntime/ReactNativeJS error logs during the startup smoke test. Evidence: `artifacts/launch.png`, `artifacts/build-info.json`.
- Root typecheck/lint passed in this build pass; updated mobile tests passed 13/13. Claude records backend 17/17 and live migration verification in the shared ledger.
- Physical-device acceptance, signed-in/two-phone flows, and push verification remain pending. This APK uses development signing and has no EAS projectId or Android push credentials.
