import { describe, expect, it, vi } from "vitest";
import { applyPageVisibilityToAudio } from "./engineAudio";

const context = (state: AudioContextState) => ({
  state,
  suspend: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
});

describe("applyPageVisibilityToAudio", () => {
  it("suspends running audio while the page is hidden", () => {
    const running = context("running");
    const held = new Set<ReturnType<typeof context>>();
    applyPageVisibilityToAudio([running], held, true);
    expect(running.suspend).toHaveBeenCalledOnce();
    expect(held.has(running)).toBe(true);
  });

  it("resumes only the contexts this page hid", () => {
    const running = context("suspended");
    const other = context("suspended");
    const held = new Set([running]);
    applyPageVisibilityToAudio([running, other], held, false);
    expect(running.resume).toHaveBeenCalledOnce();
    expect(other.resume).not.toHaveBeenCalled();
  });
});
