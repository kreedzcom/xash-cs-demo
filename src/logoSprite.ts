/**
 * cs16-client draws `sprites/%d_logo.spr` whenever a demo sets the logo flag
 * (a spray / tag). The `%d` is literal: the client never substitutes it.
 * That file is missing, so the draw keeps the HUD sheet and asks for frames
 * 2 and 3, which `640hud7.spr` does not have. A blank multi-frame sprite
 * gives the animation nothing visible to draw.
 */
const LOGO_FRAMES = 32;

export const LOGO_SPRITE_NAME = "%d_logo.spr";

export const blankLogoSprite = (): Uint8Array => {
  const frameBytes = 4 + 8 + 8 + 1;
  const bytes = new Uint8Array(40 + 2 + 768 + LOGO_FRAMES * frameBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x44);
  view.setUint8(2, 0x53);
  view.setUint8(3, 0x50);
  view.setInt32(4, 2, true);
  view.setInt32(8, 2, true);
  view.setInt32(12, 1, true);
  view.setFloat32(16, 1, true);
  view.setInt32(20, 1, true);
  view.setInt32(24, 1, true);
  view.setInt32(28, LOGO_FRAMES, true);
  view.setInt32(36, 0, true);
  view.setUint16(40, 256, true);

  let offset = 42 + 768;
  for (let frame = 0; frame < LOGO_FRAMES; frame += 1) {
    view.setInt32(offset, 0, true);
    view.setInt32(offset + 12, 1, true);
    view.setInt32(offset + 16, 1, true);
    offset += frameBytes;
  }
  return bytes;
};
