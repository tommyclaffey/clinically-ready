# Turning on "Continue with Google" and "Sign in with Microsoft"

The app already supports both. Each needs a one-time registration that gives you two codes
(a client ID and a client secret). Put them in Railway and the buttons appear on their own.

> Screens and button names below were accurate when written (Oct 2026). Google and Microsoft move
> things around; if a label differs, look for the closest match.

Live address: `https://web-production-1f8f7.up.railway.app`

---

## Google (do this first — The Well uses Google Workspace)

1. Go to **console.cloud.google.com** and sign in with **your** Google account.
2. Top bar → project picker → **New project** → name it `Clinical Onboarding` → Create. Make sure it's selected.
3. Menu → **Google Auth Platform** (older name: "OAuth consent screen") → **Get started**:
   - App name: `Clinical Onboarding` · Support email: your email
   - Audience: **External** · Contact email: your email → Finish
4. **Audience** → **Publish app** (moves it from "Testing" to "In production").
   This app only asks for name, email and profile picture, which Google treats as basic.
5. **Clients** → **Create client** → Application type **Web application** → name `Railway`:
   - Authorized JavaScript origins:
     `https://web-production-1f8f7.up.railway.app`
   - Authorized redirect URIs (both):
     `https://web-production-1f8f7.up.railway.app/api/auth/oauth/google/callback`
     `http://localhost:5173/api/auth/oauth/google/callback`
   - Create
6. Copy the **Client ID** and **Client secret**.
7. Put them in Railway (or send them to Claude to do it):
   ```bash
   cd ~/Coding/clinical-onboarding
   railway variables --set "GOOGLE_CLIENT_ID=…" --set "GOOGLE_CLIENT_SECRET=…"
   ```
   Railway redeploys; the Google button appears on sign-in and invite pages.

---

## Microsoft (when the first Microsoft 365 organisation signs up)

1. Go to **entra.microsoft.com** and sign in. If Microsoft asks you to create a directory (tenant), that's free.
2. **Applications → App registrations → New registration**:
   - Name: `Clinical Onboarding`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: platform **Web** →
     `https://web-production-1f8f7.up.railway.app/api/auth/oauth/microsoft/callback`
   - Register
3. On the app's **Overview**, copy the **Application (client) ID**.
4. **Certificates & secrets → New client secret** → copy the **Value** (shown once).
   ⚠️ Secrets expire (you pick 6–24 months). Put the expiry date in Todoist — when it lapses, Microsoft sign-in stops.
5. **API permissions** → make sure `openid`, `email`, `profile` (Microsoft Graph, delegated) are listed; add them if not.
6. Railway:
   ```bash
   railway variables --set "MICROSOFT_CLIENT_ID=…" --set "MICROSOFT_CLIENT_SECRET=…"
   ```

---

## How it behaves

- **Invites still decide who gets in.** The office invites `name@work-domain`; the person clicks the link and
  continues with the work account that has that exact email.
- **Google:** after that, signing in with the same Google account just works. A verified Google email that matches an
  existing account is linked automatically.
- **Microsoft:** an email alone never finds an account (any Microsoft tenant admin can set any email on an account —
  the "nOAuth" problem). It must come through an invite, or be connected from the **Account** page while signed in.
- **Sessions:** Google/Microsoft sign-ins last 12 hours; password sign-ins 7 days. Turning off someone's work
  account ends their access by the next morning.
- **Each organisation chooses** Google / Microsoft / email-and-password in Settings. The owner can't switch off the
  only method they can use.
- If a provider isn't configured, its button simply doesn't show.
