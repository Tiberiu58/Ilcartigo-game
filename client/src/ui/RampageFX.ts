/**
 * RampageFX — the persistent "ON FIRE" rampage state.
 *
 * Krunker/Quake reward a hot streak with something you can *feel* the whole time
 * it's alive — not just a one-shot banner. This drives a sustained heat aura at
 * the screen edges + a streak badge near the crosshair while the local player is
 * on a killstreak, escalating through tiers, and snapping off the instant they
 * die. It reads the streak from `Announcer.onStreakChange` (single source of
 * truth — no separate kill/death bookkeeping).
 *
 * Pure HUD/CSS, no protocol, no per-frame cost (edge-toggled on streak change).
 */

interface RampageTier {
  /** Minimum streak to enter this tier. */
  min: number;
  label: string;
  /** Body class applied to drive the aura colour/intensity. */
  cls: string;
  /** Badge accent colour. */
  color: string;
}

// Tiers chosen to slot *between* the Announcer's milestone banners (3/5/7/10/
// 15/20) so the aura ramps continuously rather than echoing the banner names.
const TIERS: RampageTier[] = [
  { min: 15, label: 'BLAZING',  cls: 'rampage-t3', color: '#c84aff' },
  { min: 10, label: 'INFERNO',  cls: 'rampage-t2', color: '#ff4a6e' },
  { min: 5,  label: 'ON FIRE',  cls: 'rampage-t1', color: '#ff8a3a' },
];

const ALL_CLASSES = TIERS.map((t) => t.cls);

export class RampageFX {
  private badge: HTMLElement;
  private badgeLabel: HTMLElement;
  private badgeCount: HTMLElement;
  private current = -1;       // current tier index, -1 = inactive

  // The #rampage-aura element is styled entirely via <body> tier classes, so we
  // only need a JS handle to the badge.
  constructor() {
    this.badge = document.getElementById('rampage-badge')!;
    this.badgeLabel = this.badge.querySelector('.rb-label') as HTMLElement;
    this.badgeCount = this.badge.querySelector('.rb-count') as HTMLElement;
  }

  /** Update the aura to reflect a new streak. Called from Announcer.onStreakChange. */
  setStreak(streak: number) {
    const tierIdx = TIERS.findIndex((t) => streak >= t.min);   // highest tier first
    if (tierIdx === this.current && tierIdx !== -1) {
      // Same tier — just refresh the live count.
      this.badgeCount.textContent = `×${streak}`;
      return;
    }
    this.current = tierIdx;

    if (tierIdx === -1) {
      // Streak dropped below the threshold (or died) — clear everything.
      document.body.classList.remove(...ALL_CLASSES, 'rampage-on');
      this.badge.classList.add('hidden');
      return;
    }

    const tier = TIERS[tierIdx];
    document.body.classList.remove(...ALL_CLASSES);
    document.body.classList.add('rampage-on', tier.cls);
    this.badge.classList.remove('hidden');
    this.badgeLabel.textContent = tier.label;
    this.badgeLabel.style.color = tier.color;
    this.badgeCount.textContent = `×${streak}`;
    // Re-pop the badge on each tier change for a little punch.
    this.badge.classList.remove('rb-pop');
    void this.badge.offsetWidth;
    this.badge.classList.add('rb-pop');
  }
}
