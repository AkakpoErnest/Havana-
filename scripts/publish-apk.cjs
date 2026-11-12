// Uploads an APK to R2 as the website's public Android download (downloads/havana-beta.apk).
// Run from the repository root after installing backend dependencies:
//   node scripts/publish-apk.cjs mobile/artifacts/havana-xyz.apk
// R2 credentials come from backend/.env.production. Afterwards bump the `?v=` on the download link in
// website/index.html so phones skip cached copies, and record the SHA-256 in website/HANDOFF.md.
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("../backend/node_modules/@aws-sdk/client-s3");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const KEY = "downloads/havana-beta.apk";

async function main() {
  const apk = process.argv[2];
  if (!apk || !fs.existsSync(apk)) throw new Error("Usage: node scripts/publish-apk.cjs <path-to.apk>");
  const env = Object.fromEntries(
    fs
      .readFileSync(path.join(__dirname, "../backend/.env.production"), "utf8")
      .split("\n")
      .filter((line) => /^R2_[A-Z_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const body = fs.readFileSync(apk);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: KEY,
      Body: body,
      ContentType: "application/vnd.android.package-archive",
      ContentDisposition: 'attachment; filename="havana-beta.apk"',
      CacheControl: "public, max-age=300",
    }),
  );
  const head = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: KEY }));
  console.log(`Uploaded ${head.ContentLength} bytes`);
  console.log(`SHA-256 ${crypto.createHash("sha256").update(body).digest("hex")}`);
  console.log(`${env.R2_PUBLIC_URL}/${KEY}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
