/**
 * CosmeticsUI — renders the Cosmetics tab in the settings page.
 *
 * Responsibilities:
 *   - Render XP + level summary at the top.
 *   - Render skin cards grouped by class (6 classes × 6 skins).
 *   - Render kill effect cards.
 *   - Click handlers: unlock (if affordable) or equip.
 *   - Re-render on Account changes (account.onChange).
 *
 * Outside the constructor we do nothing — Account is the source of truth.
 */

import type { Account } from '../account/Account';
import {
  KILL_EFFECTS, TRACERS, FINISHES, HITMARKERS, skinsForClass, findKillEffect, findTracer, findFinish, findHitmarker,
  WEAPON_SKIN_ORDER, weaponSkinsFor,
  type SkinConfig, type KillEffectConfig, type TracerConfig, type FinishConfig, type WeaponSkinConfig,
  type HitmarkerConfig,
} from '../account/Cosmetics';
import { CLASS_LIBRARY, CLASS_ORDER, type ClassId } from '../classes/types';

export class CosmeticsUI {
  private account: Account;
  private root: HTMLElement;
  private skinsEl: HTMLElement;
  private effectsEl: HTMLElement;
  private tracersEl: HTMLElement;
  private finishesEl: HTMLElement;
  private hitmarkersEl: HTMLElement;
  private weaponTabsEl: HTMLElement;
  private weaponSkinsEl: HTMLElement;
  private levelEl: HTMLElement;
  private xpEl: HTMLElement;
  private fillEl: HTMLElement;
  /** Which weapon's skins the Weapon Skins grid is currently showing. */
  private selectedWeapon: string = 'ar';

  constructor(account: Account) {
    this.account = account;
    this.root = document.querySelector('[data-pane="cosmetics"]') as HTMLElement;
    this.skinsEl = document.getElementById('cos-skins')!;
    this.effectsEl = document.getElementById('cos-effects')!;
    this.tracersEl = document.getElementById('cos-tracers')!;
    this.finishesEl = document.getElementById('cos-finishes')!;
    this.hitmarkersEl = document.getElementById('cos-hitmarkers')!;
    this.weaponTabsEl = document.getElementById('cos-weapon-tabs')!;
    this.weaponSkinsEl = document.getElementById('cos-weapon-skins')!;
    this.levelEl = document.getElementById('cos-level')!;
    this.xpEl = document.getElementById('cos-xp')!;
    this.fillEl = document.getElementById('cos-xp-fill')!;
    this.account.onChange(() => this.render());
    this.render();
  }

  render() {
    if (!this.root) return;
    this.renderSummary();
    this.renderSkins();
    this.renderEffects();
    this.renderTracers();
    this.renderFinishes();
    this.renderHitmarkers();
    this.renderWeaponSkins();
  }

  private renderSummary() {
    this.levelEl.textContent = String(this.account.level);
    this.xpEl.textContent = String(this.account.xp);
    const pct = (this.account.xpIntoLevel / this.account.xpPerLevel) * 100;
    this.fillEl.style.width = `${pct}%`;
  }

  private renderSkins() {
    // Group by class. Each class gets a header + a grid of 6 cards.
    const html: string[] = [];
    for (const classId of CLASS_ORDER) {
      const cls = CLASS_LIBRARY[classId];
      html.push(`<div class="cos-class-header" style="color: #${cls.color.toString(16).padStart(6,'0')}">${cls.displayName}</div>`);
      html.push('<div class="cos-grid">');
      for (const skin of skinsForClass(classId)) {
        html.push(this.skinCardHtml(skin, classId));
      }
      html.push('</div>');
    }
    this.skinsEl.innerHTML = html.join('');
    // Wire click handlers.
    this.skinsEl.querySelectorAll<HTMLElement>('[data-skin-id]').forEach((el) => {
      const id = el.dataset.skinId!;
      el.addEventListener('click', () => this.handleSkinClick(id));
    });
  }

  private renderEffects() {
    this.effectsEl.innerHTML = KILL_EFFECTS.map((e) => this.effectCardHtml(e)).join('');
    this.effectsEl.querySelectorAll<HTMLElement>('[data-effect-id]').forEach((el) => {
      const id = el.dataset.effectId!;
      el.addEventListener('click', () => this.handleEffectClick(id));
    });
  }

  private renderTracers() {
    if (!this.tracersEl) return;
    this.tracersEl.innerHTML = TRACERS.map((t) => this.tracerCardHtml(t)).join('');
    this.tracersEl.querySelectorAll<HTMLElement>('[data-tracer-id]').forEach((el) => {
      const id = el.dataset.tracerId!;
      el.addEventListener('click', () => this.handleTracerClick(id));
    });
  }

  private skinCardHtml(skin: SkinConfig, classId: ClassId): string {
    const unlocked = this.account.isSkinUnlocked(skin.id);
    const equipped = this.account.equippedSkinFor(classId) === skin.id;
    const status = !unlocked
      ? `${skin.cost} XP`
      : equipped ? 'EQUIPPED' : 'EQUIP';
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    const bodyHex = '#' + skin.bodyColor.toString(16).padStart(6, '0');
    const headHex = '#' + skin.headColor.toString(16).padStart(6, '0');
    return `<div class="${cls}" data-skin-id="${skin.id}" style="--body-c: ${bodyHex}; --head-c: ${headHex}">
      <div class="cos-swatch"><div class="head"></div><div class="body"></div></div>
      <div class="cos-name">${escape(skin.displayName)}</div>
      <div class="cos-status">${status}</div>
    </div>`;
  }

  private effectCardHtml(e: KillEffectConfig): string {
    const unlocked = this.account.isEffectUnlocked(e.id);
    const equipped = this.account.equippedKillEffect() === e.id;
    const status = !unlocked
      ? `${e.cost} XP`
      : equipped ? 'EQUIPPED' : 'EQUIP';
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    const swatchHex = '#' + e.particleColor.toString(16).padStart(6, '0');
    return `<div class="${cls}" data-effect-id="${e.id}" style="--body-c: ${swatchHex}; --head-c: ${swatchHex}">
      <div class="cos-swatch"><div class="head"></div><div class="body"></div></div>
      <div class="cos-name">${escape(e.displayName)}</div>
      <div class="cos-status">${status}</div>
    </div>`;
  }

  private renderWeaponSkins() {
    if (!this.weaponTabsEl || !this.weaponSkinsEl) return;
    // Weapon picker tabs — each shows the weapon name + its mastery count.
    this.weaponTabsEl.innerHTML = WEAPON_SKIN_ORDER.map((id) => {
      const sel = id === this.selectedWeapon ? ' selected' : '';
      const kills = this.account.weaponKillsFor(id);
      return `<button class="cos-weapon-tab${sel}" data-weapon-tab="${id}">
        <span class="cwt-name">${id.toUpperCase()}</span>
        <span class="cwt-kills">${kills} kills</span>
      </button>`;
    }).join('');
    this.weaponTabsEl.querySelectorAll<HTMLElement>('[data-weapon-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedWeapon = el.dataset.weaponTab!;
        this.renderWeaponSkins();
      });
    });
    // Skin grid for the selected weapon.
    this.weaponSkinsEl.innerHTML = weaponSkinsFor(this.selectedWeapon)
      .map((s) => this.weaponSkinCardHtml(s)).join('');
    this.weaponSkinsEl.querySelectorAll<HTMLElement>('[data-wskin-id]').forEach((el) => {
      const id = el.dataset.wskinId!;
      el.addEventListener('click', () => this.handleWeaponSkinClick(id));
    });
  }

  private weaponSkinCardHtml(s: WeaponSkinConfig): string {
    const unlocked = this.account.isWeaponSkinUnlocked(s);
    const equipped = this.account.equippedWeaponSkinId(s.weaponId) === s.id;
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    // Default skin = stock look → neutral gunmetal swatch.
    const hex = '#' + (s.color ?? 0x3a4250).toString(16).padStart(6, '0');
    let status: string;
    let bar = '';
    if (equipped) status = 'EQUIPPED';
    else if (unlocked) status = 'EQUIP';
    else {
      const have = this.account.weaponKillsFor(s.weaponId);
      status = `${have}/${s.killReq} kills`;
      const pct = Math.max(0, Math.min(100, (have / s.killReq) * 100));
      bar = `<div class="cos-mastery"><div class="cos-mastery-fill" style="width:${pct.toFixed(0)}%"></div></div>`;
    }
    return `<div class="${cls}" data-wskin-id="${s.id}" style="--body-c: ${hex}; --head-c: ${hex}">
      <div class="cos-swatch cos-swatch-tracer"><div class="bolt"></div></div>
      <div class="cos-name">${escape(s.displayName)}</div>
      <div class="cos-status">${status}</div>
      ${bar}
    </div>`;
  }

  private handleWeaponSkinClick(id: string) {
    // Only equip when unlocked (mastery-gated — no purchase path).
    this.account.equipWeaponSkin(id);
  }

  private renderFinishes() {
    if (!this.finishesEl) return;
    this.finishesEl.innerHTML = FINISHES.map((f) => this.finishCardHtml(f)).join('');
    this.finishesEl.querySelectorAll<HTMLElement>('[data-finish-id]').forEach((el) => {
      const id = el.dataset.finishId!;
      el.addEventListener('click', () => this.handleFinishClick(id));
    });
  }

  private finishCardHtml(f: FinishConfig): string {
    const unlocked = this.account.isFinishUnlocked(f.id);
    const equipped = this.account.equippedFinish() === f.id;
    const status = !unlocked ? `${f.cost} XP` : equipped ? 'EQUIPPED' : 'EQUIP';
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    const hex = '#' + f.swatch.toString(16).padStart(6, '0');
    return `<div class="${cls}" data-finish-id="${f.id}" style="--body-c: ${hex}; --head-c: ${hex}">
      <div class="cos-swatch"><div class="head"></div><div class="body"></div></div>
      <div class="cos-name">${escape(f.displayName)}</div>
      <div class="cos-status">${status}</div>
    </div>`;
  }

  private handleFinishClick(id: string) {
    if (!this.account.isFinishUnlocked(id)) {
      const cfg = findFinish(id);
      if (!cfg) return;
      if (!this.account.tryUnlockFinish(id, cfg.cost)) return;
    }
    this.account.equipFinish(id);
  }

  private tracerCardHtml(t: TracerConfig): string {
    const unlocked = this.account.isTracerUnlocked(t.id);
    const equipped = this.account.equippedTracer() === t.id;
    const status = !unlocked ? `${t.cost} XP` : equipped ? 'EQUIPPED' : 'EQUIP';
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    const hex = '#' + t.color.toString(16).padStart(6, '0');
    // Reuse the swatch markup but render a tracer "bolt" via the body bar.
    return `<div class="${cls}" data-tracer-id="${t.id}" style="--body-c: ${hex}; --head-c: ${hex}">
      <div class="cos-swatch cos-swatch-tracer"><div class="bolt"></div></div>
      <div class="cos-name">${escape(t.displayName)}</div>
      <div class="cos-status">${status}</div>
    </div>`;
  }

  private handleTracerClick(id: string) {
    if (!this.account.isTracerUnlocked(id)) {
      const cfg = findTracer(id);
      if (!cfg) return;
      if (!this.account.tryUnlockTracer(id, cfg.cost)) return;
    }
    this.account.equipTracer(id);
  }

  private renderHitmarkers() {
    if (!this.hitmarkersEl) return;
    this.hitmarkersEl.innerHTML = HITMARKERS.map((h) => this.hitmarkerCardHtml(h)).join('');
    this.hitmarkersEl.querySelectorAll<HTMLElement>('[data-hitmarker-id]').forEach((el) => {
      const id = el.dataset.hitmarkerId!;
      el.addEventListener('click', () => this.handleHitmarkerClick(id));
    });
  }

  private hitmarkerCardHtml(h: HitmarkerConfig): string {
    const unlocked = this.account.isHitmarkerUnlocked(h.id);
    const equipped = this.account.equippedHitmarker() === h.id;
    const status = !unlocked ? `${h.cost} XP` : equipped ? 'EQUIPPED' : 'EQUIP';
    const cls = equipped ? 'cos-card equipped' : !unlocked ? 'cos-card locked' : 'cos-card';
    const hex = '#' + h.color.toString(16).padStart(6, '0');
    // Render a mini hit-marker X in the swatch via the four corner bars.
    return `<div class="${cls}" data-hitmarker-id="${h.id}" style="--hm-c: ${hex}">
      <div class="cos-swatch cos-swatch-hm"><span></span><span></span><span></span><span></span></div>
      <div class="cos-name">${escape(h.displayName)}</div>
      <div class="cos-status">${status}</div>
    </div>`;
  }

  private handleHitmarkerClick(id: string) {
    if (!this.account.isHitmarkerUnlocked(id)) {
      const cfg = findHitmarker(id);
      if (!cfg) return;
      if (!this.account.tryUnlockHitmarker(id, cfg.cost)) return;
    }
    this.account.equipHitmarker(id);
  }

  private handleSkinClick(id: string) {
    if (!this.account.isSkinUnlocked(id)) {
      // Try to unlock — Account checks affordability.
      if (!this.account.tryUnlockSkin(id)) return;     // not enough XP, ignore silently
    }
    this.account.equipSkin(id);
  }

  private handleEffectClick(id: string) {
    if (!this.account.isEffectUnlocked(id)) {
      const cfg = findKillEffect(id);
      if (!cfg) return;
      if (!this.account.tryUnlockEffect(id, cfg.cost)) return;
    }
    this.account.equipKillEffect(id);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
