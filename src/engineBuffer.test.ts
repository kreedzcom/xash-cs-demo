import { describe, expect, it } from "vitest";
import { engineBufferSize } from "./engineBuffer";

describe("engineBufferSize", () => {
  it("keeps a large stage at its own size", () => {
    expect(engineBufferSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("scales a side-by-side pane up to a normal CS window", () => {
    expect(engineBufferSize(500, 281)).toEqual({ width: 1280, height: 719 });
  });

  it("uses 1280x720 before the stage has a size", () => {
    expect(engineBufferSize(0, 0)).toEqual({ width: 1280, height: 720 });
  });
});
