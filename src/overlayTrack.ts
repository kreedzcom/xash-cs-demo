import { BUTTON, type TrackSample } from "./demoTrack";
import { emptyGhost, type GhostBuffer } from "./ghostTrack";

/** Bytes per overlay segment. Matches Demo_SetOverlay. */
const OVERLAY_STRIDE = 32;
/** A single frame longer than this is a teleport, not a route. */
const MAX_STEP = 64;
/**
 * Keep a point about this far apart. Every net frame is a new line, and the
 * engine redraws the whole route each frame, which stalls a long replay.
 */
const MIN_SPAN = 32;
/** Standing hull center sits 36 units above the feet. */
const STAND_DROP = 36;
/** Ducked hull center sits 18 units above the feet. */
const DUCK_DROP = 18;
const GROUND_RGBA = [230, 230, 220, 200];
const AIR_RGBA = [57, 135, 229, 230];

/** Draw the whole route, and leave a short hole under the camera. */
export const OVERLAY_COMMAND =
  "demo_overlay_frames 0; demo_overlay_gap 12; demo_overlay_width 2";

export const emptyOverlay = emptyGhost;

const feet = (sample: TrackSample): [number, number, number] => {
  const drop = (sample.buttons & BUTTON.duck) !== 0 ? DUCK_DROP : STAND_DROP;
  return [sample.x, sample.y, sample.z - drop + 1];
};

/**
 * Pack the player's route for Demo_SetOverlay.
 * Each segment is the demo frame, two world points, and an RGBA color.
 * Ground segments are warm white; air segments are blue.
 */
export const packOverlay = (samples: TrackSample[]): GhostBuffer => {
  const segments: Array<{
    frame: number;
    a: [number, number, number];
    b: [number, number, number];
    rgba: number[];
  }> = [];
  let anchor = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const sample = samples[index];
    const from = feet(previous);
    const to = feet(sample);
    const step = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (step === 0) {
      continue;
    }
    if (step > MAX_STEP) {
      anchor = index;
      continue;
    }
    const start = feet(samples[anchor]);
    const span = Math.hypot(
      to[0] - start[0],
      to[1] - start[1],
      to[2] - start[2],
    );
    const colorChange = sample.onground !== samples[anchor].onground;
    const last = index === samples.length - 1;
    if (span < MIN_SPAN && !colorChange && !last) {
      continue;
    }
    segments.push({
      frame: sample.frame,
      a: start,
      b: to,
      rgba: sample.onground ? GROUND_RGBA : AIR_RGBA,
    });
    anchor = index;
  }
  if (segments.length === 0) {
    return emptyOverlay();
  }
  const bytes = new Uint8Array(segments.length * OVERLAY_STRIDE);
  const view = new DataView(bytes.buffer);
  segments.forEach((segment, index) => {
    const base = index * OVERLAY_STRIDE;
    view.setInt32(base, segment.frame, true);
    for (let axis = 0; axis < 3; axis += 1) {
      view.setFloat32(base + 4 + axis * 4, segment.a[axis], true);
      view.setFloat32(base + 16 + axis * 4, segment.b[axis], true);
    }
    bytes.set(segment.rgba, base + 28);
  });
  return { bytes, count: segments.length };
};
