# StripeStick

Promotional product page and waitlist flow. Plain HTML, CSS and JavaScript in `public/`, with a small dependency-free Node server in `server/`.

## Run it

```bash
npm start
```

The site runs at http://localhost:3000. Set `PORT` to change the port. Requires Node 18 or newer.

## Waitlist flow

The "Join the waitlist" buttons open a full-screen dialog. Linking to `/#waitlist` opens it directly.

1. Sign-up: email, first name and consent. `POST /api/waitlist` returns a token.
2. Optional questionnaire: `POST /api/waitlist/answers` with that token.
3. Finish: "Got it, thanks." if answers were sent (the drill-tip line uses the fault they picked), or "You're still on the list." if they skipped.

Without JavaScript the sign-up form renders at the end of the page, posts normally, and lands on `/thanks.html`.

## Where leads go

Leads are saved to `data/leads.json` (git-ignored, because it holds personal data). Set `DATA_DIR` to store it elsewhere, on a persistent disk in production. To send leads to a database or CRM, replace `server/store.mjs`, which exposes `upsertSignup` and `saveAnswers`.

Behind a reverse proxy, set `TRUST_PROXY=1` so rate limiting sees real client addresses.

## Before launch

- No confirmation email is sent yet, although the flow tells people to check their inbox. Hook an email provider into `upsertSignup`.
- The domain `https://stripestick.com` is assumed in `public/index.html`, `robots.txt`, `sitemap.xml` and `llms.txt`.
- The social links in the dialog are assumed handles (`stripestick`). Update them in `public/index.html`.
- Images were cut from the flattened design comps at 1x. Replace the files in `public/assets/img/` with the originals, at the same names and proportions, for sharper results on high-density screens. Compress them once they're final, because large PNGs slow the page.
