const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const isSafeRelativePath = (name: string): boolean =>
  name.length > 0 &&
  name.length <= 120 &&
  !name.startsWith("/") &&
  !name.split("/").includes("..");

const findEndOfCentralDirectory = (view: DataView): number => {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
};

const inflateRaw = async (
  compressed: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> => {
  const source = new Blob([compressed as BlobPart]).stream();
  const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = inflated.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancelled = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        cancelled = true;
        await reader.cancel();
        throw new Error("uncompressed limit");
      }
      chunks.push(value);
    }
  } finally {
    if (!cancelled) {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const INFLATE_CONCURRENCY = 12;
/** Stop unpacking once inflated bytes pass this, so a zip bomb cannot fill memory. */
export const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

export interface ExtractZipOptions {
  concurrency?: number;
  maxUncompressedBytes?: number;
}

type PackedEntry = {
  name: string;
  method: number;
  compressed: Uint8Array;
};

/** Reads selected files out of a pk3 so they can be written as real files. */
export const extractZipEntries = async (
  archive: Uint8Array,
  include: (name: string) => boolean,
  options: ExtractZipOptions = {},
): Promise<ZipEntry[]> => {
  const maxUncompressed =
    options.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES;
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const end = findEndOfCentralDirectory(view);
  if (end < 0) {
    return [];
  }
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const packed: PackedEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > archive.byteLength) {
      break;
    }
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      break;
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    // Packs built on Windows store models\v_usp.mdl. Xash looks up models/v_usp.mdl.
    const name = new TextDecoder("utf-8")
      .decode(archive.subarray(nameStart, nameStart + nameLength))
      .replace(/\\/g, "/");
    cursor = nameStart + nameLength + extraLength + commentLength;
    if (index % 400 === 399) {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    if (!isSafeRelativePath(name) || name.endsWith("/") || !include(name)) {
      continue;
    }
    if (
      localOffset + 30 > archive.byteLength ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      continue;
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.byteLength || (method !== 0 && method !== 8)) {
      continue;
    }
    packed.push({
      name,
      method,
      compressed: archive.subarray(dataStart, dataEnd),
    });
  }

  const entries: Array<ZipEntry | null> = new Array(packed.length).fill(null);
  let next = 0;
  let uncompressed = 0;
  const workerCount = Math.min(
    options.concurrency ?? INFLATE_CONCURRENCY,
    Math.max(packed.length, 1),
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < packed.length) {
        const index = next;
        next += 1;
        const entry = packed[index];
        if (!entry) {
          return;
        }
        if (uncompressed >= maxUncompressed) {
          return;
        }
        try {
          const bytes =
            entry.method === 0
              ? entry.compressed
              : await inflateRaw(
                  entry.compressed,
                  maxUncompressed - uncompressed,
                );
          if (uncompressed + bytes.length > maxUncompressed) {
            return;
          }
          uncompressed += bytes.length;
          entries[index] = { name: entry.name, bytes };
        } catch {
          // This entry stays inside the pk3.
        }
      }
    }),
  );

  return entries.filter((entry): entry is ZipEntry => entry != null);
};

const PLAYER_MODEL_PATH =
  /^models\/player\/[a-z0-9_]{1,32}\/[a-z0-9_]{1,32}\.mdl$/;

export const extractPlayerModels = (archive: Uint8Array): Promise<ZipEntry[]> =>
  extractZipEntries(archive, (name) =>
    PLAYER_MODEL_PATH.test(name.toLowerCase()),
  );
