import { describe, expect, it } from "vitest";
import { DemoPlayback, waitUntilPlaying } from "./playback";

describe("DemoPlayback", () => {
  it("starts with demo_holdend and playdemo", () => {
    const commands: string[] = [];
    const playback = new DemoPlayback((command) => commands.push(command), 30);
    playback.start();
    expect(commands).toEqual([
      "demo_holdend 1; playdemo watch; sys_timescale 1.000",
    ]);
    expect(playback.paused).toBe(false);
  });

  it("pauses and resumes with demo_pause", () => {
    const commands: string[] = [];
    const playback = new DemoPlayback((command) => commands.push(command), 30);
    playback.start();
    playback.toggle();
    playback.toggle();
    expect(commands).toContain("demo_pause 1");
    expect(commands).toContain("demo_pause 0");
    expect(playback.paused).toBe(false);
  });

  it("seeks with demo_seek", () => {
    const commands: string[] = [];
    const playback = new DemoPlayback((command) => commands.push(command), 40);
    playback.start();
    playback.seek(10);
    expect(
      commands.some((command) => command.startsWith("demo_seek 10.000")),
    ).toBe(true);
    expect(playback.time).toBeCloseTo(10);
    expect(playback.seeking).toBe(false);
    expect(playback.paused).toBe(false);
  });

  it("stays paused when seeking from a paused demo", () => {
    const commands: string[] = [];
    const playback = new DemoPlayback((command) => commands.push(command), 40);
    playback.start();
    playback.toggle();
    playback.seek(10);
    expect(playback.paused).toBe(true);
    expect(commands.at(-2)).toBe("demo_seek 10.000; demo_pause 1");
  });

  it("steps forward then holds", () => {
    const commands: string[] = [];
    const playback = new DemoPlayback((command) => commands.push(command), 20);
    playback.start();
    playback.stepForward();
    playback.finishStep();
    expect(playback.paused).toBe(true);
    expect(playback.time).toBeCloseTo(0.05);
    expect(commands).toContain("demo_pause 1");
  });

  it("kicks playback once when the demo has not started", async () => {
    let playing = false;
    let kicks = 0;
    const result = await waitUntilPlaying(
      () => playing,
      () => {
        kicks += 1;
        playing = true;
      },
      () => true,
      { kickAfterMs: 0, timeoutMs: 500, intervalMs: 10 },
    );
    expect(result).toBe("kicked");
    expect(kicks).toBe(1);
  });
});
