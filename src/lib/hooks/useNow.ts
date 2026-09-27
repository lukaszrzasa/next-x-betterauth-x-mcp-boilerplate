"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time in whole seconds, ticking once a second and shared by
 * every subscriber, or `null` on the server and during hydration so
 * server-rendered and hydrated output never disagree about "now". Use it
 * for deadlines and cooldowns computed from server-provided instants.
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Math.floor(Date.now() / 1000);

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      current = Math.floor(Date.now() / 1000);
      for (const notify of listeners) notify();
    }, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Whole seconds from `now` until `instant`, never negative; `null` while `now` is unknown. */
export function secondsUntil(instant: string | Date, now: number | null): number | null {
  if (now === null) return null;
  const target = Math.floor(new Date(instant).getTime() / 1000);
  return Number.isFinite(target) ? Math.max(0, target - now) : null;
}
