import type { TrackSample } from "./demoTrack";
import type { PatchedXash } from "./patchedEngine";
import type { DemoPlayback } from "./playback";

export type EngineLease = {
  key: string;
  engine: PatchedXash;
  playback: DemoPlayback | null;
  hud?: TrackSample[];
};

export const LEASE_RELEASE_DELAY_MS = 300;

const leases = new Map<string, EngineLease>();
const boots = new Map<string, Promise<void>>();
const pendingReleases = new Map<string, ReturnType<typeof setTimeout>>();
const releaseListeners = new Set<(key: string) => void>();

export const getEngineLease = (key: string): EngineLease | undefined =>
  leases.get(key);

export const setEngineLease = (lease: EngineLease): void => {
  cancelScheduledLeaseRelease([lease.key]);
  leases.set(lease.key, lease);
};

export const getBootInFlight = (key: string): Promise<void> | undefined =>
  boots.get(key);

export const setBootInFlight = (
  key: string,
  promise: Promise<void> | null,
): void => {
  if (promise) {
    boots.set(key, promise);
    return;
  }
  boots.delete(key);
};

export const onLeaseReleased = (
  listener: (key: string) => void,
): (() => void) => {
  releaseListeners.add(listener);
  return () => releaseListeners.delete(listener);
};

export const cancelScheduledLeaseRelease = (keys: Iterable<string>): void => {
  for (const key of keys) {
    const timer = pendingReleases.get(key);
    if (timer == null) {
      continue;
    }
    clearTimeout(timer);
    pendingReleases.delete(key);
  }
};

/**
 * Stop engines shortly after the viewer unmounts.
 * A remount of the same key cancels this, so StrictMode can reuse the engine.
 */
export const scheduleLeaseRelease = (
  keys: Iterable<string>,
  delayMs = LEASE_RELEASE_DELAY_MS,
): void => {
  for (const key of keys) {
    cancelScheduledLeaseRelease([key]);
    const timer = setTimeout(() => {
      pendingReleases.delete(key);
      releaseEngineLease(key);
    }, delayMs);
    pendingReleases.set(key, timer);
  }
};

export const releaseEngineLease = (key?: string): void => {
  const keys = key != null ? [key] : [...leases.keys()];
  for (const leaseKey of keys) {
    cancelScheduledLeaseRelease([leaseKey]);
    const lease = leases.get(leaseKey);
    if (!lease) {
      continue;
    }
    leases.delete(leaseKey);
    boots.delete(leaseKey);
    try {
      lease.engine.quit();
    } catch {
      // Already exited.
    }
    for (const listener of releaseListeners) {
      listener(leaseKey);
    }
  }
};

export const releaseOtherLeases = (keep: Set<string>): void => {
  for (const key of [...leases.keys()]) {
    if (!keep.has(key)) {
      releaseEngineLease(key);
    }
  }
};

export const quitEngines = (
  engines: Array<{ quit: () => void } | null | undefined>,
): void => {
  for (const engine of engines) {
    if (!engine) {
      continue;
    }
    try {
      engine.quit();
    } catch {
      // Already exited.
    }
  }
};

let pageHideInstalled = false;

/**
 * Quit every engine when the page is discarded.
 * Call this from the host. Importing the package does not register it,
 * so a bundler can tree-shake unused viewers.
 */
export const installPageHideRelease = (): void => {
  if (pageHideInstalled || typeof window === "undefined") {
    return;
  }
  pageHideInstalled = true;
  window.addEventListener("pagehide", () => {
    cancelScheduledLeaseRelease(pendingReleases.keys());
    releaseEngineLease();
  });
};
