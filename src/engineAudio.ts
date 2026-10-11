/**
 * Background tabs stop requestAnimationFrame, which is the engine's frame
 * loop, so the demo freezes. OpenAL keeps already-started looping sounds
 * on the audio clock. Suspend those contexts while the page is hidden.
 */

type AudioHandle = {
  state: AudioContextState;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  addEventListener?: (type: "statechange", listener: () => void) => void;
};

const contexts = new Set<AudioHandle>();
const held = new Set<AudioHandle>();

export const applyPageVisibilityToAudio = (
  open: Iterable<AudioHandle>,
  paused: Set<AudioHandle>,
  hidden: boolean,
): void => {
  for (const ctx of open) {
    if (ctx.state === "closed") {
      paused.delete(ctx);
      continue;
    }
    if (hidden) {
      if (ctx.state === "running") {
        paused.add(ctx);
        void ctx.suspend();
      }
      continue;
    }
    if (paused.delete(ctx) && ctx.state === "suspended") {
      void ctx.resume();
    }
  }
};

const remember = (ctx: AudioHandle): void => {
  contexts.add(ctx);
  ctx.addEventListener?.("statechange", () => {
    if (typeof document !== "undefined" && document.hidden) {
      applyPageVisibilityToAudio([ctx], held, true);
    }
  });
  if (typeof document !== "undefined" && document.hidden) {
    applyPageVisibilityToAudio([ctx], held, true);
  }
};

let installed = false;
let nativeAudioContext: typeof AudioContext | null = null;
let nativeWebkitAudioContext: typeof AudioContext | undefined;
let onVisibility: (() => void) | null = null;

export const holdEngineAudioWhileHidden = (): void => {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  const wrap = (native: typeof AudioContext): typeof AudioContext => {
    const Wrapped = function (
      this: AudioContext,
      ...args: ConstructorParameters<typeof AudioContext>
    ) {
      const ctx = new native(...args);
      remember(ctx);
      return ctx;
    } as unknown as typeof AudioContext;
    Wrapped.prototype = native.prototype;
    return Wrapped;
  };

  nativeAudioContext = window.AudioContext;
  window.AudioContext = wrap(nativeAudioContext);
  const webkit = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  nativeWebkitAudioContext = webkit.webkitAudioContext;
  if (nativeWebkitAudioContext) {
    webkit.webkitAudioContext = wrap(nativeWebkitAudioContext);
  }

  onVisibility = () => {
    applyPageVisibilityToAudio(contexts, held, document.hidden);
  };
  document.addEventListener("visibilitychange", onVisibility);
};

/** Stop wrapping `AudioContext`. Contexts already created stay tracked until closed. */
export const restoreEngineAudioHold = (): void => {
  if (!installed || typeof window === "undefined") {
    return;
  }
  if (nativeAudioContext) {
    window.AudioContext = nativeAudioContext;
  }
  const webkit = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  if (nativeWebkitAudioContext) {
    webkit.webkitAudioContext = nativeWebkitAudioContext;
  }
  if (onVisibility) {
    document.removeEventListener("visibilitychange", onVisibility);
  }
  nativeAudioContext = null;
  nativeWebkitAudioContext = undefined;
  onVisibility = null;
  contexts.clear();
  held.clear();
  installed = false;
};
