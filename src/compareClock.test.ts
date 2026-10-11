import { describe, expect, it } from "vitest";
import { CompareClock } from "./compareClock";

describe("CompareClock", () => {
  it("slows a slightly faster engine instead of seeking", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [10.4, 10],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(commandsA).toEqual(["sys_timescale 0.600"]);
    expect(commandsB).toEqual([]);
    expect(clock.time).toBeCloseTo(10);
  });

  it("seeks an engine that is more than half a second ahead", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [10.8, 10],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(
      commandsA.some((command) => command.startsWith("demo_seek 10.000")),
    ).toBe(true);
    expect(commandsB).toEqual([]);
  });

  it("ignores an engine that has already ended", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [null, 12],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(commandsA).toEqual([]);
    expect(commandsB).toEqual([]);
  });

  it("leaves engines alone when they are close", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [4, 4.05],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(commandsA).toEqual([]);
    expect(commandsB).toEqual([]);
    expect(clock.time).toBeCloseTo(4);
  });

  it("seeks every engine that is ahead of the slowest", () => {
    const commands = [[], [], [], []] as string[][];
    const clock = new CompareClock(
      commands.map((log) => (command: string) => log.push(command)),
      30,
      () => [8, 8.4, 8.01, 9],
    );
    clock.start();
    commands.forEach((log) => {
      log.length = 0;
    });
    clock.tick(1.1);
    expect(commands[0]).toEqual([]);
    expect(commands[1]).toEqual(["sys_timescale 0.600"]);
    expect(commands[2]).toEqual([]);
    expect(
      commands[3].some((command) => command.startsWith("demo_seek 8.000")),
    ).toBe(true);
    expect(clock.time).toBeCloseTo(8);
  });

  it("starts each demo at its own start button", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [0, 0],
      [12.5, 3],
    );
    clock.start();
    expect(commandsA[0]).toContain("demo_seek 12.500");
    expect(commandsB[0]).toContain("demo_seek 3.000");
    clock.seek(5);
    expect(commandsA[1]).toContain("demo_seek 17.500");
    expect(commandsB[1]).toContain("demo_seek 8.000");
  });

  it("aligns engines by time since the start button", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      30,
      () => [12.4, 4],
      [10, 2],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(commandsA).toEqual(["sys_timescale 0.600"]);
    expect(commandsB).toEqual([]);
    expect(clock.time).toBeCloseTo(2);
  });

  it("pulls an engine that is still before its start button", () => {
    const commandsA: string[] = [];
    const commandsB: string[] = [];
    const clock = new CompareClock(
      [
        (command) => commandsA.push(command),
        (command) => commandsB.push(command),
      ],
      40,
      () => [1, 8.05],
      [15, 8],
    );
    clock.start();
    commandsA.length = 0;
    commandsB.length = 0;
    clock.tick(1.1);
    expect(
      commandsA.some((command) => command.startsWith("demo_seek 15.050")),
    ).toBe(true);
    expect(commandsB).toEqual([]);
    expect(clock.time).toBeCloseTo(0.05);
  });
});
