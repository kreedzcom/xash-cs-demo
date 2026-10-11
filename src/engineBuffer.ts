/** Smallest internal width that keeps the CS HUD at normal in-game proportions. */
export const ENGINE_BUFFER_MIN_WIDTH = 1280;

/**
 * cs16-client draws HUD sprites in framebuffer pixels. A canvas only as wide
 * as a side-by-side pane makes that same HUD fill the view. Render at least
 * a normal CS window and let the page scale the picture down.
 */
export const engineBufferSize = (
  displayWidth: number,
  displayHeight: number,
): { width: number; height: number } => {
  if (displayWidth < 64 || displayHeight < 64) {
    return { width: ENGINE_BUFFER_MIN_WIDTH, height: 720 };
  }
  const scale = Math.max(1, ENGINE_BUFFER_MIN_WIDTH / displayWidth);
  return {
    width: Math.round(displayWidth * scale),
    height: Math.round(displayHeight * scale),
  };
};
