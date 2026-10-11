import { describe, expect, it } from "vitest";
import { BUTTON, type TrackSample } from "./demoTrack";
import { packOverlay } from "./overlayTrack";

const point = (
  frame: number,
  x: number,
  z: number,
  onground: boolean,
  buttons = 0,
): TrackSample => ({
  frame,
  time: frame / 100,
  x,
  y: 0,
  z,
  pitch: 0,
  yaw: 0,
  speed: 0,
  onground,
  buttons,
  forward: 0,
  side: 0,
});

describe("packOverlay", () => {
  it("draws a ground segment at the player's feet", () => {
    const packed = packOverlay([
      point(10, 0, 36, true),
      point(11, 16, 36, true),
    ]);
    expect(packed.count).toBe(1);
    const view = new DataView(packed.bytes.buffer);
    expect(view.getInt32(0, true)).toBe(11);
    expect(view.getFloat32(4, true)).toBeCloseTo(0);
    expect(view.getFloat32(12, true)).toBeCloseTo(1);
    expect(view.getFloat32(16, true)).toBeCloseTo(16);
    expect(view.getFloat32(24, true)).toBeCloseTo(1);
    expect([...packed.bytes.subarray(28, 32)]).toEqual([230, 230, 220, 200]);
  });

  it("colors air segments blue and lowers a ducked line", () => {
    const packed = packOverlay([
      point(1, 0, 18, false, BUTTON.duck),
      point(2, 8, 18, false, BUTTON.duck),
    ]);
    const view = new DataView(packed.bytes.buffer);
    expect(view.getFloat32(12, true)).toBeCloseTo(1);
    expect([...packed.bytes.subarray(28, 32)]).toEqual([57, 135, 229, 230]);
  });

  it("joins a dense run into a few long segments", () => {
    const packed = packOverlay([
      point(1, 0, 36, true),
      point(2, 10, 36, true),
      point(3, 20, 36, true),
      point(4, 30, 36, true),
      point(5, 40, 36, true),
    ]);
    expect(packed.count).toBe(1);
    const view = new DataView(packed.bytes.buffer);
    expect(view.getFloat32(4, true)).toBeCloseTo(0);
    expect(view.getFloat32(16, true)).toBeCloseTo(40);
  });

  it("skips a teleport and an empty track", () => {
    expect(
      packOverlay([point(1, 0, 0, true), point(2, 200, 0, true)]).count,
    ).toBe(0);
    expect(packOverlay([]).count).toBe(0);
  });
});
