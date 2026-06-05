/**
 * events — typed pub/sub for gameplay events.
 *
 * One bus per Game instance. Subscribers receive a strongly-typed payload by
 * event name. Designed to be the *only* path between systems that don't
 * already own each other (e.g. Weapon → HUD, Bot → KillFeed) so Phase 7 can
 * replace direct dispatches with network round-trips in one place.
 */

import type * as THREE from 'three';

export interface DamageEvent {
  attackerId: string;
  targetId: string;
  amount: number;
  isHeadshot: boolean;
  hitPoint: THREE.Vector3;
  weaponId: string;
}

export interface KillEvent {
  attackerId: string;
  targetId: string;
  weaponId: string;
  isHeadshot: boolean;
  /** Hit point where the lethal shot landed — used for kill-effect VFX.
   *  Optional because some emitters may not have it (e.g. future suicide events). */
  hitPoint?: THREE.Vector3;
}

export interface ShotEvent {
  shooterId: string;
  weaponId: string;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  hit: { point: THREE.Vector3; targetId: string | null; isHeadshot: boolean } | null;
}

export type GameEvents = {
  damage: DamageEvent;
  kill: KillEvent;
  shot: ShotEvent;
  // Local-only feedback events (not networked):
  hitConfirm: { isHeadshot: boolean };
  screenShake: { intensity: number; duration: number };
};

type Handler<T> = (payload: T) => void;

export class EventBus<TMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TMap, Set<Handler<TMap[keyof TMap]>>>();

  on<K extends keyof TMap>(event: K, handler: Handler<TMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<TMap[keyof TMap]>);
    return () => set!.delete(handler as Handler<TMap[keyof TMap]>);
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<TMap[K]>)(payload);
  }
}

export type GameEventBus = EventBus<GameEvents>;
