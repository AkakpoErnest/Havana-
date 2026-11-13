# Putting Havana on Google Play

Everything Google asks for, ready to copy. Files are in this folder (`mobile/store/`).

## 0. Before you start (one time)

- Create a developer account at https://play.google.com/console ($25 once). Choose **Personal** unless you have a registered business.
- Google will check your ID. That can take a few days.
- **Personal accounts:** before the app can go public, **12 testers** must have it installed through a **closed test** for **14 days in a row**. Collect 12 Gmail addresses (Kenyan testers count).

## 1. Create the app

Play Console → **Create app**
- App name: **Havana**
- Default language: English (United Kingdom)
- App or game: **App** · Free or paid: **Free**
- Tick the declarations.

## 2. Store listing (Grow → Store presence → Main store listing)

**Short description (max 80):**
> Buy, haggle and swap second-hand finds near you in Ghana, Nigeria and Kenya.

**Full description:**
> Havana is Africa's second-hand sweet spot. Swipe through good finds from people near you, haggle a little, or swap something you no longer need for something you'll love.
>
> • Swipe or browse: clothes, shoes, bags, furniture, electronics and household items
> • Haggle in chat: make an offer, counter, and agree a price
> • Swap: trade items straight from your closet
> • Local prices in GH₵, ₦ and KSh
> • Pay the seller directly by mobile money (MoMo, M-Pesa) or cash on pickup. Havana never takes payments.
> • Safety first: approximate locations only, reporting, and tips for meeting in public
>
> Now in Ghana, Nigeria and Kenya.

**Graphics:**
- App icon: `icon-512.png`
- Feature graphic: `feature-graphic.png` (1024×500)
- Phone screenshots: everything in `screenshots/`

**Category:** Shopping · **Email:** your support email · **Website:** https://havana-web.onrender.com

## 3. App content (Policy → App content)

| Question | Answer |
|---|---|
| Privacy policy | https://havana-api.onrender.com/privacy |
| Ads | No ads |
| App access | Login needed. Give reviewers a test phone number and explain how to get the code (see the note below). |
| Target audience | 18 and over |
| Content rating | Fill in the questionnaire: category "All other app types". Users can talk to each other: **Yes**. Shares location: **approximate only**. No violence, gambling or drugs. |
| Government / financial / health app | No |
| Account deletion | In the app: You → Delete account. Web link: https://havana-api.onrender.com/account-deletion |

**Data safety** (what Havana collects; none of it is sold or used for ads; all sent encrypted over HTTPS; users can delete their account):
- Personal info: **name**, **phone number** and/or **email** (account and login)
- Location: **approximate location** (area and an optional rounded location, to show nearby items)
- Photos: **photos** the user uploads for listings
- Messages: **in-app messages** (chats between buyers and sellers)
- App info: **crash/diagnostic data**: none collected
- Device IDs: **push notification token** (to deliver notifications)
All are "collected", "required for the app to work" (except location: optional), "not shared".

**Note on login for reviewers:** while login codes still appear on screen (development mode), reviewers can log in with any number. Once email/SMS codes are on, create a review account and give Google its login.

## 4. Upload the app

Test and release → Testing → **Closed testing** → Create track → Create release
- Google asks about **Play App Signing**: accept (Google keeps the app key; we sign uploads with our upload key).
- Upload `havana-<version>.aab` (Claude builds it on the Mac; it is not in git).
- Release notes: "First test release of Havana."
- Add the 12+ testers' emails, then share the opt-in link with them.

After 14 days with 12 testers: **Apply for production** in the dashboard.

## 5. Upload key (keep it safe)

- The upload key is at `~/havana-signing/` on the Mac (`havana-upload.jks` + `keystore.properties` with the password). **Back up that folder** somewhere private (e.g. a password manager or encrypted USB). Never put it in git or Markdown.
- Upload certificate SHA-256: `A4:DF:11:C8:41:D7:FA:E1:23:82:1B:55:4E:83:B8:4E:BC:AC:4B:65:9A:AF:73:99:41:6D:DD:A2:9C:BA:13:43`
- If it is ever lost, Google can reset the upload key (Play Console → App integrity), because Google holds the real app key.
- Each new upload needs a higher `versionCode` (bump `android.versionCode` in `app.json`).

## Before going public (not needed for closed testing)

1. Turn off on-screen login codes (needs the Brevo key) and sign out everyone who logged in with them.
2. Render Starter plan ($7/month) so the server doesn't sleep.
3. Update the vulnerable server packages (body-parser, sharp) flagged in the 2026-11-12 security review.
