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
import { KILL_EFFECTS, TRACERS, skinsForClass, findKillEffect, findTracer, type SkinConfig, type KillEffectConfig, type TracerConfig } from '../account/Cosmetics';
import { CLASS_LIBRARY, CLASS_ORDER, type ClassId } from '../classes/types';

export class CosmeticsUI {
  private account: Account;
  private root: HTMLElement;
  private skinsEl: HTMLElement;
  private effectsEl: HTMLElement;
  private tracersEl: HTMLElement;
  private levelEl: HTMLElement;
  private xpEl: HTMLElement;
  private fillEl: HTMLElement;

  constructor(account: Account) {
    this.account = account;
    this.root = document.querySelector('[data-pane="cosmetics"]') as HTMLElement;
    this.skinsEl = document.getElementById('cos-skins')!;
    this.effectsEl = document.getElementById('cos-effects')!;
    this.tracersEl = document.getElementById('cos-tracers')!;
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
