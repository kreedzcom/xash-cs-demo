import type { TrackSample } from "./demoTrack";

/** Bytes per ghost sample — matches the patched engine Demo_SetGhost layout. */
const GHOST_STRIDE = 32;
const FLAG_ONGROUND = 2;

export interface GhostBuffer {
  bytes: Uint8Array;
  count: number;
}

export const emptyGhost = (): GhostBuffer => ({
  bytes: new Uint8Array(0),
  count: 0,
});

/**
 * Pack path samples for Demo_SetGhost.
 * Layout per point: time, x, y, z, pitch, yaw, flags, pathDistance (32 bytes).
 */
export const packGhostTrack = (
  samples: TrackSample[],
  timeOffset = 0,
): GhostBuffer => {
  if (samples.length === 0) {
    return emptyGhost();
  }
  const bytes = new Uint8Array(samples.length * GHOST_STRIDE);
  const view = new DataView(bytes.buffer);
  let distance = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (index > 0) {
      const previous = samples[index - 1];
      const step = Math.hypot(
        sample.x - previous.x,
        sample.y - previous.y,
        sample.z - previous.z,
      );
      if (step < 64) {
        distance += step;
      }
    }
    const base = index * GHOST_STRIDE;
    view.setFloat32(base, sample.time + timeOffset, true);
    view.setFloat32(base + 4, sample.x, true);
    view.setFloat32(base + 8, sample.y, true);
    view.setFloat32(base + 12, sample.z, true);
    view.setFloat32(base + 16, sample.pitch, true);
    view.setFloat32(base + 20, sample.yaw, true);
    view.setInt32(base + 24, sample.onground ? FLAG_ONGROUND : 0, true);
    view.setFloat32(base + 28, distance, true);
  }
  return { bytes, count: samples.length };
};
