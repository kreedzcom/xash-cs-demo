export interface CompareClockSnapshot {
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  speed: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

type Exec = (command: string) => void;

const DRIFT_SECONDS = 0.12;
const HARD_SEEK_SECONDS = 0.5;

/**
 * Shared clock for two to four demo engines, counted from each demo's
 * start button. Engine file time is that origin plus this clock.
 * About once a second a small lead is corrected with sys_timescale.
 * A lead above half a second, or an engine still waiting before its
 * start button, is pulled into place with demo_seek.
 * Callers should omit engines that have already ended.
 */
export class CompareClock {
  time = 0;
  paused = false;
  ended = false;
  speed = 1;
  private started = false;
  private sinceAlign = 0;
  private nudged = new Set<number>();

  constructor(
    private readonly execs: Exec[],
    readonly duration: number,
    private readonly readTimes?: () => Array<number | null>,
    private readonly origins: readonly number[] = [],
  ) {}

  private originAt(index: number): number {
    const value = this.origins[index] ?? 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  snapshot(): CompareClockSnapshot {
    return {
      time: this.time,
      duration: this.duration,
      paused: this.paused,
      ended: this.ended,
      speed: this.speed,
    };
  }

  start(): void {
    this.time = 0;
    this.paused = false;
    this.ended = false;
    this.started = true;
    this.sinceAlign = 0;
    this.nudged.clear();
    const speed = this.speed.toFixed(3);
    this.execs.forEach((exec, index) => {
      const at = this.originAt(index).toFixed(3);
      exec(
        `demo_holdend 1; playdemo watch; demo_seek ${at}; sys_timescale ${speed}; demo_pause 0`,
      );
    });
  }

  /**
   * Take the slowest engine that has already reached its start button.
   * Engines still in the pre-start wait do not pull the shared clock back.
   */
  followEngines(): void {
    this.paused = false;
    this.ended = false;
    this.started = true;
    this.sinceAlign = 0;
    this.nudged.clear();
    if (!this.readTimes) {
      this.time = 0;
      return;
    }
    const runs = this.readTimes()
      .map((time, index) =>
        time == null || !Number.isFinite(time)
          ? null
          : time - this.originAt(index),
      )
      .filter((time): time is number => time != null && time >= -DRIFT_SECONDS);
    this.time =
      runs.length > 0
        ? clamp(Math.min(...runs), 0, Math.max(this.duration, 0))
        : 0;
  }

  toggle(): void {
    if (this.ended) {
      this.seek(0);
      this.resume();
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
      this.execAll(`sys_timescale ${this.speed.toFixed(3)}`);
    }
  }

  seek(time: number): void {
    const target = clamp(time, 0, Math.max(this.duration, 0));
    this.time = target;
    this.ended = false;
    this.nudged.clear();
    const pause = this.paused ? 1 : 0;
    const speed = this.speed.toFixed(3);
    this.execs.forEach((exec, index) => {
      const at = (this.originAt(index) + target).toFixed(3);
      exec(`demo_seek ${at}; demo_pause ${pause}; sys_timescale ${speed}`);
    });
  }

  stepForward(): void {
    if (this.ended) {
      return;
    }
    this.seek(Math.min(this.duration, this.time + 0.05));
    this.hold();
  }

  stepBack(): void {
    this.seek(Math.max(0, this.time - 0.05));
    this.hold();
  }

  /** Second pause, after the engine has drawn the seeked frame. */
  finishStep(): void {
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
      return;
    }
    if (!this.started) {
      return;
    }
    this.sinceAlign += realSeconds;
    if (this.sinceAlign < 1) {
      return;
    }
    this.sinceAlign = 0;
    this.alignEngines();
  }

  private alignEngines(): void {
    if (!this.readTimes) {
      return;
    }
    const times = this.readTimes();
    const runTimes = times.map((time, index) =>
      time == null || !Number.isFinite(time)
        ? null
        : time - this.originAt(index),
    );
    const eligible = runTimes.filter(
      (time): time is number => time != null && time >= -DRIFT_SECONDS,
    );
    const pending = runTimes.some(
      (time) => time != null && time < -DRIFT_SECONDS,
    );
    if (eligible.length < 2 && !pending) {
      return;
    }
    const slower = eligible.length > 0 ? Math.min(...eligible) : this.time;
    const nominal = this.speed.toFixed(3);
    times.forEach((_, index) => {
      const run = runTimes[index];
      if (run == null) {
        return;
      }
      const drift = run - slower;
      const beforeStart = run < -DRIFT_SECONDS;
      if (beforeStart || drift > HARD_SEEK_SECONDS) {
        this.nudged.delete(index);
        const at = (this.originAt(index) + slower).toFixed(3);
        this.execs[index]?.(
          `demo_seek ${at}; demo_pause 0; sys_timescale ${nominal}`,
        );
        return;
      }
      if (eligible.length < 2) {
        return;
      }
      if (Math.abs(drift) <= DRIFT_SECONDS) {
        if (this.nudged.delete(index)) {
          this.execs[index]?.(`sys_timescale ${nominal}`);
        }
        return;
      }
      const nudged = clamp(this.speed * (1 - drift), 0.25, 4);
      this.nudged.add(index);
      this.execs[index]?.(`sys_timescale ${nudged.toFixed(3)}`);
    });
    if (eligible.length > 0) {
      this.time = clamp(slower, 0, Math.max(this.duration, 0));
    }
  }

  private resume(): void {
    this.paused = false;
    this.execAll(`demo_pause 0; sys_timescale ${this.speed.toFixed(3)}`);
  }

  private hold(): void {
    this.paused = true;
    this.execAll("demo_pause 1");
  }

  private execAll(command: string): void {
    for (const exec of this.execs) {
      exec(command);
    }
  }
}
