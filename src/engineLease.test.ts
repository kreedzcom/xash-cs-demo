import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduledLeaseRelease,
  getEngineLease,
  LEASE_RELEASE_DELAY_MS,
  onLeaseReleased,
  releaseEngineLease,
  scheduleLeaseRelease,
  setEngineLease,
  type EngineLease,
} from "./engineLease";

const leaseFor = (key: string): EngineLease =>
  ({
    key,
    engine: { quit: vi.fn(), exited: false },
    playback: null,
  }) as unknown as EngineLease;

describe("engine leases", () => {
  afterEach(() => {
    vi.useRealTimers();
    releaseEngineLease();
  });

  it("keeps an engine until the release delay elapses", () => {
    vi.useFakeTimers();
    const lease = leaseFor("map\u00001");
    setEngineLease(lease);
    scheduleLeaseRelease([lease.key]);
    expect(getEngineLease(lease.key)).toBe(lease);
    vi.advanceTimersByTime(LEASE_RELEASE_DELAY_MS - 1);
    expect(getEngineLease(lease.key)).toBe(lease);
    vi.advanceTimersByTime(1);
    expect(getEngineLease(lease.key)).toBeUndefined();
    expect(lease.engine.quit).toHaveBeenCalledOnce();
  });

  it("cancels a scheduled release when the same viewer mounts again", () => {
    vi.useFakeTimers();
    const lease = leaseFor("map\u00001");
    setEngineLease(lease);
    scheduleLeaseRelease([lease.key]);
    cancelScheduledLeaseRelease([lease.key]);
    vi.advanceTimersByTime(LEASE_RELEASE_DELAY_MS);
    expect(getEngineLease(lease.key)).toBe(lease);
    expect(lease.engine.quit).not.toHaveBeenCalled();
  });

  it("tells listeners when a lease is released", () => {
    const released: string[] = [];
    const stop = onLeaseReleased((key) => released.push(key));
    const lease = leaseFor("map\u00002");
    setEngineLease(lease);
    releaseEngineLease(lease.key);
    expect(released).toEqual([lease.key]);
    stop();
  });
});
