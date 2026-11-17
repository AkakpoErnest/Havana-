import { Controller, Get, Header } from '@nestjs/common';

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;color:#16152E;line-height:1.6">
<h1 style="color:#23206B">havana<span style="color:#F0437B">.</span></h1>${body}</body></html>`;

const contact = () => process.env.SUPPORT_EMAIL
  ? `<a href="mailto:${process.env.SUPPORT_EMAIL}">${process.env.SUPPORT_EMAIL}</a>`
  : 'the contact details in the Havana app';

/** Public legal pages (Google Play needs a privacy policy URL). Keep them in step with what the code actually does. */
@Controller()
export class LegalController {
  @Get('privacy') @Header('Content-Type', 'text/html; charset=utf-8')
  privacy() {
    return page('Havana privacy policy', `
<h2>Privacy policy</h2><p><i>Last updated: 26 September 2026</i></p>
<p>Havana is a marketplace for Africa, currently in Ghana, Nigeria and Kenya, where people buy, haggle and swap new and pre-loved items. This policy explains what we collect, why, and your choices. Questions: ${contact()}.</p>
<h3>What we collect</h3><ul>
<li><b>Account:</b> your phone number and/or email (to send login codes), your name, your country and your area (for example "Osu" or "Westlands").</li>
<li><b>Location (optional):</b> only if you allow it, to show items near you and to place your listings. We store it rounded to about 1 km, never your exact spot, and <b>other people never see it</b>: only the area you type and a distance rounded to the nearest 0.5 km.</li>
<li><b>Listings:</b> photos, title, description, price or swap value. We remove hidden photo data such as GPS location from every photo you upload.</li>
<li><b>Messages and activity:</b> chats, offers, swap agreements, ratings, reports, items you save or pass on.</li>
<li><b>Notifications:</b> a push token for your phone, if you allow notifications. Message notifications don't include the message itself.</li>
<li><b>Technical data:</b> your IP address and basic request logs, used briefly to keep the service running and to limit abuse.</li></ul>
<h3>How we use it</h3><p>To run the marketplace: sign you in, show and rank items, deliver messages and notifications, prevent spam and fraud (for example limits on how fast an account can post), and review reported listings. We do <b>not</b> sell your data and we do not show ads.</p>
<h3>Who can see what</h3><p>Other Havana users can see your name, your area, your listings and ratings, and the messages you send them. Your phone number and email are never shown to other users.</p>
<p>We use these service providers to run Havana: Render (servers, Germany), Neon (database, Germany), Cloudflare (photo storage), Expo (push notifications), Brevo (email login codes) and, when enabled, an SMS provider for phone login codes. They process data only to provide their service to us.</p>
<h3>Payments</h3><p>Havana does not process payments. Buyers and sellers pay each other directly (for example mobile money such as MoMo or M-Pesa, or cash on pickup). Meet in public and check the item before paying.</p>
<h3>How long we keep it</h3><p>Login codes expire after 5 minutes. Everything else is kept while your account exists. When you <a href="/account-deletion">delete your account</a>, your personal data, listings and photos are removed. Offer amounts and system notes in other people's chats stay, without your name, so their history still makes sense. Reports other people made about an account are kept for up to 12 months so moderators can act on repeated abuse.</p>
<h3>Security</h3><p>Connections are encrypted (HTTPS), login codes are stored hashed and expire quickly, and moderator tools require a verified login.</p>
<h3>Your choices and rights</h3><p>You can update your name and area in the app, turn off location or notifications in your phone settings, and delete your account at any time. Under Ghana's Data Protection Act, 2012 (Act 843) you may ask to access or correct your data: contact ${contact()}.</p>
<h3>Age</h3><p>Havana is for people aged 18 and over, because trades involve meeting in person. Everyone confirms this, and agrees to the <a href="/rules">community rules</a>, before using Havana.</p>
<h3>Changes</h3><p>We will update this page when our practices change and show the new date above.</p>`);
  }

  @Get('rules') @Header('Content-Type', 'text/html; charset=utf-8')
  rules() {
    return page('Havana community rules', `
<h2>Community rules</h2><p><i>Last updated: 17 November 2026</i></p>
<p>Havana works because neighbours trust each other. By using Havana you confirm you are <b>18 or older</b> and agree to these rules.</p>
<h3>Be kind and honest</h3><ul>
<li>No insults, threats, harassment, hate speech or sexual messages.</li>
<li>Describe items truthfully, with your own photos. Only mark something <b>Brand new</b> if it is unused, and say if anything is damaged.</li>
<li>Only list things you own and have the right to sell or swap.</li></ul>
<h3>Items you can't list</h3><ul>
<li>Weapons, ammunition, explosives and their parts</li>
<li>Drugs, medicines and prescription products, alcohol and tobacco</li>
<li>Stolen goods, counterfeits, fake documents, IDs or money</li>
<li>Live animals, and products from protected animals (such as ivory)</li>
<li>Adult content, and anything illegal in Ghana, Nigeria or Kenya</li>
<li>Services, jobs, property rentals and digital accounts: Havana is for physical items, new or used</li></ul>
<h3>Trade safely</h3><ul>
<li>Meet in a busy public place, in daylight if you can. Bring a friend for big items.</li>
<li>Check the item before you pay. Pay the seller directly (mobile money such as MoMo or M-Pesa, or cash) at the handover.</li>
<li>Never pay a "deposit" or "delivery fee" before you have seen the item. Havana never asks you for money.</li></ul>
<h3>Report and block</h3><p>Report a listing from its page, or a person from the ⋯ menu in your chat with them. You can also block someone there: you won't see each other's listings and neither of you can send messages or offers. Moderators review reports, and listings are hidden automatically after several reports.</p>
<h3>What happens if rules are broken</h3><p>We may remove listings or messages, limit what an account can do, or close it. Some wording and items are blocked automatically. If you think we got it wrong, contact ${contact()}.</p>`);
  }
}
