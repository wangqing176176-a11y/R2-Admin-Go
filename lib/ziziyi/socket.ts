// The embedded editor mirrors socket.io's variadic event API, whose payloads differ by event.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any[]) => void;

class Emitter {
  private listeners = new Map<string, Set<Callback>>();

  on(event: string, listener: Callback) {
    const listeners = this.listeners.get(event) ?? new Set<Callback>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  once(event: string, listener: Callback) {
    const wrapped: Callback = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, listener?: Callback) {
    if (!listener) {
      this.listeners.delete(event);
      return;
    }
    const listeners = this.listeners.get(event);
    listeners?.delete(listener);
    if (!listeners?.size) this.listeners.delete(event);
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) listener(...args);
  }

  clear(event?: string) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }
}

/** Browser-local socket.io-compatible transport used by the ZIZIYI editor. */
export class MockSocket {
  private static staticEmitter = new Emitter();

  static on(event: string, listener: Callback) {
    MockSocket.staticEmitter.on(event, listener);
  }

  static off(event: string, listener?: Callback) {
    MockSocket.staticEmitter.off(event, listener);
  }

  active = true;
  connected = false;
  disconnected = true;
  recovered = false;
  id = "";
  io = {
    setOpenToken: () => undefined,
    setSessionToken: () => undefined,
    on: () => undefined,
    reconnectionAttempts: () => undefined,
    reconnectionDelay: () => undefined,
    reconnectionDelayMax: () => undefined,
    timeout: () => undefined,
    transports: () => undefined,
    upgrade: () => undefined,
    upgradeTransport: () => undefined,
    upgradeTimeout: () => undefined,
  };

  private clientEmitter = new Emitter();
  private serverEmitter = new Emitter();

  constructor() {
    this.connect();
  }

  open() {
    return this.connect();
  }

  compress() {
    return this;
  }

  connect() {
    this.connected = true;
    this.disconnected = false;
    this.id = Math.random().toString(36).slice(2, 15);
    window.setTimeout(() => {
      this.clientEmitter.emit("connect");
      MockSocket.staticEmitter.emit("connect", { socket: this });
    }, 0);
    return this;
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    this.clientEmitter.emit("disconnect");
    MockSocket.staticEmitter.emit("disconnect", { socket: this });
    return this;
  }

  close() {
    return this.disconnect();
  }

  on(event: string, listener: Callback) {
    this.clientEmitter.on(event, listener);
    return this;
  }

  once(event: string, listener: Callback) {
    this.clientEmitter.once(event, listener);
    return this;
  }

  off(event: string, listener?: Callback) {
    this.clientEmitter.off(event, listener);
    return this;
  }

  removeAllListeners(event?: string) {
    this.clientEmitter.clear(event);
    return this;
  }

  send(...args: unknown[]) {
    return this.emit("message", ...args);
  }

  emit(event: string, ...args: unknown[]) {
    if (this.connected) window.setTimeout(() => this.serverEmitter.emit(event, ...args), 0);
    return this;
  }

  server = {
    on: (event: string, listener: Callback) => this.serverEmitter.on(event, listener),
    off: (event: string, listener?: Callback) => this.serverEmitter.off(event, listener),
    emit: (event: string, ...args: unknown[]) => this.clientEmitter.emit(event, ...args),
  };
}

export default function io() {
  return new MockSocket();
}
