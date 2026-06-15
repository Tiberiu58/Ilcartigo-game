/**
 * Ads — AdSense integration with graceful placeholders.
 *
 * Revenue layer. Ads appear only at NATURAL BREAKPOINTS (main menu, post-match
 * overlay) — never during combat. This respects both the player experience and
 * AdSense's policies (no ads on screens without publisher content / mid-game).
 *
 * Single config point: AD_CONFIG.publisherId. While it's the placeholder
 * (`ca-pub-XXXXXXXXXXXXXXXX`), NO AdSense script loads and slots render a
 * tasteful in-house placeholder — so dev/preview looks clean and we never ship
 * empty real ad units (a policy violation). Drop in the real id post-approval
 * and the same slots become live AdSense units with no other code changes.
 *
 * Consent: the marketing site already runs a cookie-consent banner. In-game we
 * read a localStorage consent flag and, until consent is granted, request
 * non-personalized ads (npa=1) — GDPR-friendly by default.
 */

const PLACEHOLDER_PUB = 'ca-pub-XXXXXXXXXXXXXXXX';

interface AdSlotDef {
  /** The AdSense ad-unit slot id (from your AdSense dashboard). */
  adUnitId: string;
  /** Human label for the in-house placeholder. */
  label: string;
}

export const AD_CONFIG = {
  /** Replace with your real publisher id after AdSense approval. */
  publisherId: PLACEHOLDER_PUB,
  /** Per-named-slot ad-unit ids. Fill these in from your AdSense dashboard. */
  slots: {
    'menu-top':  { adUnitId: '0000000000', label: 'Top Banner · 728×90' },
    'menu-side': { adUnitId: '0000000000', label: 'Sidebar · 300×600' },
    'postmatch': { adUnitId: '0000000000', label: 'Sponsored' },
    // Survival game-over card — a non-combat breakpoint (player decides whether
    // to replay), exactly like post-match. The between-wave intermission keeps
    // the player pointer-locked so it carries no ad (policy-safe).
    'survival-over':  { adUnitId: '0000000000', label: 'Sponsored' },
  } as Record<string, AdSlotDef>,
};

const CONSENT_KEY = 'ilc.adconsent';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

class AdManager {
  private scriptLoaded = false;
  /** Slots we've already mounted (by element), so re-mount is idempotent. */
  private mounted = new WeakSet<HTMLElement>();

  /** True once a real publisher id is configured (i.e. not the placeholder). */
  get isConfigured(): boolean {
    return AD_CONFIG.publisherId !== PLACEHOLDER_PUB && AD_CONFIG.publisherId.startsWith('ca-pub-');
  }

  /** Whether the player has granted consent for personalized ads. */
  get hasConsent(): boolean {
    return localStorage.getItem(CONSENT_KEY) === 'granted';
  }
  setConsent(granted: boolean) {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  }

  /**
   * Initialize the ad system. Mounts all `[data-ad-slot]` containers in the
   * document. Loads the AdSense script only if a real id is configured.
   * Safe to call once at boot.
   */
  init() {
    if (this.isConfigured) this.loadScript();
    document.querySelectorAll<HTMLElement>('[data-ad-slot]').forEach((el) => this.mountSlot(el));
  }

  /** Inject the AdSense loader script once. */
  private loadScript() {
    if (this.scriptLoaded) return;
    this.scriptLoaded = true;
    window.adsbygoogle = window.adsbygoogle || [];
    // Non-personalized by default until consent — GDPR-friendly.
    if (!this.hasConsent) {
      (window.adsbygoogle as Array<Record<string, unknown>>).push({
        params: { npa: '1' },
      } as never);
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.publisherId}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  /**
   * Render an ad (or placeholder) into a slot container. The container should
   * carry `data-ad-slot="<name>"` matching a key in AD_CONFIG.slots.
   */
  mountSlot(el: HTMLElement) {
    if (this.mounted.has(el)) return;
    this.mounted.add(el);
    const name = el.dataset.adSlot ?? '';
    const def = AD_CONFIG.slots[name];

    if (this.isConfigured && def) {
      // Real AdSense unit.
      el.innerHTML = '';
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', AD_CONFIG.publisherId);
      ins.setAttribute('data-ad-slot', def.adUnitId);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      el.appendChild(ins);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn('[ads] push failed', e);
      }
    } else {
      // In-house placeholder — keeps the layout stable and looks intentional.
      el.classList.add('ad-placeholder');
      el.innerHTML = `<span class="ad-ph-label">${def?.label ?? 'Advertisement'}</span>`;
    }
  }

  /**
   * Re-request an ad for a slot that's shown repeatedly (the post-match slot,
   * shown once per match). For AdSense this is a fresh push; for placeholders
   * it's a no-op (already rendered).
   */
  refreshSlot(name: string) {
    if (!this.isConfigured) return;
    const el = document.querySelector<HTMLElement>(`[data-ad-slot="${name}"] ins.adsbygoogle`);
    if (!el) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[ads] refresh failed', e);
    }
  }
}

export const Ads = new AdManager();
