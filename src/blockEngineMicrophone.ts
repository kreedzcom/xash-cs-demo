/**
 * The Emscripten build opens an OpenAL/SDL capture device at startup, which
 * calls getUserMedia and asks for a microphone. Demo playback never reads
 * that stream. Reject the request before the browser shows a prompt.
 */

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (error: DOMException) => void,
) => void;

const denied = (): DOMException =>
  new DOMException(
    "The demo viewer does not use a microphone.",
    "NotAllowedError",
  );

const wantsMicrophone = (constraints?: MediaStreamConstraints): boolean =>
  Boolean(constraints?.audio);

let installed = false;
let undo: (() => void) | null = null;

export const blockEngineMicrophone = (): void => {
  if (installed || typeof navigator === "undefined") {
    return;
  }
  installed = true;

  const devices = navigator.mediaDevices;
  const nativeGetUserMedia = devices?.getUserMedia?.bind(devices);
  if (devices && nativeGetUserMedia) {
    devices.getUserMedia = (constraints) => {
      if (wantsMicrophone(constraints)) {
        return Promise.reject(denied());
      }
      return nativeGetUserMedia(constraints);
    };
  }

  const legacy = navigator as Navigator & {
    getUserMedia?: LegacyGetUserMedia;
    webkitGetUserMedia?: LegacyGetUserMedia;
  };
  const previousGetUserMedia = legacy.getUserMedia;
  const previousWebkit = legacy.webkitGetUserMedia;
  const blockLegacy =
    (original?: LegacyGetUserMedia): LegacyGetUserMedia =>
    (constraints, success, error) => {
      if (wantsMicrophone(constraints)) {
        error(denied());
        return;
      }
      original?.(constraints, success, error);
    };
  if (previousGetUserMedia) {
    legacy.getUserMedia = blockLegacy(previousGetUserMedia);
  }
  if (previousWebkit) {
    legacy.webkitGetUserMedia = blockLegacy(previousWebkit);
  }

  undo = () => {
    if (devices && nativeGetUserMedia) {
      devices.getUserMedia = nativeGetUserMedia;
    }
    if (previousGetUserMedia) {
      legacy.getUserMedia = previousGetUserMedia;
    }
    if (previousWebkit) {
      legacy.webkitGetUserMedia = previousWebkit;
    }
    installed = false;
    undo = null;
  };
};

/** Put `getUserMedia` back. Safe to call when the block was never installed. */
export const restoreEngineMicrophone = (): void => {
  undo?.();
};
