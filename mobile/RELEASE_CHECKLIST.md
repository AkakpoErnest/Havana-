# Havana mobile release checks

## Build configuration

Preview APK and production builds use `https://havana-api.onrender.com` through `eas.json`. Local Expo uses `mobile/.env`; set `EXPO_PUBLIC_API_URL` there to the hosted URL if testing away from the laptop, then restart Expo.

The app allows 75 seconds for API requests and 90 seconds for uploads. After eight seconds, login and loading screens explain that connecting can take about a minute. Requests that modify data are not automatically retried.

Brand assets live in `assets/`. A new native build is required to see the icon and native splash changes; Expo Go is not a reliable native splash preview. See [Expo's splash guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

## Check on Android and iPhone

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
