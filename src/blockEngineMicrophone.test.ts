import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("blockEngineMicrophone", () => {
  it("rejects an audio capture without calling the browser", async () => {
    const native = vi.fn(() => Promise.resolve({} as MediaStream));
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: native },
    });
    const { blockEngineMicrophone: install } =
      await import("./blockEngineMicrophone");
    install();

    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(native).not.toHaveBeenCalled();

    const { restoreEngineMicrophone } = await import("./blockEngineMicrophone");
    restoreEngineMicrophone();
    await navigator.mediaDevices.getUserMedia({ audio: true });
    expect(native).toHaveBeenCalledOnce();
  });
});
