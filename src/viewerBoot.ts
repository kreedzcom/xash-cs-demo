export const isWebGlAvailable = (): boolean => {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

export const WEBGL_UNAVAILABLE =
  "WebGL is not available in this browser. Try a desktop browser with hardware acceleration enabled.";

/** Turn an engine boot failure into a sentence, or null when the boot was cancelled. */
export const describeBootError = (
  error: unknown,
  engineLog: string[],
  knownPrefixes: string[],
  fallback: string,
): string | null => {
  const detail = error instanceof Error ? error.message : "";
  if (!detail || detail === "cancelled") {
    return null;
  }
  if (knownPrefixes.some((prefix) => detail.startsWith(prefix))) {
    return detail;
  }
  const extra = engineLog.at(-1);
  if (extra) {
    return `${fallback} ${extra}`;
  }
  return detail || fallback;
};
