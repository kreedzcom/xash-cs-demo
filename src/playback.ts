export interface PlaybackSnapshot {
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  speed: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Controls for the GoldSrc-demo-capable Xash build:
 * `demo_holdend`, `playdemo`, `demo_pause`, `demo_seek`, `sys_timescale`.
 */
export class DemoPlayback {
  time = 0;
  paused = false;
  ended = false;
  seeking = false;
  speed = 1;

  constructor(
    private readonly exec: (command: string) => void,
    readonly duration: number,
    private readonly demoName = "watch",
  ) {}

  snapshot(): PlaybackSnapshot {
    return {
      time: this.time,
      duration: this.duration,
      paused: this.paused,
      ended: this.ended,
      seeking: this.seeking,
      speed: this.speed,
    };
  }

  start(): void {
    this.time = 0;
    this.paused = false;
    this.ended = false;
    this.seeking = false;
    this.exec(
      `demo_holdend 1; playdemo ${this.demoName}; sys_timescale ${this.speed.toFixed(3)}`,
    );
  }

  toggle(): void {
    if (this.ended) {
      this.seek(0);
      return;
    }
    if (this.paused) {
      this.resume();
      return;
    }
    this.hold();
  }

  setSpeed(speed: number): void {
    this.speed = clamp(speed, 0.25, 4);
    if (!this.paused && !this.ended) {
      this.exec(`sys_timescale ${this.speed.toFixed(3)}`);
    }
  }

  seek(time: number): void {
    const target = clamp(time, 0, Math.max(this.duration, 0));
    this.seeking = true;
    this.ended = false;
    this.time = target;
    this.exec(
      `demo_seek ${target.toFixed(3)}; demo_pause ${this.paused ? 1 : 0}`,
    );
    this.exec(`sys_timescale ${this.speed.toFixed(3)}`);
    this.seeking = false;
  }

  stepForward(): void {
    if (this.ended) {
      return;
    }
    const next = Math.min(this.duration || this.time + 0.05, this.time + 0.05);
    this.seek(next);
    this.hold();
  }

  finishStep(): void {
    this.hold();
  }

  stepBack(): void {
    this.seek(Math.max(0, this.time - 0.05));
    this.hold();
  }

  tick(realSeconds: number): void {
    if (this.paused || this.ended || realSeconds <= 0) {
      return;
    }
    this.time += realSeconds * this.speed;
    if (this.duration > 0 && this.time >= this.duration) {
      this.time = this.duration;
      this.ended = true;
      this.hold();
    }
  }

  private resume(): void {
    this.exec("demo_pause 0");
    this.exec(`sys_timescale ${this.speed.toFixed(3)}`);
    this.paused = false;
  }

  private hold(): void {
    this.exec("demo_pause 1");
    this.paused = true;
  }
}

export const FRAME_PAINT_MS = 33;
export const FRAME_STEP_DELAY_MS = 80;

export type PlaybackStart = "command" | "kicked" | "stopped";

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * Wait until the engine reports a playing demo. The loading cover stays up
 * for the whole wait. If the launch `+playdemo` was ignored, kick once.
 */
export const waitUntilPlaying = async (
  isPlaying: () => boolean,
  kick: () => void,
  shouldContinue: () => boolean,
  options?: { kickAfterMs?: number; timeoutMs?: number; intervalMs?: number },
): Promise<PlaybackStart> => {
  const kickAfterMs = options?.kickAfterMs ?? 4000;
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const intervalMs = options?.intervalMs ?? 100;
  const started = performance.now();
  let kicked = false;
  while (shouldContinue()) {
    if (isPlaying()) {
      return kicked ? "kicked" : "command";
    }
    const elapsed = performance.now() - started;
    if (elapsed >= timeoutMs) {
      return "stopped";
    }
    if (!kicked && elapsed >= kickAfterMs) {
      kicked = true;
      kick();
    }
    await sleep(intervalMs);
  }
  return "stopped";
};
