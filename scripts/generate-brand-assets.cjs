// Run from the repository root after installing backend dependencies.
const sharp = require("../backend/node_modules/sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const out = path.join(__dirname, "../mobile/assets");
// The foreground stays within Android's central adaptive-icon safe zone.
const mark = `<path fill="#FFFFFF" d="M350 306h80v159c24-30 54-45 93-45 75 0 119 49 119 128v170h-80V557c0-46-19-70-56-70-46 0-76 32-76 84v147h-80z"/>
<circle cx="691" cy="681" r="37" fill="#FFB020"/>
<rect x="618" y="325" width="69" height="69" rx="22" fill="#F0437B" transform="rotate(14 652 359)"/>`;
const svg = (background, monochrome = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? '<path fill="#23206B" d="M0 0h1024v1024H0z"/>' : ""}${monochrome ? mark.replaceAll("#FFB020", "#FFFFFF").replaceAll("#F0437B", "#FFFFFF") : mark}</svg>`;
async function main() {
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, "brand-mark.svg"), svg(false));
  for (const [name, background, monochrome] of [
    ["icon", true, false],
    ["adaptive-icon", false, false],
    ["monochrome-icon", false, true],
    ["splash-icon", false, false],
  ]) {
    const raster = sharp(Buffer.from(svg(background, monochrome)));
    if (background) raster.removeAlpha();
    await raster.png().toFile(path.join(out, `${name}.png`));
  }
  await sharp(Buffer.from(svg(true)))
    .resize(64, 64)
    .png()
    .toFile(path.join(out, "favicon.png"));
  console.log(
    "Generated Havana icon, adaptive icon, monochrome icon, splash icon, and favicon.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
