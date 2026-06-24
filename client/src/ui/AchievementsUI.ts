/**
 * AchievementsUI — renders the Awards settings tab: every medal with its icon,
 * name, description, reward, and a progress bar; earned ones highlighted, locked
 * ones dimmed. A header shows the earned/total count + completion percent.
 *
 * Re-renders on account.onChange (a stat record can unlock a medal mid-session).
 * Pure DOM, account-driven, mirroring ProfileUI / CosmeticsUI.
 */

import type { Account } from '../account/Account';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '../account/Achievements';

export class AchievementsUI {
  private account: Account;
  private header: HTMLElement | null;
  private grid: HTMLElement | null;

  constructor(account: Account) {
    this.account = account;
    this.header = document.getElementById('ach-summary');
    this.grid = document.getElementById('ach-grid');
    this.account.onChange(() => this.render());
    this.render();
  }

  render() {
    if (!this.grid) return;
    const earned = this.account.achievementCount;
    const pct = Math.round((earned / ACHIEVEMENT_COUNT) * 100);
    if (this.header) {
      this.header.innerHTML = `
        <span class="ach-sum-count">${earned} / ${ACHIEVEMENT_COUNT}</span>
        <span class="ach-sum-label">medals earned · ${pct}%</span>
        <div class="ach-sum-bar"><div class="ach-sum-fill" style="width:${pct}%"></div></div>`;
    }

    // Earned medals float to the top; within each group keep catalogue order.
    const sorted = [...ACHIEVEMENTS].sort((a, b) => {
      const ua = this.account.isAchievementUnlocked(a.id) ? 0 : 1;
      const ub = this.account.isAchievementUnlocked(b.id) ? 0 : 1;
      return ua - ub;
    });

    this.grid.innerHTML = sorted.map((def) => {
      const unlocked = this.account.isAchievementUnlocked(def.id);
      const cur = Math.min(def.metric(this.account), def.goal);
      const barPct = Math.round((cur / def.goal) * 100);
      return `
        <div class="ach-card ach-${def.tier} ${unlocked ? 'ach-earned' : 'ach-locked'}">
          <div class="ach-icon">${def.icon}</div>
          <div class="ach-info">
            <div class="ach-name">${def.name} ${unlocked ? '<span class="ach-check">✓</span>' : ''}</div>
            <div class="ach-desc">${def.desc}</div>
            ${unlocked
              ? `<div class="ach-reward-line">Earned · +${def.reward} XP</div>`
              : `<div class="ach-bar"><div class="ach-bar-fill" style="width:${barPct}%"></div></div>
                 <div class="ach-progress">${cur.toLocaleString()} / ${def.goal.toLocaleString()} · +${def.reward} XP</div>`}
          </div>
        </div>`;
    }).join('');
  }
}
