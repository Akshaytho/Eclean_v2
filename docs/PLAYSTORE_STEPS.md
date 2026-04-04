# Google Play Store — Step by Step Upload Guide

> Follow these steps from phone or laptop. Delete this file after app is live.

---

## STEP 1 — Open Play Console
- Go to https://play.google.com/console
- Sign in with the Google account you paid $25 with
- If account is still verifying (24-48h), wait for approval email

## STEP 2 — Create App
- Click **"Create app"** (blue button, top right)
- App name: **eClean**
- Default language: **English (United States)**
- App or Game: **App**
- Free or Paid: **Free**
- Check all declaration boxes (developer policies, US export laws)
- Click **"Create app"**

## STEP 3 — App Listing (Store Listing → Main store listing)
Go to **Grow → Store listing → Main store listing**

### App name:
```
eClean - AI Verified Civic Work
```

### Short description (max 80 chars):
```
Post cleaning tasks, verify with AI, pay workers fairly. Clean cities together.
```

### Full description:
Copy the full description from `docs/playstore-listing.md` in the repo.

### App icon:
- Already included in AAB (auto-pulled from build)

### Feature graphic (1024x500):
- Required. Use any graphic design tool (Canva works)
- Green background + eClean logo + tagline "Clean Cities. Fair Pay."
- Or skip for now (not required for internal testing track)

### Screenshots (minimum 2, recommended 4-8):
- Take screenshots from your phone while using the app
- Required sizes: phone screenshots must be 1080x1920 or similar
- Suggested screenshots:
  1. Worker home screen (showing nearby tasks on map)
  2. Camera capture screen (side-by-side reference matching)
  3. Task detail screen (showing AI score + status)
  4. Buyer post task screen (4-step wizard)
- Save them to phone, upload in Play Console

### Category:
- Primary: **Business**

## STEP 4 — Content Rating
Go to **Policy → App content → Content rating**

- Click **"Start questionnaire"**
- Category: **Utility, Productivity, Communication, or Other**
- Does the app contain: (answer all NO except):
  - Users can interact/communicate: **YES** (chat feature)
  - Users can share their location: **YES** (GPS tracking)
  - Does the app collect personal info: **YES**
- Submit questionnaire
- You'll get a rating (likely "Rated for 3+" or "Everyone")

## STEP 5 — Data Safety
Go to **Policy → App content → Data safety**

Fill these:
- Does your app collect or share user data? **YES**

### Data collected:

| Data type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Name | Yes | No | Account |
| Email | Yes | No | Account |
| Phone number | Yes (optional) | No | Account |
| Approximate location | Yes | No | Task matching |
| Precise location | Yes | Yes (with buyer during active task) | Live tracking |
| Photos | Yes | Yes (Cloudinary storage, AI analysis) | Work verification |
| Payment info | Yes | Yes (Razorpay) | Task payments |
| Device ID | Yes | No | Fraud prevention |
| App interactions | Yes | No | Analytics |
| Crash logs | Yes | Yes (Sentry) | Bug fixing |

### Security:
- Data encrypted in transit: **YES** (HTTPS)
- Data can be deleted by user: **YES** (request via email)

## STEP 6 — Target Audience
Go to **Policy → App content → Target audience**

- Target age group: **18 and over**
- Is this app designed for children? **NO**

## STEP 7 — Privacy Policy
Go to **Policy → App content → Privacy policy**

- Paste this URL:
```
https://raw.githubusercontent.com/Akshaytho/Eclean_v2/image_capture_workflow/docs/privacy-policy.html
```
- (Temporary — move to eclean.app/privacy later)

## STEP 8 — Upload AAB
Go to **Release → Production** (or **Testing → Internal testing** to test first)

### Recommended: Start with Internal Testing
- Go to **Testing → Internal testing**
- Click **"Create new release"**
- Upload the AAB file. Download it first from:
```
https://expo.dev/artifacts/eas/dZZr7bWCH3hafxosc2TPoq.aab
```
- Release name: **1.0.0 (5)**
- Release notes:
```
eClean v1.0.0 — First release

- AI-powered cleaning work verification
- Real-time GPS tracking during active tasks
- Side-by-side reference photo matching
- Secure payments via Razorpay
- Live chat between buyer and worker
- Motion and environmental verification
```
- Click **"Review release"** → **"Start rollout"**

### Add testers for Internal Testing:
- Go to **Testers** tab
- Create an email list
- Add your email + any tester emails
- They get a link to install from Play Store (private)

## STEP 9 — Move to Production (when ready)
After testing internally:
- Go to **Release → Production**
- Click **"Create new release"**
- **"Add from library"** → select the same AAB
- Fill release notes
- Click **"Review release"** → **"Start rollout to production"**
- Google reviews the app: **1-7 days** for first submission

## STEP 10 — After Approval
- App is live on Play Store
- Share the Play Store link with workers and buyers
- Monitor crashes in Play Console → **Android vitals**
- Monitor reviews in **Ratings & reviews**

---

## QUICK REFERENCE

| What | Where |
|------|-------|
| AAB download | https://expo.dev/artifacts/eas/dZZr7bWCH3hafxosc2TPoq.aab |
| Privacy policy | https://raw.githubusercontent.com/Akshaytho/Eclean_v2/image_capture_workflow/docs/privacy-policy.html |
| Full description text | docs/playstore-listing.md |
| Data safety answers | docs/playstore-listing.md (Section 6) |
| App icon | Included in AAB |

---

## COMMON ISSUES

**"App rejected — privacy policy not accessible"**
→ The GitHub raw URL might not render as HTML. Host on Vercel instead.

**"Screenshots required"**
→ Take 2+ screenshots from the app on your phone. 1080x1920 minimum.

**"Feature graphic required"**
→ Make one on Canva (1024x500). Green bg + logo + tagline.

**"Target API level too low"**
→ Our build targets API 36 (latest). This won't happen.

**"App uses background location"**
→ Play Console will ask why. Answer: "Real-time worker location tracking during active cleaning tasks for buyer visibility and work verification."
→ You may need to submit a short video showing the feature.
