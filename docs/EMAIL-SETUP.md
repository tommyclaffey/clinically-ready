# Email setup (Resend)

Invites and Forgot Password links go out by email once three Railway variables are set. Until then the app works as
before: invite links are copied by hand, and Forgot Password says to ask an admin. Code: `server/mail.mjs`.

## Tommy's steps (~20 minutes, once)

1. **Make a Resend account** at resend.com (it has a free plan; check its current limits on their pricing page).
   One account can cover Mise too.
2. **Add the sending domain** in Resend → Domains (e.g. `clinicallyready.com`, or a subdomain like `mail.clinicallyready.com`).
   Resend shows 3–4 DNS records (SPF and DKIM, sometimes MX for bounces). Add them where the domain's DNS lives, then
   press Verify. Without this, emails land in spam or are refused.
3. **Make an API key** in Resend → API Keys (permission: sending access).
4. **On Railway** (service `web`), set:
   - `RESEND_API_KEY` = the key
   - `MAIL_FROM` = `Clinically Ready <hello@your-domain>` (must be on the verified domain)
   - `PUBLIC_ORIGIN` = the app's real address, e.g. `https://app.clinicallyready.com` (no trailing slash).
     It's already used by Google sign-in; links in emails are built from it.
5. Redeploy. Then test: Forgot Password on the sign-in page with your own account, and an invite to yourself.

## What gets sent

| Email | When | Link works |
|---|---|---|
| Invite | An owner or admin presses Send invite | once, for 14 days |
| Reset password | Someone presses Forgot password → Email me a link | once, for 2 hours; signs them out everywhere else |

Limits: 3 reset emails an hour per address, 30 an hour per network, 30 invites an hour per sender. Never from the demo.
