# Havana brand assets

The icon uses an indigo background, a white `h`, a mango dot, and a hibiscus accent. The full `havana.` wordmark appears in the opening animation. The adaptive foreground fits inside Android's central safe area, and the monochrome image supports themed icons.

`brand-mark.svg` is the vector source. PNGs are generated deterministically by `node scripts/generate-brand-assets.cjs` from the repository root, using the backend's installed Sharp dependency. Change the mark in that script before regenerating.

`app.json` configures the app icon, adaptive icon, favicon, and native splash screen. The native splash stays visible until the first React layout after fonts load, then hands over to `LaunchIntro`.

Native icon and splash changes require a new app build. Expo Go does not accurately preview the release splash screen. Check a release build on Android and iOS, including reduced-motion mode.
