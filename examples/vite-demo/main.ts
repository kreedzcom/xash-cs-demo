import {
  DemoPlayback,
  ENGINE_ARGS,
  GAME_ROOT,
  PLAYBACK_LAUNCH_ARGS,
  PatchedXash,
  installDemoFile,
  installPageHideRelease,
  installSharedFiles,
  loadDemoBootFiles,
  releaseCorePack,
  waitUntilPlaying,
} from "xash-cs-demo";

const status = document.querySelector("#status");
const canvas = document.querySelector("#view");

const setStatus = (message: string): void => {
  if (status) {
    status.textContent = message;
  }
};

const required = (name: string): string => {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[name];
  if (!value) {
    throw new Error(`Set ${name} to a URL you are allowed to serve.`);
  }
  return value;
};

const boot = async (): Promise<void> => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  installPageHideRelease();
  const mapName = required("VITE_MAP_NAME");
  const demoId = Number(required("VITE_DEMO_ID"));
  const files = await loadDemoBootFiles(
    mapName,
    [demoId],
    {
      replays: required("VITE_REPLAYS_URL"),
      maps: required("VITE_MAPS_URL"),
      mapBase: required("VITE_MAP_BASE_URL"),
      sharedBase: required("VITE_SHARED_BASE_URL"),
    },
    setStatus,
  );

  const engine = new PatchedXash({
    canvas,
    arguments: [...ENGINE_ARGS, ...PLAYBACK_LAUNCH_ARGS],
    blockMicrophone: true,
    suspendAudioWhileHidden: true,
  });
  await engine.init();
  const fs = engine.em?.FS;
  if (!fs) {
    throw new Error("The engine did not start its file system.");
  }
  await installSharedFiles(fs, files.shared, files.bspBytes, files.bspNames);
  releaseCorePack(files.shared);
  installDemoFile(fs, files.demos[0]);
  fs.chdir?.(GAME_ROOT);
  engine.main();

  const playback = new DemoPlayback(
    (command) => engine.Cmd_ExecuteString(command),
    files.tracks[0].duration,
  );
  const started = await waitUntilPlaying(
    () => engine.demoState()?.playing === true,
    () => playback.start(),
    () => !engine.exited,
  );
  setStatus(started === "stopped" ? "The replay did not start." : "");
};

void boot().catch((error: unknown) => {
  setStatus(
    error instanceof Error ? error.message : "The engine failed to start.",
  );
});
