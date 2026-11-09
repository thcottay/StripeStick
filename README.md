# StripeStick

Promotional product page and waitlist flow. Plain HTML, CSS and JavaScript in `public/`, with a small dependency-free Node server in `server/`.

## Run it

```bash
npm start
```

The site runs at http://localhost:3000. Set `PORT` to change the port. Requires Node 18 or newer.

## Waitlist flow

The "Join the waitlist" buttons open a full-screen dialog, and each step has its own URL:

| URL | Step |
| --- | --- |
| `/waitlist` | Sign-up form |
| `/waitlist/questions` | Confirmation and optional questionnaire |
| `/waitlist/thanks` | Answers received |
| `/waitlist/skipped` | Questionnaire skipped |

Later steps need a sign-up in the same browser tab, so a direct visit without one goes to `/waitlist`. The server returns `index.html` for these paths, so a static host needs the same rewrites. Each URL suits analytics goals, for example counting visits to `/waitlist/questions` as conversions. Query strings such as UTM tags are kept through the flow.

1. Sign-up: email, first name and consent. `POST /api/waitlist` returns a token.
2. Optional questionnaire: `POST /api/waitlist/answers` with that token.
3. Finish: "Got it, thanks." if answers were sent (the drill-tip line uses the fault they picked), or "You're still on the list." if they skipped.

Without JavaScript the sign-up form renders at the end of the page, posts normally, and lands on `/thanks.html`.

## Where leads go

Sign-ups and questionnaire answers go to a Google Sheet, through a small Apps Script attached to the sheet. Each email gets one row, and questionnaire answers fill in that same row. The script creates a `Waitlist` tab with headers on first use.

Setup:

1. Create a Google Sheet, then open **Extensions > Apps Script**.
2. Replace the editor contents with [`google-apps-script/Code.gs`](google-apps-script/Code.gs) and save.
3. Generate a secret with `openssl rand -hex 32`. In **Project Settings > Script Properties**, add `SHARED_SECRET` with that value.
4. Choose **Deploy > New deployment > Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then authorize it and copy the web app URL. "Anyone" only makes the URL reachable. The script rejects requests without the secret.
5. Set these environment variables on the server, then restart it:

```bash
GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/.../exec" GOOGLE_SHEETS_SECRET="your-secret" npm start
```

Without both variables the site still runs, but sign-ups show an error and the server logs a warning. If you edit the script later, publish it with **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

The repository is public, so keep the secret and web app URL out of it. The sheet holds personal data, so limit who it's shared with.

Behind a reverse proxy, set `TRUST_PROXY=1` so rate limiting sees real client addresses.

## Confirmation emails

New sign-ups get one confirmation email through [Resend](https://resend.com), sent after their row is saved. Signing up again with the same email doesn't send another. If an email fails, the sign-up still succeeds and the failure is logged. The wording is in `server/email.mjs`.

Setup:

1. In Resend, add your domain and create an API key with sending access.
2. Add the DNS records Resend lists wherever your domain's DNS is hosted, and wait for the domain to show as verified. Also add a DMARC record if you don't have one.
3. Publish the latest `google-apps-script/Code.gs` with **Deploy > Manage deployments > Edit > New version**. Emails stay off until the sheet script reports new sign-ups.
4. Set these environment variables, in Netlify's UI or on the local server:

| Variable | Example |
| --- | --- |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `StripeStick <hello@yourdomain.com>` |
| `EMAIL_REPLY_TO` (optional) | A mailbox you monitor |

## Analytics

[Microsoft Clarity](https://clarity.microsoft.com) records sessions and heatmaps. It only loads once `CLARITY_PROJECT_ID` is set in `public/js/analytics.js`, and never on localhost. Form inputs are always masked by Clarity, and first names shown on the page are masked with `data-clarity-mask`.

Each waitlist step sends a custom event, which you can use to build funnels and filter recordings:

| Event | Meaning |
| --- | --- |
| `waitlist_signup` | Saw the sign-up form |
| `waitlist_questionnaire` | Signed up and reached the questions |
| `waitlist_thanks` | Submitted the questions |
| `waitlist_skipped` | Skipped the questions |

## Deploying to Netlify

`netlify.toml` sets the publish folder, the waitlist URL rewrites and the security headers. `netlify/functions/waitlist.mjs` replaces the Node server's API and shares its logic through `server/waitlist.mjs`. The function limits each IP address to 20 requests a minute.

In the Netlify UI, leave the build command and base directory blank. Add `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_SECRET` under **Site configuration > Environment variables**, available to all scopes or at least to Functions. Don't put them in `netlify.toml`, because functions can't read variables set there and the repository is public.

## Before launch

- The domain `https://stripestick.com` is assumed in `public/index.html`, `robots.txt`, `sitemap.xml` and `llms.txt`.
- Publish a privacy policy that covers session recording, and add a consent banner if the site will have EU, UK or Swiss visitors.
- The social links in the dialog are assumed handles (`stripestick`). Update them in `public/index.html`.
- Images were cut from the flattened design comps at 1x. Replace the files in `public/assets/img/` with the originals, at the same names and proportions, for sharper results on high-density screens. Compress them once they're final, because large PNGs slow the page.
