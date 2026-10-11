import { describe, expect, it } from "vitest";
import {
  airJump,
  BUTTON,
  timerStartTime,
  prepareDemoForEngine,
  readDemoTrack,
  sampleAt,
  sanitizeDemoCommands,
  type TrackSample,
} from "./demoTrack";

const writeAscii = (bytes: Uint8Array, offset: number, text: string): void => {
  const encoded = new TextEncoder().encode(text);
  bytes.set(encoded, offset);
};

const buildHeader = (mapName: string, directoryOffset: number): Uint8Array => {
  const bytes = new Uint8Array(544);
  writeAscii(bytes, 0, "HLDEMO");
  const view = new DataView(bytes.buffer);
  view.setInt32(8, 5, true);
  view.setInt32(12, 47, true);
  writeAscii(bytes, 16, mapName);
  view.setInt32(540, directoryOffset, true);
  return bytes;
};

describe("readDemoTrack", () => {
  it("reads the map name and playback duration", () => {
    const header = buildHeader("kz_demo", 544);
    const directory = new Uint8Array(4 + 92);
    const view = new DataView(directory.buffer);
    view.setInt32(0, 1, true);
    writeAscii(directory, 8, "Playback");
    view.setFloat32(4 + 76, 12.5, true);
    view.setInt32(4 + 80, 100, true);
    view.setInt32(4 + 84, 0, true);
    view.setInt32(4 + 88, 0, true);
    const bytes = new Uint8Array(header.length + directory.length);
    bytes.set(header, 0);
    bytes.set(directory, header.length);

    const track = readDemoTrack(bytes);
    expect(track?.mapName).toBe("kz_demo");
    expect(track?.duration).toBeCloseTo(12.5);
  });

  it("ignores files that are not GoldSrc demos", () => {
    expect(readDemoTrack(new Uint8Array(600))).toBeNull();
  });

  it("keeps only the Playback segment for the engine", () => {
    const playback = new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
    const loading = new Uint8Array(32).fill(7);
    const directoryOffset = 544 + loading.length + playback.length;
    const header = buildHeader("kz_demo", directoryOffset);
    const directory = new Uint8Array(4 + 92 * 2);
    const view = new DataView(directory.buffer);
    view.setInt32(0, 2, true);
    writeAscii(directory, 8, "LOADING");
    view.setInt32(4 + 84, 544, true);
    view.setInt32(4 + 88, loading.length, true);
    writeAscii(directory, 4 + 92 + 8, "Playback");
    view.setFloat32(4 + 92 + 76, 9.5, true);
    view.setInt32(4 + 92 + 80, 50, true);
    view.setInt32(4 + 92 + 84, 544 + loading.length, true);
    view.setInt32(4 + 92 + 88, playback.length, true);
    const bytes = new Uint8Array(
      header.length + loading.length + playback.length + directory.length,
    );
    bytes.set(header, 0);
    bytes.set(loading, 544);
    bytes.set(playback, 544 + loading.length);
    bytes.set(directory, directoryOffset);

    const prepared = prepareDemoForEngine(bytes);
    const track = readDemoTrack(prepared);
    expect(prepared.length).toBeLessThan(bytes.length);
    expect(track?.duration).toBeCloseTo(9.5);
    expect([...prepared.subarray(544, 544 + playback.length)]).toEqual([
      ...playback,
    ]);
  });

  it("reads speed, ground, and buttons from a net frame", () => {
    const frame = new Uint8Array(9 + 464 + 4);
    const view = new DataView(frame.buffer);
    frame[0] = 1;
    view.setFloat32(1, 3.5, true);
    view.setInt32(5, 42, true);
    view.setFloat32(9 + 92, 300, true);
    view.setFloat32(9 + 96, 400, true);
    view.setFloat32(9 + 104, 10, true);
    view.setFloat32(9 + 108, 20, true);
    view.setFloat32(9 + 112, 30, true);
    view.setInt32(9 + 84, 1, true);
    view.setFloat32(9 + 252, 250, true);
    view.setFloat32(9 + 256, -200, true);
    view.setUint16(9 + 266, BUTTON.jump | BUTTON.forward, true);
    view.setInt32(9 + 464, 0, true);

    const directoryOffset = 544 + frame.length;
    const header = buildHeader("kz_demo", directoryOffset);
    const directory = new Uint8Array(4 + 92);
    const directoryView = new DataView(directory.buffer);
    directoryView.setInt32(0, 1, true);
    writeAscii(directory, 8, "Playback");
    directoryView.setFloat32(4 + 76, 3.5, true);
    directoryView.setInt32(4 + 84, 544, true);
    directoryView.setInt32(4 + 88, frame.length, true);
    const bytes = new Uint8Array(directoryOffset + directory.length);
    bytes.set(header, 0);
    bytes.set(frame, 544);
    bytes.set(directory, directoryOffset);

    const track = readDemoTrack(bytes);
    const sample = track?.hud[0];
    expect(sample?.frame).toBe(42);
    expect(sample?.time).toBeCloseTo(3.5);
    expect(sample?.speed).toBeCloseTo(500);
    expect(sample?.onground).toBe(true);
    expect(sample?.forward).toBeCloseTo(250);
    expect(sample?.side).toBeCloseTo(-200);
    expect(sample?.buttons).toBe(BUTTON.jump | BUTTON.forward);
    expect(sampleAt(track?.hud ?? [], 4)?.speed).toBeCloseTo(500);
  });

  it("blanks a quit command in a type-3 console frame and keeps the next command", () => {
    const command = "quit; echo hi";
    const frame = new Uint8Array(9 + 64);
    frame[0] = 3;
    for (let index = 0; index < command.length; index += 1) {
      frame[9 + index] = command.charCodeAt(index);
    }
    const directoryOffset = 544 + frame.length;
    const header = buildHeader("kz_demo", directoryOffset);
    const directory = new Uint8Array(4 + 92);
    const directoryView = new DataView(directory.buffer);
    directoryView.setInt32(0, 1, true);
    writeAscii(directory, 8, "Playback");
    directoryView.setInt32(4 + 84, 544, true);
    directoryView.setInt32(4 + 88, frame.length, true);
    const bytes = new Uint8Array(directoryOffset + directory.length);
    bytes.set(header, 0);
    bytes.set(frame, 544);
    bytes.set(directory, directoryOffset);

    const cleaned = sanitizeDemoCommands(bytes);
    const field = new TextDecoder("latin1").decode(
      cleaned.subarray(544 + 9, 544 + 9 + command.length),
    );
    expect(field).toBe("    ; echo hi");
    expect(bytes[544 + 9]).toBe("q".charCodeAt(0));
    expect(readDemoTrack(cleaned)?.mapName).toBe("kz_demo");
  });
});

describe("timerStartTime", () => {
  const sample = (time: number, buttons: number): TrackSample => ({
    frame: time,
    time,
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    yaw: 0,
    speed: 0,
    onground: true,
    buttons,
    forward: 0,
    side: 0,
  });

  it("uses the first use press and ignores a later one", () => {
    expect(
      timerStartTime([
        sample(1, 0),
        sample(4.25, BUTTON.use),
        sample(4.3, BUTTON.use),
        sample(5, 0),
        sample(20, BUTTON.use),
      ]),
    ).toBeCloseTo(4.25);
  });

  it("stays at the file start when use is never pressed", () => {
    expect(timerStartTime([sample(1, BUTTON.jump)])).toBe(0);
    expect(timerStartTime([])).toBe(0);
  });
});

const frame = (
  time: number,
  speed: number,
  onground: boolean,
): TrackSample => ({
  frame: time,
  time,
  x: 0,
  y: 0,
  z: 0,
  pitch: 0,
  yaw: 0,
  speed,
  onground,
  buttons: 0,
  forward: 0,
  side: 0,
});

describe("airJump", () => {
  const jump = [
    frame(0, 250, true),
    frame(1, 251, false),
    frame(2, 270, false),
    frame(3, 240, true),
    frame(4, 242, false),
  ];

  it("uses the last grounded speed as takeoff and reports the gain", () => {
    expect(airJump(jump, 2)).toEqual({ takeoff: 250, gain: 20 });
    expect(airJump(jump, 1.2)).toEqual({ takeoff: 250, gain: 1 });
  });

  it("starts a new jump after landing", () => {
    expect(airJump(jump, 4)).toEqual({ takeoff: 240, gain: 2 });
  });

  it("is empty on the ground and before the first sample", () => {
    expect(airJump(jump, 0)).toBeNull();
    expect(airJump(jump, 3)).toBeNull();
    expect(airJump([], 1)).toBeNull();
  });

  it("uses the first air sample when the run starts in the air", () => {
    expect(airJump([frame(0, 200, false), frame(1, 220, false)], 1)).toEqual({
      takeoff: 200,
      gain: 20,
    });
  });
});
