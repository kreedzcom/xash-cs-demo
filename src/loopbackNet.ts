import { ErrNoLocation, type EmNet } from "xash3d-fwgs";

interface Packet {
  data: Int8Array;
  ip: [number, number, number, number];
  port: number;
}

interface LoopSocket {
  id: number;
  family: number;
  type: number;
  protocol: number;
  addr?: { addr: string; port: number };
  inbox: Packet[];
}

/** Minimal Emscripten surface used by the loopback net backend. */
interface EmRuntime {
  HEAPU8: Uint8Array;
  HEAP8: Int8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  setValue: (ptr: number, value: number, type: string) => void;
  writeArrayToMemory: (array: number[], ptr: number) => void;
  intArrayFromString: (text: string, dontAddNull?: boolean) => number[];
  writeSockaddr: (
    sa: number,
    family: number,
    addr: string,
    port: number,
    addrlen: number,
  ) => number;
  readSockaddr: (sa: number, salen: number) => { addr: string; port: number };
  _malloc: (size: number) => number;
}

const MAX_INBOX = 128;

/**
 * Per-socket UDP loopback for local listen-server / demo signon.
 * A single shared packet queue corrupts the GoldSrc connection (svc_bad).
 */
export class LoopbackNet implements EmNet {
  private em?: EmRuntime;
  private lastSocketId = 1000;
  private readonly sockets = new Map<number, LoopSocket>();

  init(em: unknown): void {
    if (this.em) {
      return;
    }
    this.em = em as EmRuntime;
  }

  private readSockaddrFast(
    addrPtr: number,
  ): [[number, number, number, number], number] {
    const heapU8 = this.em!.HEAPU8;
    const ipOffset = addrPtr + 4;
    const ip: [number, number, number, number] = [
      heapU8[ipOffset],
      heapU8[ipOffset + 1],
      heapU8[ipOffset + 2],
      heapU8[ipOffset + 3],
    ];
    const port = (heapU8[addrPtr + 2] << 8) | heapU8[addrPtr + 3];
    return [ip, port];
  }

  recvfrom(
    fd: number,
    bufPtr: number,
    bufLen: number,
    _flags: number,
    sockaddrPtr: number,
    socklenPtr: number,
  ): number {
    const sock = this.sockets.get(fd);
    const packet = sock?.inbox.shift();
    if (!packet || !this.em) {
      this.em?.setValue(ErrNoLocation(this.em as never), 73, "i32");
      return -1;
    }
    const copyLen = Math.min(bufLen, packet.data.length);
    if (copyLen > 0) {
      this.em.HEAPU8.set(
        Uint8Array.from(packet.data.subarray(0, copyLen)),
        bufPtr,
      );
    }
    if (sockaddrPtr) {
      const heap8 = this.em.HEAP8;
      const heap16 = this.em.HEAP16;
      const base16 = sockaddrPtr >> 1;
      heap16[base16] = 2;
      heap8[sockaddrPtr + 2] = (packet.port >> 8) & 0xff;
      heap8[sockaddrPtr + 3] = packet.port & 0xff;
      heap8[sockaddrPtr + 4] = packet.ip[0];
      heap8[sockaddrPtr + 5] = packet.ip[1];
      heap8[sockaddrPtr + 6] = packet.ip[2];
      heap8[sockaddrPtr + 7] = packet.ip[3];
    }
    if (socklenPtr) {
      this.em.HEAP32[socklenPtr >> 2] = 16;
    }
    return copyLen;
  }

  sendto(
    fd: number,
    bufPtr: number,
    bufLen: number,
    _flags: number,
    sockaddrPtr: number,
    socklenPtr?: number,
  ): number {
    void socklenPtr;
    if (!this.em) {
      return -1;
    }
    const [, destPort] = this.readSockaddrFast(sockaddrPtr);
    const data = Int8Array.from(
      this.em.HEAPU8.subarray(bufPtr, bufPtr + bufLen),
    );
    const source = this.sockets.get(fd);
    const sourcePort = source?.addr?.port ?? 27015;
    const sourceIp: [number, number, number, number] = [127, 0, 0, 1];

    let dest =
      [...this.sockets.values()].find(
        (socket) => socket.id !== fd && socket.addr?.port === destPort,
      ) ?? [...this.sockets.values()].find((socket) => socket.id !== fd);

    if (!dest) {
      dest = source;
    }
    if (!dest) {
      return bufLen;
    }
    if (dest.inbox.length >= MAX_INBOX) {
      dest.inbox.shift();
    }
    dest.inbox.push({ data, ip: sourceIp, port: sourcePort });
    return bufLen;
  }

  sendtoBatch(
    fd: number,
    bufsPtr: number,
    lensPtr: number,
    count: number,
    flags: number,
    sockaddrPtr: number,
    socklenPtr: number,
  ): number {
    if (!this.em) {
      return -1;
    }
    let total = 0;
    const heap32 = this.em.HEAP32;
    for (let index = 0; index < count; index += 1) {
      const size = heap32[(lensPtr >> 2) + index];
      const packetPtr = heap32[(bufsPtr >> 2) + index];
      total += this.sendto(fd, packetPtr, size, flags, sockaddrPtr, socklenPtr);
    }
    return total;
  }

  socket(family: number, type: number, protocol: number): number {
    const id = this.lastSocketId;
    this.lastSocketId += 1;
    this.sockets.set(id, {
      id,
      family,
      type,
      protocol,
      inbox: [],
    });
    return id;
  }

  gethostbyname(_hostnamePtr: number): number {
    void _hostnamePtr;
    return 0;
  }

  gethostname(namePtr: number, namelenPtr: number): number {
    void namelenPtr;
    if (!this.em) {
      return -1;
    }
    this.em.writeArrayToMemory(
      this.em.intArrayFromString("webxash3d.local", true),
      namePtr,
    );
    return 0;
  }

  getsockname(fd: number, sockaddrPtr: number, socklenPtr: number): number {
    const sock = this.sockets.get(fd);
    if (!sock || !this.em) {
      return -1;
    }
    this.em.writeSockaddr(
      sockaddrPtr,
      sock.family,
      sock.addr?.addr ?? "127.0.0.1",
      sock.addr?.port ?? 0,
      socklenPtr,
    );
    return 0;
  }

  bind(fd: number, sockaddrPtr: number, socklenPtr: number): number {
    const sock = this.sockets.get(fd);
    if (!sock || !this.em) {
      return -1;
    }
    sock.addr = this.em.readSockaddr(sockaddrPtr, socklenPtr);
    return 0;
  }

  closesocket(fd: number): number {
    return this.sockets.delete(fd) ? 0 : -1;
  }

  getaddrinfo(
    _hostnamePtr: number,
    _restrictPrt: number,
    _hintsPtr: number,
    addrinfoPtr: number,
  ): number {
    if (!this.em) {
      return -1;
    }
    const sa = this.em._malloc(16);
    this.em.writeSockaddr(sa, 2, "127.0.0.1", 0, 0);
    const ai = this.em._malloc(32);
    this.em.HEAP32[(ai + 4) >> 2] = 2;
    this.em.HEAP32[(ai + 8) >> 2] = 2;
    this.em.HEAP32[(ai + 12) >> 2] = 17;
    this.em.HEAPU32[(ai + 20) >> 2] = sa;
    this.em.HEAP32[(ai + 16) >> 2] = 16;
    this.em.HEAPU32[(ai + 24) >> 2] = 0;
    this.em.HEAP32[(ai + 28) >> 2] = 0;
    this.em.HEAPU32[addrinfoPtr >> 2] = ai;
    return 0;
  }
}
