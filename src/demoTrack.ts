export interface TrackSample {
  /** Demo frame index from the frame header. The in-world path uses it. */
  frame: number;
  time: number;
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  /** Horizontal speed from simvel, units per second. */
  speed: number;
  /** Ref-params ground entity is set. -1 and 0 mean in the air. */
  onground: boolean;
  buttons: number;
  forward: number;
  side: number;
}

export interface DemoTrack {
  mapName: string;
  duration: number;
  /** Thinned path used by the ghost. */
  samples: TrackSample[];
  /** Every net frame, for the key and speed overlay. */
  hud: TrackSample[];
}

/** Same masks as the analyzer's GoldSrcButtons, plus the two attack bits. */
export const BUTTON = {
  attack: 1,
  jump: 1 << 1,
  duck: 1 << 2,
  forward: 1 << 3,
  back: 1 << 4,
  use: 1 << 5,
  moveLeft: 1 << 9,
  moveRight: 1 << 10,
  attack2: 1 << 11,
} as const;

const HEADER_SIZE = 544;
const ENTRY_SIZE = 92;
const FRAME_HEADER_SIZE = 9;
/** Reject demos larger than this before walking frames. */
export const MAX_DEMO_BYTES = 128 * 1024 * 1024;
/** Stop collecting samples past this many frames. */
export const MAX_TRACK_SAMPLES = 250_000;
const NET_MESSAGE_PREFIX = 464;
const SIMORG_OFFSET = 104;
/** simvel sits in the 12 bytes immediately before simorg. */
const SIMVEL_OFFSET = 92;
/** Fourth ref-params int: ground entity, or -1 in the air. */
const ONGROUND_OFFSET = 84;
/** viewangles in ref_params, after the 4-byte demoinfo timestamp and vieworg. */
const VIEWANGLES_OFFSET = 16;
/** usercmd follows ref_params. Offsets match DirectoryEntryFrames.readNetworkMessageFrame. */
const FORWARD_OFFSET = 252;
const SIDE_OFFSET = 256;
const BUTTONS_OFFSET = 266;

const FRAME_SYNC = 2;
/**
 * Type 3 is a 64-byte console command. The GoldSrc analyzer names this slot
 * sequence info; the bytes are the command string.
 */
const FRAME_CONSOLE = 3;
const CONSOLE_FIELD_SIZE = 64;
const FRAME_CLIENT = 4;
const FRAME_NEXT = 5;
const FRAME_EVENT = 6;
const FRAME_WEAPON = 7;
const FRAME_SOUND = 8;
const FRAME_BUFFER = 9;

const latin1 = new TextDecoder("latin1");

const BLOCKED_DEMO_COMMANDS = new Set([
  "stop",
  "disconnect",
  "reconnect",
  "retry",
  "connect",
  "quit",
  "exit",
  "playdemo",
  "timedemo",
  "record",
]);

const readAscii = (
  bytes: Uint8Array,
  offset: number,
  length: number,
): string => {
  let end = offset;
  const limit = Math.min(bytes.length, offset + length);
  while (end < limit && bytes[end] !== 0) {
    end += 1;
  }
  return latin1.decode(bytes.subarray(offset, end)).trim();
};

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

interface DirectoryEntry {
  title: string;
  time: number;
  frames: number;
  offset: number;
  length: number;
}

const readDirectory = (bytes: Uint8Array): DirectoryEntry[] => {
  const view = viewOf(bytes);
  if (bytes.length < HEADER_SIZE + 4) {
    return [];
  }
  const directoryOffset = view.getInt32(540, true);
  if (directoryOffset < HEADER_SIZE || directoryOffset + 4 > bytes.length) {
    return [];
  }
  const count = view.getInt32(directoryOffset, true);
  if (count < 1 || count > 32) {
    return [];
  }
  const entries: DirectoryEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = directoryOffset + 4 + index * ENTRY_SIZE;
    if (start + ENTRY_SIZE > bytes.length) {
      break;
    }
    entries.push({
      title: readAscii(bytes, start + 4, 64),
      time: view.getFloat32(start + 76, true),
      frames: view.getInt32(start + 80, true),
      offset: view.getInt32(start + 84, true),
      length: view.getInt32(start + 88, true),
    });
  }
  return entries;
};

const playbackEntry = (entries: DirectoryEntry[]): DirectoryEntry | null => {
  const named = entries.find((entry) => {
    const title = entry.title.toLowerCase();
    return title.includes("playback") || title.includes("normal");
  });
  if (named) {
    return named;
  }
  return entries.reduce<DirectoryEntry | null>((best, entry) => {
    if (!best || entry.time > best.time) {
      return entry;
    }
    return best;
  }, null);
};

const skip = (offset: number, size: number, end: number): number | null => {
  const next = offset + size;
  return next <= end ? next : null;
};

const readSamples = (
  bytes: Uint8Array,
  entry: DirectoryEntry,
): TrackSample[] => {
  const view = viewOf(bytes);
  const end = Math.min(bytes.length, entry.offset + Math.max(0, entry.length));
  let cursor = entry.offset;
  const samples: TrackSample[] = [];
  if (cursor < 0 || cursor >= end) {
    return samples;
  }

  while (
    cursor + FRAME_HEADER_SIZE <= end &&
    samples.length < MAX_TRACK_SAMPLES
  ) {
    const type = view.getUint8(cursor);
    const time = view.getFloat32(cursor + 1, true);
    const frame = view.getInt32(cursor + 5, true);
    cursor += FRAME_HEADER_SIZE;

    if (type === FRAME_NEXT) {
      break;
    }
    if (type === FRAME_SYNC) {
      continue;
    }
    if (type === FRAME_CONSOLE) {
      const next = skip(cursor, CONSOLE_FIELD_SIZE, end);
      if (next == null) break;
      cursor = next;
      continue;
    }
    if (type === FRAME_CLIENT) {
      const next = skip(cursor, 32, end);
      if (next == null) break;
      cursor = next;
      continue;
    }
    if (type === FRAME_EVENT) {
      const next = skip(cursor, 84, end);
      if (next == null) break;
      cursor = next;
      continue;
    }
    if (type === FRAME_WEAPON) {
      const next = skip(cursor, 8, end);
      if (next == null) break;
      cursor = next;
      continue;
    }
    if (type === FRAME_SOUND) {
      if (cursor + 8 > end) break;
      const length = view.getInt32(cursor + 4, true);
      if (length < 0 || length > 1_000_000) break;
      const next = skip(cursor, 8 + length + 16, end);
      if (next == null) break;
      cursor = next;
      continue;
    }
    if (type === FRAME_BUFFER) {
      if (cursor + 4 > end) break;
      const length = view.getInt32(cursor, true);
      if (length < 0 || length > 1_000_000) break;
      const next = skip(cursor, 4 + length, end);
      if (next == null) break;
      cursor = next;
      continue;
    }

    if (cursor + NET_MESSAGE_PREFIX + 4 > end) {
      break;
    }
    if (cursor + SIMORG_OFFSET + 12 <= end && Number.isFinite(time)) {
      const pitch = view.getFloat32(cursor + VIEWANGLES_OFFSET, true);
      const yaw = view.getFloat32(cursor + VIEWANGLES_OFFSET + 4, true);
      const velocityX = view.getFloat32(cursor + SIMVEL_OFFSET, true);
      const velocityY = view.getFloat32(cursor + SIMVEL_OFFSET + 4, true);
      const speed = Math.hypot(velocityX, velocityY);
      const groundEntity = view.getInt32(cursor + ONGROUND_OFFSET, true);
      const hasCommand = cursor + BUTTONS_OFFSET + 2 <= end;
      const forward = hasCommand
        ? view.getFloat32(cursor + FORWARD_OFFSET, true)
        : 0;
      const side = hasCommand ? view.getFloat32(cursor + SIDE_OFFSET, true) : 0;
      const sample = {
        frame,
        time,
        x: view.getFloat32(cursor + SIMORG_OFFSET, true),
        y: view.getFloat32(cursor + SIMORG_OFFSET + 4, true),
        z: view.getFloat32(cursor + SIMORG_OFFSET + 8, true),
        pitch: Number.isFinite(pitch) ? pitch : 0,
        yaw: Number.isFinite(yaw) ? yaw : 0,
        speed: Number.isFinite(speed) ? speed : 0,
        onground: groundEntity > 0,
        buttons: hasCommand ? view.getUint16(cursor + BUTTONS_OFFSET, true) : 0,
        forward: Number.isFinite(forward) ? forward : 0,
        side: Number.isFinite(side) ? side : 0,
      };
      if (
        Number.isFinite(sample.time) &&
        Number.isFinite(sample.x) &&
        Number.isFinite(sample.y) &&
        Number.isFinite(sample.z) &&
        Math.abs(sample.x) < 100_000 &&
        Math.abs(sample.y) < 100_000 &&
        Math.abs(sample.z) < 100_000
      ) {
        samples.push(sample);
      }
    }
    const messageLength = view.getInt32(cursor + NET_MESSAGE_PREFIX, true);
    if (messageLength < 0 || messageLength > 1_000_000) {
      break;
    }
    const next = skip(cursor, NET_MESSAGE_PREFIX + 4 + messageLength, end);
    if (next == null) break;
    cursor = next;
  }

  return samples;
};

/** Samples are already finite. This only thins a long path down to `limit`. */
const thinSamples = (samples: TrackSample[], limit: number): TrackSample[] => {
  if (samples.length <= limit) {
    return samples;
  }
  const stride = Math.ceil(samples.length / limit);
  const thinned = samples.filter((_, index) => index % stride === 0);
  const last = samples[samples.length - 1];
  if (thinned[thinned.length - 1] !== last) {
    thinned.push(last);
  }
  return thinned;
};

export const readDemoTrack = (bytes: Uint8Array): DemoTrack | null => {
  if (bytes.length < HEADER_SIZE || bytes.length > MAX_DEMO_BYTES) {
    return null;
  }
  const magic = readAscii(bytes, 0, 8);
  if (magic !== "HLDEMO") {
    return null;
  }
  const mapName = readAscii(bytes, 16, 260);
  const entries = readDirectory(bytes);
  const entry = playbackEntry(entries);
  const duration = entry && entry.time > 0 ? entry.time : 0;
  const hud = entry ? readSamples(bytes, entry) : [];
  return {
    mapName,
    duration,
    samples: thinSamples(hud, 2000),
    hud,
  };
};

/** Latest sample at or before `time`. */
export const sampleAt = (
  samples: TrackSample[],
  time: number,
): TrackSample | null => {
  if (samples.length === 0) {
    return null;
  }
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (samples[mid].time <= time) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return samples[low];
};

export type AirJump = {
  takeoff: number;
  gain: number;
};

/**
 * Takeoff speed for the jump that is in the air at `time`.
 * Takeoff is the last grounded sample. Gain is the speed change since then.
 */
export const airJump = (
  samples: TrackSample[],
  time: number,
): AirJump | null => {
  if (samples.length === 0) {
    return null;
  }
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (samples[mid].time <= time) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  if (samples[low].onground) {
    return null;
  }
  let firstAir = low;
  while (firstAir > 0 && !samples[firstAir - 1].onground) {
    firstAir -= 1;
  }
  const takeoff =
    firstAir > 0 ? samples[firstAir - 1].speed : samples[firstAir].speed;
  return { takeoff, gain: samples[low].speed - takeoff };
};

const commandWord = (bytes: Uint8Array, start: number, end: number): string =>
  latin1
    .decode(bytes.subarray(start, end))
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase() ?? "";

/**
 * Blank dangerous console commands stored in type-3 frames.
 * The 64-byte field is the command string. Commands inside net-message
 * stufftext are not visible here; the engine should ignore those.
 */
export const sanitizeDemoCommands = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length < HEADER_SIZE || bytes.length > MAX_DEMO_BYTES) {
    return bytes;
  }
  const entries = readDirectory(bytes);
  const blanks: Array<[number, number]> = [];
  for (const entry of entries) {
    const view = viewOf(bytes);
    const end = Math.min(
      bytes.length,
      entry.offset + Math.max(0, entry.length),
    );
    let cursor = entry.offset;
    if (cursor < 0 || cursor >= end) {
      continue;
    }
    let seen = 0;
    while (cursor + FRAME_HEADER_SIZE <= end && seen < MAX_TRACK_SAMPLES) {
      seen += 1;
      const type = view.getUint8(cursor);
      cursor += FRAME_HEADER_SIZE;
      if (type === FRAME_NEXT) {
        break;
      }
      if (type === FRAME_SYNC) {
        continue;
      }
      if (type === FRAME_CONSOLE) {
        const fieldEnd = Math.min(end, cursor + CONSOLE_FIELD_SIZE);
        let textEnd = cursor;
        while (textEnd < fieldEnd && bytes[textEnd] !== 0) {
          textEnd += 1;
        }
        let segment = cursor;
        for (let index = cursor; index <= textEnd; index += 1) {
          if (index < textEnd && bytes[index] !== 59 && bytes[index] !== 10) {
            continue;
          }
          if (BLOCKED_DEMO_COMMANDS.has(commandWord(bytes, segment, index))) {
            blanks.push([segment, index]);
          }
          segment = index + 1;
        }
        const next = skip(cursor, CONSOLE_FIELD_SIZE, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (type === FRAME_CLIENT) {
        const next = skip(cursor, 32, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (type === FRAME_EVENT) {
        const next = skip(cursor, 84, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (type === FRAME_WEAPON) {
        const next = skip(cursor, 8, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (type === FRAME_SOUND) {
        if (cursor + 8 > end) break;
        const length = view.getInt32(cursor + 4, true);
        if (length < 0 || length > 1_000_000) break;
        const next = skip(cursor, 8 + length + 16, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (type === FRAME_BUFFER) {
        if (cursor + 4 > end) break;
        const length = view.getInt32(cursor, true);
        if (length < 0 || length > 1_000_000) break;
        const next = skip(cursor, 4 + length, end);
        if (next == null) break;
        cursor = next;
        continue;
      }
      if (cursor + NET_MESSAGE_PREFIX + 4 > end) {
        break;
      }
      const messageLength = view.getInt32(cursor + NET_MESSAGE_PREFIX, true);
      if (messageLength < 0 || messageLength > 1_000_000) {
        break;
      }
      const next = skip(cursor, NET_MESSAGE_PREFIX + 4 + messageLength, end);
      if (next == null) break;
      cursor = next;
    }
  }
  if (blanks.length === 0) {
    return bytes;
  }
  const out = bytes.slice();
  for (const [start, end] of blanks) {
    out.fill(32, start, end);
  }
  return out;
};

/**
 * Stock Xash WASM often fails on the LOADING directory segment
 * (`Demo message length < 0`). Keep only the Playback segment.
 */
export const prepareDemoForEngine = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length < HEADER_SIZE) {
    return bytes;
  }
  const entries = readDirectory(bytes);
  const entry = playbackEntry(entries);
  if (!entry || entry.length <= 0 || entry.offset < HEADER_SIZE) {
    return bytes;
  }
  const end = Math.min(bytes.length, entry.offset + entry.length);
  if (end <= entry.offset) {
    return bytes;
  }
  const playback = bytes.subarray(entry.offset, end);
  const directoryOffset = HEADER_SIZE + playback.length;
  const out = new Uint8Array(directoryOffset + 4 + ENTRY_SIZE);
  out.set(bytes.subarray(0, HEADER_SIZE), 0);
  out.set(playback, HEADER_SIZE);
  const view = new DataView(out.buffer);
  view.setInt32(540, directoryOffset, true);
  view.setInt32(directoryOffset, 1, true);
  const entryStart = directoryOffset + 4;
  // id / flags
  view.setInt32(entryStart, 1, true);
  const title = "Playback";
  for (let index = 0; index < 64; index += 1) {
    out[entryStart + 4 + index] =
      index < title.length ? title.charCodeAt(index) : 0;
  }
  view.setInt32(entryStart + 68, 0, true);
  view.setInt32(entryStart + 72, 0, true);
  view.setFloat32(entryStart + 76, entry.time, true);
  view.setInt32(entryStart + 80, entry.frames, true);
  view.setInt32(entryStart + 84, HEADER_SIZE, true);
  view.setInt32(entryStart + 88, playback.length, true);
  return out;
};

/**
 * Demo-file time of the first use press. That is the KZ start button.
 * Missing a press keeps the run aligned at the beginning of the file.
 */
export const timerStartTime = (samples: TrackSample[]): number => {
  let held = false;
  for (const sample of samples) {
    const use = (sample.buttons & BUTTON.use) !== 0;
    if (use && !held) {
      return sample.time;
    }
    held = use;
  }
  return 0;
};
