# ILCARTIGO — AdSense activation guide

Everything monetization-related is **pre-wired but inert** until you have an
approved Google AdSense publisher id (`ca-pub-` followed by 16 digits). Until
then the game shows tasteful in-house placeholders and the website shows
reserved ad boxes — **no real AdSense script loads anywhere**, which is the
policy-safe state (Google rejects sites that show empty live ad units).

This guide is the complete switch-on checklist. There are exactly **three**
places to edit + **one** file to fill in.

---

## Step 0 — Get approved first

1. Deploy the site live (see the README "Publication" section) — AdSense will
   not approve a site it can't crawl.
2. Apply at <https://adsense.google.com> with your live domain.
3. Google requires: real content (✓ — home/about/privacy/terms), a privacy
   policy disclosing ad cookies (✓ — `privacy.html` §4), and that the site is
   reachable. The placeholders are fine during review.
4. You'll be given a publisher id like `ca-pub-1234567890123456`. The numeric
   part (the 16 digits) is your `pub-` id used in `ads.txt`.

Do **not** edit any of the files below until you hold a real id — shipping a
real `ca-pub` with no approved units is itself a policy risk.

---

## Step 1 — Game client  (`client/src/ads/Ads.ts`)

One line, plus the per-slot unit ids from your AdSense dashboard:

```ts
export const AD_CONFIG = {
  publisherId: 'ca-pub-1234567890123456',   // ← your real id (was ca-pub-XXXX…)
  slots: {
    'menu-top':  { adUnitId: '1111111111', label: 'Top Banner · 728×90' },
    'menu-side': { adUnitId: '2222222222', label: 'Sidebar · 300×600' },
    'postmatch': { adUnitId: '3333333333', label: 'Sponsored' },
    'aimlab':    { adUnitId: '4444444444', label: 'Sponsored' },
  },
};
```

The moment `publisherId` is a real `ca-pub-…`, `Ads.isConfigured` flips true:
the loader script injects, placeholders become live `<ins class="adsbygoogle">`
units, and `refreshSlot()` requests a fresh ad on each post-match screen. No
other game code changes. Rebuild: `cd client && npm run build`.

## Step 2 — Marketing site  (`website/index.html`)

Uncomment the loader in `<head>` and set the id:

```html
<script async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"
  crossorigin="anonymous"></script>
```

Then replace each reserved slot div (e.g. the `728 × 90 · Reserved for AdSense`
box) with a live unit from your dashboard:

```html
<ins class="adsbygoogle" style="display:block"
     data-ad-client="ca-pub-1234567890123456"
     data-ad-slot="5555555555"
     data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

## Step 3 — `ads.txt`  (`website/ads.txt`)

Uncomment the line and insert your numeric id (digits after `ca-pub-`):

```
google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
```

Served at `https://ilcartigo.com/ads.txt`. AdSense checks this within ~24 h of
going live; until then it's a harmless comment-only file.

---

## Verify after activation

- Site: `https://ilcartigo.com/ads.txt` returns the `google.com, pub-…` line.
- Game: open the main menu — the placeholder boxes are replaced by real ads
  (or blank during AdSense's initial fill period, which is normal).
- DevTools console: no AdSense policy errors; the `adsbygoogle.js` request 200s.
- Consent: the in-game `ilc.adconsent` flag and the site cookie banner both
  gate personalized ads (npa=1 fallback until consent) — already wired.
