/**
 * ProfileUI — renders the Profile tab in settings: display name, level + XP,
 * lifetime career stats, and today's daily challenges.
 *
 * Re-renders on account.onChange (XP gain, stat record, name change, claim).
 * Pure DOM, account-driven, mirroring CosmeticsUI.
 */

import type { Account } from '../account/Account';
import { DRILLS, type DrillId } from '../modes/AimLab';
import { ACHIEVEMENTS, TIER_LABELS, TOTAL_ACHIEVEMENT_TIERS } from '../account/Achievements';

export class ProfileUI {
  private account: Account;
  private nameInput: HTMLInputElement;
  private nameSave: HTMLButtonElement;
  private levelEl: HTMLElement;
  private xpFill: HTMLElement;
  private xpText: HTMLElement;
  private statsGrid: HTMLElement;
  private aimlabBests: HTMLElement | null;
  private challengesList: HTMLElement;
  private achGrid: HTMLElement | null;
  private achCount: HTMLElement | null;

  constructor(account: Account) {
    this.account = account;
    this.nameInput = document.getElementById('name-input') as HTMLInputElement;
    this.nameSave = document.getElementById('name-save') as HTMLButtonElement;
    this.levelEl = document.getElementById('prof-level')!;
    this.xpFill = document.getElementById('prof-xp-fill')!;
    this.xpText = document.getElementById('prof-xp-text')!;
    this.statsGrid = document.getElementById('stats-grid')!;
    this.aimlabBests = document.getElementById('aimlab-bests');
    this.challengesList = document.getElementById('challenges-list')!;
    this.achGrid = document.getElementById('ach-grid');
    this.achCount = document.getElementById('ach-count');

    // Name save.
    this.nameInput.value = account.hasName ? account.name : '';
    const saveName = () => {
      this.account.setName(this.nameInput.value);
      this.nameSave.textContent = 'Saved ✓';
      window.setTimeout(() => { this.nameSave.textContent = 'Save'; }, 1200);
    };
    this.nameSave.addEventListener('click', saveName);
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveName(); }
    });

    // Claim buttons (delegated).
    this.challengesList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim]');
      if (!btn) return;
      const id = btn.dataset.claim!;
      if (this.account.claimChallenge(id)) {
        // account.onChange will re-render.
      }
    });

    this.account.onChange(() => this.render());
    this.render();
  }

  render() {
    if (!this.statsGrid) return;
    this.renderSummary();
    this.renderStats();
    this.renderAimlabBests();
    this.renderChallenges();
    this.renderAchievements();
  }

  private renderAchievements() {
    if (!this.achGrid) return;
    if (this.achCount) {
      this.achCount.textContent = `${this.account.achievementsUnlocked} / ${TOTAL_ACHIEVEMENT_TIERS}`;
    }
    this.achGrid.innerHTML = ACHIEVEMENTS.map((ach) => {
      const granted = this.account.achievementTier(ach.id);
      const maxed = granted >= ach.tiers.length;
      const value = ach.metric(this.account);
      const tierLabel = granted > 0 ? (TIER_LABELS[granted - 1] ?? String(granted)) : '';
      // Progress toward the next tier (from the previous tier's goal as the floor).
      let pct = 100, foot = '';
      if (!maxed) {
        const next = ach.tiers[granted];
        const floor = granted > 0 ? ach.tiers[granted - 1].goal : 0;
        pct = Math.max(0, Math.min(100, ((value - floor) / (next.goal - floor)) * 100));
        foot = `${value.toLocaleString()} / ${next.goal.toLocaleString()} ${ach.unit} · +${next.reward} XP`;
      } else {
        foot = `★ all ${ach.tiers.length} tiers · maxed`;
      }
      return `
        <div class="ach-card ${maxed ? 'ach-maxed' : ''} ${granted > 0 ? 'ach-earned' : ''}" style="--ach-color:${ach.color}">
          <span class="ach-card-glyph">${ach.glyph}</span>
          <div class="ach-card-info">
            <span class="ach-card-name">${ach.name}${tierLabel ? ` <em>${tierLabel}</em>` : ''}</span>
            <div class="ach-card-bar"><div class="ach-card-fill" style="width:${pct}%"></div></div>
            <span class="ach-card-foot">${foot}</span>
          </div>
        </div>`;
    }).join('');
  }

  private renderAimlabBests() {
    if (!this.aimlabBests) return;
    const cells = (Object.keys(DRILLS) as DrillId[]).map((id) => {
      const n = Number(localStorage.getItem(DRILLS[id].pbKey));
      const best = Number.isFinite(n) && n > 0 ? n : 0;
      return `
        <div class="stat-cell">
          <span class="stat-val">${best}</span>
          <span class="stat-label">${DRILLS[id].name}</span>
        </div>`;
    });
    // Onslaught (survival) best wave shares this "Bests" grid.
    const onsBest = Number(localStorage.getItem('ilc.onslaught.best')) || 0;
    cells.push(`
        <div class="stat-cell">
          <span class="stat-val">${onsBest}</span>
          <span class="stat-label">Onslaught Wave</span>
        </div>`);
    // Duel (1v1 gauntlet) best win streak shares this "Bests" grid too.
    const duelBest = Number(localStorage.getItem('ilc.duel.best')) || 0;
    cells.push(`
        <div class="stat-cell">
          <span class="stat-val">${duelBest}</span>
          <span class="stat-label">Duel Streak</span>
        </div>`);
    this.aimlabBests.innerHTML = cells.join('');
  }

  private renderSummary() {
    this.levelEl.textContent = String(this.account.level);
    const pct = (this.account.xpIntoLevel / this.account.xpPerLevel) * 100;
    this.xpFill.style.width = `${pct}%`;
    this.xpText.textContent = `${this.account.xp.toLocaleString()} XP · ${this.account.xpIntoLevel}/${this.account.xpPerLevel} to next`;
  }

  private renderStats() {
    const s = this.account.stats;
    const cells: Array<[string, string]> = [
      ['Kills', s.kills.toLocaleString()],
      ['Deaths', s.deaths.toLocaleString()],
      ['K/D', this.account.lifetimeKD],
      ['Headshots', s.headshots.toLocaleString()],
      ['Matches', s.matches.toLocaleString()],
      ['Wins', s.wins.toLocaleString()],
      ['Best Streak', s.bestStreak.toLocaleString()],
      ['Playtime', formatPlaytime(s.playSeconds)],
    ];
    this.statsGrid.innerHTML = cells.map(([label, val]) => `
      <div class="stat-cell">
        <span class="stat-val">${val}</span>
        <span class="stat-label">${label}</span>
      </div>`).join('');
  }

  private renderChallenges() {
    const list = this.account.dailyChallenges;
    this.challengesList.innerHTML = list.map((c) => {
      const pct = Math.round((c.progress / c.goal) * 100);
      const state = c.claimed ? 'claimed' : c.complete ? 'ready' : 'active';
      const action = c.claimed
        ? `<span class="chal-done">Claimed ✓</span>`
        : c.complete
          ? `<button class="chal-claim" data-claim="${c.id}">Claim +${c.reward}</button>`
          : `<span class="chal-reward">+${c.reward} XP</span>`;
      return `
        <div class="chal-row chal-${state}">
          <div class="chal-info">
            <span class="chal-label">${c.label}</span>
            <div class="chal-bar"><div class="chal-bar-fill" style="width:${pct}%"></div></div>
            <span class="chal-progress">${c.progress} / ${c.goal}</span>
          </div>
          ${action}
        </div>`;
    }).join('');
  }
}

/** Format seconds as a compact human string (e.g. "3h 12m", "45m", "30s"). */
function formatPlaytime(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
