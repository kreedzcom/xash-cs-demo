/**
 * Loader for the GoldSrc-demo-capable Xash WASM build (protocol-5 HLDEMO).
 * Stock npm `xash3d-fwgs` only understands Xash DEMO_PROTOCOL 3 recordings.
 */

import { blockEngineMicrophone } from "./blockEngineMicrophone";
import { holdEngineAudioWhileHidden } from "./engineAudio";

export interface PatchedEngineFs {
  mkdir: (path: string) => void;
  mkdirTree?: (path: string) => void;
  writeFile: (
    path: string,
    data: Uint8Array | string,
    opts?: { canOwn?: boolean },
  ) => void;
  readFile?: (
    path: string,
    opts?: { encoding?: string },
  ) => Uint8Array | string;
  chdir?: (path: string) => void;
  analyzePath?: (path: string) => { exists: boolean };
}

export interface PatchedEngineModule {
  FS: PatchedEngineFs;
  Module: {
    ccall: (
      name: string,
      returnType: string | null,
      argTypes: string[],
      args: unknown[],
    ) => unknown;
    /**
     * When set, the engine sizes its buffer from this instead of the
     * canvas on screen, and skips the screen-scale multiplier.
     */
    renderSize?: { width: number; height: number };
  };
  start: () => void | Promise<unknown>;
  HEAPU8?: Uint8Array;
  HEAP8?: Int8Array;
  HEAP16?: Int16Array;
  HEAP32?: Int32Array;
  HEAPU32?: Uint32Array;
  setValue?: (ptr: number, value: number, type: string) => void;
  getValue?: (ptr: number, type: string) => number;
  writeArrayToMemory?: (array: number[], ptr: number) => void;
  intArrayFromString?: (text: string, dontAddNull?: boolean) => number[];
  writeSockaddr?: (
    sa: number,
    family: number,
    addr: string,
    port: number,
    addrlen: number,
  ) => number;
  readSockaddr?: (sa: number, salen: number) => { addr: string; port: number };
  _malloc?: (size: number) => number;
}

export interface PatchedEngineOptions {
  canvas: HTMLCanvasElement;
  arguments?: string[];
  dynamicLibraries?: string[];
  locateFile?: (path: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  /**
   * Reject microphone capture for this page. Demo playback never reads it.
   * Call `restoreEngineMicrophone` to put the browser API back.
   */
  blockMicrophone?: boolean;
  /**
   * Suspend engine audio contexts while the tab is hidden.
   * Call `restoreEngineAudioHold` to stop wrapping `AudioContext`.
   */
  suspendAudioWhileHidden?: boolean;
  /**
   * Directory URL of the six engine files (`xash.js`, `xash.wasm`, the two
   * library wasm files, and `cstrike/cl_dlls/*.wasm`). A trailing slash is
   * optional. When omitted, the files shipped in this package are used.
   */
  engineBaseUrl?: string;
}

export interface EngineFileUrls {
  xashJs: string;
  xash: string;
  filesystem: string;
  render: string;
  menu: string;
  client: string;
}

const directoryUrl = (base: string): string =>
  base.endsWith("/") ? base : `${base}/`;

/** Default engine files. Bundlers rewrite these `new URL` expressions. */
export const PATCHED_ENGINE_FILES: EngineFileUrls = {
  xashJs: new URL("../engine/xash.js", import.meta.url).href,
  xash: new URL("../engine/xash.wasm", import.meta.url).href,
  filesystem: new URL("../engine/filesystem_stdio.wasm", import.meta.url).href,
  render: new URL("../engine/libref_webgl2.wasm", import.meta.url).href,
  menu: new URL(
    "../engine/cstrike/cl_dlls/menu_emscripten_wasm32.wasm",
    import.meta.url,
  ).href,
  client: new URL(
    "../engine/cstrike/cl_dlls/client_emscripten_wasm32.wasm",
    import.meta.url,
  ).href,
};

/** Resolve engine file URLs, optionally from a self-hosted directory. */
export const resolveEngineFiles = (engineBaseUrl?: string): EngineFileUrls => {
  if (!engineBaseUrl) {
    return PATCHED_ENGINE_FILES;
  }
  const base = directoryUrl(engineBaseUrl);
  return {
    xashJs: new URL("xash.js", base).href,
    xash: new URL("xash.wasm", base).href,
    filesystem: new URL("filesystem_stdio.wasm", base).href,
    render: new URL("libref_webgl2.wasm", base).href,
    menu: new URL("cstrike/cl_dlls/menu_emscripten_wasm32.wasm", base).href,
    client: new URL("cstrike/cl_dlls/client_emscripten_wasm32.wasm", base).href,
  };
};

type XashFactory = (
  opts: Record<string, unknown>,
) => Promise<PatchedEngineModule>;

const factoryPromises = new Map<string, Promise<XashFactory>>();
const compiledMains = new Map<string, Promise<WebAssembly.Module>>();

/** Compile the engine once and instantiate that module for every canvas. */
export const compiledEngineModule = (
  wasmUrl: string = PATCHED_ENGINE_FILES.xash,
): Promise<WebAssembly.Module> => {
  const existing = compiledMains.get(wasmUrl);
  if (existing) {
    return existing;
  }
  const pending = WebAssembly.compileStreaming(fetch(wasmUrl));
  compiledMains.set(wasmUrl, pending);
  pending.catch(() => {
    if (compiledMains.get(wasmUrl) === pending) {
      compiledMains.delete(wasmUrl);
    }
  });
  return pending;
};

/**
 * Fetch the glue as a module blob so the large Emscripten build stays a
 * static asset. A direct `import()` of a `file:` or cross-origin URL is
 * blocked by the browser.
 */
const loadFactory = (jsUrl: string): Promise<XashFactory> => {
  const existing = factoryPromises.get(jsUrl);
  if (existing) {
    return existing;
  }
  const pending = (async () => {
    const response = await fetch(jsUrl);
    if (!response.ok) {
      throw new Error(
        `Could not download the game engine (${response.status}).`,
      );
    }
    const source = await response.text();
    const blob = new Blob([source], { type: "text/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const mod = (await import(/* @vite-ignore */ objectUrl)) as {
        default: XashFactory;
      };
      return mod.default;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  })();
  factoryPromises.set(jsUrl, pending);
  void pending.catch(() => {
    if (factoryPromises.get(jsUrl) === pending) {
      factoryPromises.delete(jsUrl);
    }
  });
  return pending;
};

export class PatchedXash {
  private _exited = false;
  private _running = false;
  private pointerWatch = false;
  em: PatchedEngineModule | null = null;
  private readonly opts: PatchedEngineOptions;

  private readonly releasePointer = (): void => {
    if (document.pointerLockElement === this.opts.canvas) {
      document.exitPointerLock();
    }
  };

  constructor(opts: PatchedEngineOptions) {
    this.opts = opts;
  }

  get exited(): boolean {
    return this._exited;
  }

  get running(): boolean {
    return this._running;
  }

  Cmd_ExecuteString(cmd: string): void {
    const module = this.em?.Module;
    if (!module) {
      return;
    }
    for (const part of cmd
      .split(";")
      .map((piece) => piece.trim())
      .filter(Boolean)) {
      module.ccall("Cmd_ExecuteString", null, ["string"], [part]);
    }
  }

  demoState(): {
    playing: boolean;
    frame: number;
    frames: number;
    time: number;
    length: number;
    paused: boolean;
    ended: boolean;
    seeking: boolean;
  } | null {
    const module = this.em?.Module;
    if (!module) {
      return null;
    }
    const read = (index: number): number =>
      Number(module.ccall("Demo_GetState", "number", ["number"], [index]));
    return {
      playing: !!read(0),
      frame: read(1),
      frames: read(2),
      time: read(3),
      length: read(4),
      paused: !!read(5),
      ended: !!read(6),
      seeking: !!read(7),
    };
  }

  setGhost(bytes: Uint8Array, count: number): void {
    const module = this.em?.Module;
    if (!module) {
      return;
    }
    module.ccall("Demo_SetGhost", null, ["array", "number"], [bytes, count]);
  }

  setOverlay(bytes: Uint8Array, count: number): void {
    const module = this.em?.Module;
    if (!module) {
      return;
    }
    module.ccall("Demo_SetOverlay", null, ["array", "number"], [bytes, count]);
  }

  async init(): Promise<void> {
    if (this.opts.blockMicrophone) {
      blockEngineMicrophone();
    }
    if (this.opts.suspendAudioWhileHidden) {
      holdEngineAudioWhileHidden();
    }
    if (this.em) {
      return;
    }
    const files = resolveEngineFiles(this.opts.engineBaseUrl);
    const factory = await loadFactory(files.xashJs);
    const filesMap: Record<string, string> = {
      "xash.wasm": files.xash,
      "filesystem_stdio.wasm": files.filesystem,
      "/rodir/filesystem_stdio.wasm": files.filesystem,
      "libref_webgl2.wasm": files.render,
      "cl_dlls/menu_emscripten_wasm32.wasm": files.menu,
      "cl_dlls/client_emscripten_wasm32.wasm": files.client,
    };
    const locateFile =
      this.opts.locateFile ?? ((path: string) => filesMap[path] ?? path);
    this.opts.canvas.style.setProperty("cursor", "default", "important");
    const compiled = await compiledEngineModule(files.xash);
    this.em = await new Promise<PatchedEngineModule>((resolve, reject) => {
      factory({
        canvas: this.opts.canvas,
        elementPointerLock: false,
        arguments: this.opts.arguments ?? [],
        dynamicLibraries: this.opts.dynamicLibraries ?? [
          "filesystem_stdio.wasm",
          "cl_dlls/menu_emscripten_wasm32.wasm",
          "cl_dlls/client_emscripten_wasm32.wasm",
          "/rodir/filesystem_stdio.wasm",
          "libref_webgl2.wasm",
        ],
        locateFile,
        instantiateWasm: (
          imports: WebAssembly.Imports,
          receive: (
            instance: WebAssembly.Instance,
            module: WebAssembly.Module,
          ) => void,
        ) => {
          WebAssembly.instantiate(compiled, imports)
            .then((instance) => receive(instance, compiled))
            .catch(reject);
          return {};
        },
        print: this.opts.print,
        printErr: this.opts.printErr,
      }).then(resolve, reject);
    });
    if (!this.pointerWatch) {
      document.addEventListener("pointerlockchange", this.releasePointer);
      this.pointerWatch = true;
    }
  }

  main(): void {
    if (!this.em || this._running || this._exited) {
      return;
    }
    this._running = true;
    void this.em.start();
  }

  /**
   * Ask the engine to render at this buffer size.
   * The canvas is scaled to the stage with CSS, so the on-screen box is not
   * the render size. Writing canvas.width directly crops the view.
   */
  resize(width: number, height: number, notify = true): void {
    const module = this.em?.Module;
    if (!module) {
      return;
    }
    module.renderSize = { width, height };
    if (notify) {
      window.dispatchEvent(new Event("resize"));
    }
  }

  quit(): void {
    if (this.pointerWatch) {
      document.removeEventListener("pointerlockchange", this.releasePointer);
      this.pointerWatch = false;
    }
    if (this._exited || !this._running) {
      return;
    }
    this._exited = true;
    this._running = false;
    try {
      this.Cmd_ExecuteString("quit");
    } catch {
      // Engine may already be tearing down.
    }
  }
}
