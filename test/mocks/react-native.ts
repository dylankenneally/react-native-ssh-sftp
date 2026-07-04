/**
 * Hand-written stub of the `react-native` module for unit testing `SSHClient`.
 *
 * The real `react-native` package only resolves inside a React Native runtime, so
 * `vitest.config.ts` aliases `react-native` to this file. It exposes exactly the
 * surface `src/sshclient.ts` touches:
 *   - `NativeModules.RNSSHClient` with a mock function per native method
 *   - `NativeEventEmitter` / `DeviceEventEmitter` backed by a shared listener store
 *   - `Platform` (mutable `OS`)
 *   - the `EmitterSubscription` type
 *
 * Tests import the helpers below to drive native callbacks, emit events, switch
 * platform, and reset state between cases.
 */
import { vi } from 'vitest';

// A native callback: (error, response?). Native methods invoke this asynchronously
// in the real bridge; the mocks call it synchronously unless a test defers it.
export type NativeCallback = (error: unknown, response?: unknown) => void;

/**
 * Every native method the `SSHClient` class invokes. Each is a `vi.fn()` so tests
 * can assert call arguments and provide per-case implementations that drive the
 * success or error path.
 */
export const RNSSHClient: Record<string, ReturnType<typeof vi.fn>> = {
  // Key utilities (promise-based on the native side).
  getKeyDetails: vi.fn(),
  generateKeyPair: vi.fn(),

  // Connection.
  connectToHost: vi.fn(), // iOS
  connectToHostByPassword: vi.fn(), // Android
  connectToHostByKey: vi.fn(), // Android

  // Command execution + shell.
  execute: vi.fn(),
  startShell: vi.fn(),
  writeToShell: vi.fn(),
  closeShell: vi.fn(),

  // SFTP.
  connectSFTP: vi.fn(),
  sftpLs: vi.fn(),
  sftpRename: vi.fn(),
  sftpMkdir: vi.fn(),
  sftpRm: vi.fn(),
  sftpRmdir: vi.fn(),
  sftpChmod: vi.fn(),
  sftpUpload: vi.fn(),
  sftpCancelUpload: vi.fn(),
  sftpDownload: vi.fn(),
  sftpCancelDownload: vi.fn(),
  disconnectSFTP: vi.fn(),
  disconnect: vi.fn(),
};

export const NativeModules = { RNSSHClient };

/** Subscription returned by `addListener`, mirroring RN's `EmitterSubscription`. */
export interface EmitterSubscription {
  remove: () => void;
}

interface ListenerEntry {
  eventName: string;
  handler: (value: unknown) => void;
}

// Both NativeEventEmitter (iOS) and DeviceEventEmitter (Android) delegate to this
// single store. `handleEvent` filters by client key, so a single emit reaches the
// right client regardless of which emitter registered the listener.
const listeners: ListenerEntry[] = [];

function addListener(eventName: string, handler: (value: unknown) => void): EmitterSubscription {
  const entry: ListenerEntry = { eventName, handler };
  listeners.push(entry);
  return {
    remove: () => {
      const index = listeners.indexOf(entry);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
  };
}

export class NativeEventEmitter {
  constructor(_nativeModule?: unknown) {
    // Mirrors RN's NativeEventEmitter(nativeModule) signature; the arg is unused.
  }
  addListener(eventName: string, handler: (value: unknown) => void): EmitterSubscription {
    return addListener(eventName, handler);
  }
}

export const DeviceEventEmitter = {
  addListener(eventName: string, handler: (value: unknown) => void): EmitterSubscription {
    return addListener(eventName, handler);
  },
};

/** Mutable platform indicator. Toggle with `setPlatform` in tests. */
export const Platform: { OS: 'ios' | 'android' } = { OS: 'ios' };

/* ---------------------------------------------------------------------------
 * Test helpers (not part of the real react-native API)
 * ------------------------------------------------------------------------ */

/** Sets the simulated platform for the current test. */
export function setPlatform(os: 'ios' | 'android'): void {
  Platform.OS = os;
}

/** Dispatches an event to every listener registered for `eventName`. */
export function emitNativeEvent(eventName: string, payload: unknown): void {
  listeners
    .filter((entry) => entry.eventName === eventName)
    .forEach((entry) => entry.handler(payload));
}

/** Number of active listeners, optionally scoped to a single event name. */
export function listenerCount(eventName?: string): number {
  return eventName ? listeners.filter((entry) => entry.eventName === eventName).length : listeners.length;
}

/**
 * Resets all native mocks, clears listeners, and restores the default platform.
 * Call from a `beforeEach` so tests are independent.
 */
export function resetMocks(): void {
  listeners.length = 0;
  Platform.OS = 'ios';
  Object.values(RNSSHClient).forEach((fn) => fn.mockReset());
}
