import { describe, expect, it } from "vitest";
import { blankLogoSprite } from "./logoSprite";

describe("blankLogoSprite", () => {
  it("is a GoldSrc sprite with a frame for every logo animation index", () => {
    const bytes = blankLogoSprite();
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe(
      "IDSP",
    );
    expect(new DataView(bytes.buffer).getInt32(28, true)).toBe(32);
  });
});
