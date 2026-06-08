/**
 * Cosmetics registry — every skin and kill effect the game ships.
 *
 * Cost curve (per spec):
 *   Skin #0 free, skin #1 200, #2 500, #3 1000, #4 2000, #5 4000.
 *   Kill effect #0 free, #1 300, #2 800, #3 2500.
 *
 * Skins are color-only — they recolor the body + head boxes of the player
 * mesh. No new geometry, so authoring a skin is two hex colors and a name.
 *
 * Kill effects are a particle puff color + a brief screen tint. Game spawns
 * the puff at the hit point via CastFX and tints the screen briefly.
 */

import type { ClassId } from '../classes/types';

export type SkinId = string;          // e.g. 'phantom-violet', 'rush-ember'
export type KillEffectId = string;    // e.g. 'puff-yellow', 'shock-cyan'
export type TracerId = string;        // e.g. 'tracer-gold', 'tracer-cyan'

export interface SkinConfig {
  id: SkinId;
  classId: ClassId;
  displayName: string;
  bodyColor: number;
  headColor: number;
  cost: number;                       // 0 = free / default
}

export interface KillEffectConfig {
  id: KillEffectId;
  displayName: string;
  /** Particle burst color (additive sphere via CastFX.flash). */
  particleColor: number;
  /** Screen edge flash color for ~120ms after kill. */
  tintColor: number;
  cost: number;
}

export interface TracerConfig {
  id: TracerId;
  displayName: string;
  /** Colour of the local player's bullet tracer (hex). */
  color: number;
  cost: number;
}

const SKIN_COSTS = [0, 200, 500, 1000, 2000, 4000];

/**
 * Skin authoring helper — builds the 6 entries for one class. The default
 * (first) skin uses the class's existing on-mesh colors (matches Bot.ts and
 * RemotePlayer.ts) so equipping nothing → no visual change.
 */
function makeClassSkins(
  classId: ClassId,
  base: { displayName: string; bodyColor: number; headColor: number },
  variants: ReadonlyArray<{ displayName: string; bodyColor: number; headColor: number }>,
): SkinConfig[] {
  const out: SkinConfig[] = [{
    id: `${classId}-default`,
    classId,
    displayName: base.displayName,
    bodyColor: base.bodyColor,
    headColor: base.headColor,
    cost: SKIN_COSTS[0],
  }];
  for (let i = 0; i < variants.length; i++) {
    out.push({
      id: `${classId}-${variants[i].displayName.toLowerCase().replace(/\s+/g, '-')}`,
      classId,
      displayName: variants[i].displayName,
      bodyColor: variants[i].bodyColor,
      headColor: variants[i].headColor,
      cost: SKIN_COSTS[i + 1] ?? SKIN_COSTS[SKIN_COSTS.length - 1],
    });
  }
  return out;
}

/**
 * All skins. Six per class. Hex colors picked to feel like class identity —
 * Phantom skins all stay in purple/violet/magenta territory, Rush stays warm,
 * etc. The default of each class matches what the in-game Bot mesh uses.
 */
export const SKINS: ReadonlyArray<SkinConfig> = [
  ...makeClassSkins('phantom',
    { displayName: 'Phantom',        bodyColor: 0x9c64ff, headColor: 0x5a3a99 },
    [
      { displayName: 'Violet Veil',  bodyColor: 0x7b3aff, headColor: 0x4720a4 },
      { displayName: 'Midnight',     bodyColor: 0x3b1e6e, headColor: 0x1e0d3a },
      { displayName: 'Ash Phantom',  bodyColor: 0x6a6080, headColor: 0x3d3650 },
      { displayName: 'Plasma',       bodyColor: 0xd060ff, headColor: 0x8a30b8 },
      { displayName: 'Void Rift',    bodyColor: 0x2a0a5c, headColor: 0x110530 },
    ],
  ),
  ...makeClassSkins('rush',
    { displayName: 'Rush',           bodyColor: 0xff8a3a, headColor: 0xa64a14 },
    [
      { displayName: 'Ember',        bodyColor: 0xff5a14, headColor: 0xa0290a },
      { displayName: 'Sunburst',     bodyColor: 0xffd054, headColor: 0xb88018 },
      { displayName: 'Crimson Run',  bodyColor: 0xd4291a, headColor: 0x7a120a },
      { displayName: 'Copper Wire',  bodyColor: 0xc66c2a, headColor: 0x6d3414 },
      { displayName: 'Solar Flare',  bodyColor: 0xff3000, headColor: 0xb01800 },
    ],
  ),
  ...makeClassSkins('vanguard',
    { displayName: 'Vanguard',       bodyColor: 0x4ac8a8, headColor: 0x276854 },
    [
      { displayName: 'Mint Guard',   bodyColor: 0x6ddfb0, headColor: 0x2f7f64 },
      { displayName: 'Deep Sea',     bodyColor: 0x1f7d80, headColor: 0x0e3d40 },
      { displayName: 'Glacier',      bodyColor: 0xa0e8d8, headColor: 0x4a8478 },
      { displayName: 'Forest',       bodyColor: 0x2f6e3a, headColor: 0x143820 },
      { displayName: 'Emerald Edge', bodyColor: 0x00c884, headColor: 0x006840 },
    ],
  ),
  ...makeClassSkins('ghost',
    { displayName: 'Ghost',          bodyColor: 0xa0a8b8, headColor: 0x555c6b },
    [
      { displayName: 'Pale',         bodyColor: 0xd0d4dc, headColor: 0x7a8090 },
      { displayName: 'Smoke',        bodyColor: 0x686d75, headColor: 0x363a40 },
      { displayName: 'Frostbite',    bodyColor: 0xb8d0e0, headColor: 0x5a7080 },
      { displayName: 'Obsidian',     bodyColor: 0x202428, headColor: 0x0a0c10 },
      { displayName: 'Spectre',      bodyColor: 0xe8e8f0, headColor: 0x8888a0 },
    ],
  ),
  ...makeClassSkins('engineer',
    { displayName: 'Engineer',       bodyColor: 0xf5d442, headColor: 0xa68820 },
    [
      { displayName: 'Hardhat',      bodyColor: 0xffaa14, headColor: 0xa05a00 },
      { displayName: 'Industrial',   bodyColor: 0x808a30, headColor: 0x40481a },
      { displayName: 'Hi-Vis',       bodyColor: 0xeeff00, headColor: 0x9a9c00 },
      { displayName: 'Brass',        bodyColor: 0xc8a850, headColor: 0x705c1c },
      { displayName: 'Welder',       bodyColor: 0xff7028, headColor: 0x963810 },
    ],
  ),
  ...makeClassSkins('hunter',
    { displayName: 'Hunter',         bodyColor: 0xff5a7e, headColor: 0xa0204a },
    [
      { displayName: 'Crimson',      bodyColor: 0xd80040, headColor: 0x70001c },
      { displayName: 'Rose Quartz',  bodyColor: 0xffaac0, headColor: 0xb05080 },
      { displayName: 'Wraith',       bodyColor: 0x5a2030, headColor: 0x2a0a18 },
      { displayName: 'Magenta',      bodyColor: 0xff20c8, headColor: 0xa00080 },
      { displayName: 'Blood Moon',   bodyColor: 0x8a0020, headColor: 0x400010 },
    ],
  ),
];

/**
 * Four kill effects. The default is a yellow puff (same warm color as the
 * weapon tracer). Unlockables: cyan shock, magenta burst, white nova.
 */
export const KILL_EFFECTS: ReadonlyArray<KillEffectConfig> = [
  { id: 'puff-yellow',   displayName: 'Default Puff',  particleColor: 0xfff0a0, tintColor: 0x000000, cost: 0    },
  { id: 'shock-cyan',    displayName: 'Cyan Shock',    particleColor: 0x6cc6ff, tintColor: 0x102030, cost: 300  },
  { id: 'burst-magenta', displayName: 'Magenta Burst', particleColor: 0xff5a7e, tintColor: 0x301020, cost: 800  },
  { id: 'nova-white',    displayName: 'Pure Nova',     particleColor: 0xffffff, tintColor: 0x404050, cost: 2500 },
];

/**
 * Bullet tracer colours for the LOCAL player. Purely cosmetic — the default
 * matches the existing warm-gold tracer so equipping nothing changes nothing.
 * A cheap, satisfying unlock track players see on every single shot.
 */
export const TRACERS: ReadonlyArray<TracerConfig> = [
  { id: 'tracer-gold',    displayName: 'Gold',         color: 0xfff0a0, cost: 0    },
  { id: 'tracer-cyan',    displayName: 'Cyan Bolt',    color: 0x6cc6ff, cost: 250  },
  { id: 'tracer-lime',    displayName: 'Toxic Lime',   color: 0xaaff3a, cost: 400  },
  { id: 'tracer-magenta', displayName: 'Hot Magenta',  color: 0xff4ad6, cost: 700  },
  { id: 'tracer-crimson', displayName: 'Crimson',      color: 0xff3b3b, cost: 1200 },
  { id: 'tracer-white',   displayName: 'Phase White',  color: 0xffffff, cost: 2000 },
];

export const DEFAULT_TRACER: TracerId = 'tracer-gold';

export type FinishId = string;        // e.g. 'finish-gold'

export interface FinishConfig {
  id: FinishId;
  displayName: string;
  /** Emissive tint applied to every viewmodel part (hex). 0 = no glow. */
  emissive: number;
  /** Swatch colour for the cosmetics grid. */
  swatch: number;
  cost: number;
}

/**
 * Weapon finishes — an emissive sheen over the first-person viewmodel. The
 * classic arena-shooter unlock you see every second you hold a gun. Default is
 * no glow (matches the base mesh), so equipping nothing changes nothing.
 */
export const FINISHES: ReadonlyArray<FinishConfig> = [
  { id: 'finish-standard', displayName: 'Standard',   emissive: 0x000000, swatch: 0x3a4250, cost: 0    },
  { id: 'finish-gold',     displayName: 'Gilded',     emissive: 0x4a3500, swatch: 0xffcc33, cost: 350  },
  { id: 'finish-frost',    displayName: 'Frostforge', emissive: 0x0a3344, swatch: 0x4cd0ff, cost: 600  },
  { id: 'finish-toxic',    displayName: 'Toxic',      emissive: 0x143a08, swatch: 0x9cff3a, cost: 1000 },
  { id: 'finish-crimson',  displayName: 'Crimson',    emissive: 0x3a0808, swatch: 0xff4040, cost: 1500 },
  { id: 'finish-void',     displayName: 'Voidlight',  emissive: 0x2a0a40, swatch: 0xb060ff, cost: 2500 },
];

export const DEFAULT_FINISH: FinishId = 'finish-standard';

/** Lookup helpers. */
export function findFinish(id: FinishId): FinishConfig | undefined {
  return FINISHES.find((f) => f.id === id);
}
export function findSkin(id: SkinId): SkinConfig | undefined {
  return SKINS.find((s) => s.id === id);
}
export function findTracer(id: TracerId): TracerConfig | undefined {
  return TRACERS.find((t) => t.id === id);
}
export function findKillEffect(id: KillEffectId): KillEffectConfig | undefined {
  return KILL_EFFECTS.find((e) => e.id === id);
}
export function defaultSkinForClass(classId: ClassId): SkinId {
  return `${classId}-default`;
}
export const DEFAULT_KILL_EFFECT: KillEffectId = 'puff-yellow';

export function skinsForClass(classId: ClassId): SkinConfig[] {
  return SKINS.filter((s) => s.classId === classId);
}
