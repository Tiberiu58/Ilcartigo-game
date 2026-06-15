/**
 * ProfileUI — renders the Profile tab in settings: display name, level + XP,
 * lifetime career stats, and today's daily challenges.
 *
 * Re-renders on account.onChange (XP gain, stat record, name change, claim).
 * Pure DOM, account-driven, mirroring CosmeticsUI.
 */

import type { Account } from '../account/Account';
import { MEDALS, medalsUnlocked } from '../account/Medals';
import { TIMEATTACK_MODE_ID } from '../modes/TimeAttack';

export class ProfileUI {
  private account: Account;
  private nameInput: HTMLInputElement;
  private nameSave: HTMLButtonElement;
  private levelEl: HTMLElement;
  private xpFill: HTMLElement;
  private xpText: HTMLElement;
  private statsGrid: HTMLElement;
  private challengesList: HTMLElement;
  private recordsGrid: HTMLElement;
  private medalsGrid: HTMLElement;
  private medalCount: HTMLElement;

  constructor(account: Account) {
    this.account = account;
    this.nameInput = document.getElementById('name-input') as HTMLInputElement;
    this.nameSave = document.getElementById('name-save') as HTMLButtonElement;
    this.levelEl = document.getElementById('prof-level')!;
    this.xpFill = document.getElementById('prof-xp-fill')!;
    this.xpText = document.getElementById('prof-xp-text')!;
    this.statsGrid = document.getElementById('stats-grid')!;
    this.challengesList = document.getElementById('challenges-list')!;
    this.recordsGrid = document.getElementById('records-grid')!;
    this.medalsGrid = document.getElementById('medals-grid')!;
    this.medalCount = document.getElementById('medal-count')!;

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
    this.renderRecords();
    this.renderMedals();
    this.renderChallenges();
  }

  /** Per-mode personal bests. Modes the player hasn't tried show "—". */
  private renderRecords() {
    if (!this.recordsGrid) return;
    const records: Array<[string, number]> = [
      ['Time Attack', this.account.bestScore(TIMEATTACK_MODE_ID)],
    ];
    this.recordsGrid.innerHTML = records.map(([label, val]) => `
      <div class="record-cell">
        <span class="record-val">${val > 0 ? val.toLocaleString() : '—'}</span>
        <span class="record-label">${label}</span>
      </div>`).join('');
  }

  /** Achievement medals — derived purely from stats + bests, with progress. */
  private renderMedals() {
    if (!this.medalsGrid) return;
    const a = this.account;
    const unlocked = medalsUnlocked(a);
    this.medalCount.textContent = `${unlocked}/${MEDALS.length}`;
    this.medalsGrid.innerHTML = MEDALS.map((m) => {
      const val = m.value(a);
      const done = val >= m.goal;
      const pct = Math.min(100, Math.round((val / m.goal) * 100));
      const cur = m.format ? m.format(Math.min(val, m.goal)) : Math.min(val, m.goal).toLocaleString();
      const goal = m.format ? m.format(m.goal) : m.goal.toLocaleString();
      return `
        <div class="medal-cell ${done ? 'unlocked' : 'locked'}">
          <span class="medal-icon">${done ? '★' : '☆'}</span>
          <span class="medal-name">${m.label}</span>
          <span class="medal-desc">${m.desc}</span>
          ${done
            ? '<span class="medal-status">Unlocked</span>'
            : `<div class="medal-prog">
                 <div class="medal-bar"><div class="medal-bar-fill" style="width:${pct}%"></div></div>
                 <span class="medal-progress">${cur} / ${goal}</span>
               </div>`}
        </div>`;
    }).join('');
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
